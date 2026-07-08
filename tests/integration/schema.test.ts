import { beforeAll, describe, expect, it } from 'vitest';
import { adminClient, createUser, supabaseReachable, uniq } from '../helpers/supabase';

const reachable = await supabaseReachable();

/** DB-level guarantees: versioning, single-owner, and booking-overlap constraint. */
describe.skipIf(!reachable)('schema constraints & triggers', () => {
  const admin = adminClient();
  let tenantId: string;
  let ownerId: string;
  let clientId: string;

  beforeAll(async () => {
    ownerId = await createUser(`${uniq('owner')}@example.com`);
    const t = await admin.rpc('provision_tenant', {
      p_owner_user_id: ownerId,
      p_name: 'Schema Tenant',
      p_subdomain: uniq('schema').toLowerCase().replace(/[^a-z0-9-]/g, ''),
      p_plan_code: 'starter',
    });
    if (t.error) throw new Error(t.error.message);
    tenantId = t.data!.id;

    const c = await admin
      .from('clients')
      .insert({ tenant_id: tenantId, full_name: 'C', email: `${uniq('c')}@example.com` })
      .select()
      .single();
    if (c.error) throw new Error(c.error.message);
    clientId = c.data.id;
  });

  it('provision_tenant seeds exactly one owner membership', async () => {
    const { data, error } = await admin
      .from('team_members')
      .select('role')
      .eq('tenant_id', tenantId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].role).toBe('owner');
  });

  it('rejects a second owner for the same tenant', async () => {
    const secondOwner = await createUser(`${uniq('owner2')}@example.com`);
    const { error } = await admin
      .from('team_members')
      .insert({ tenant_id: tenantId, user_id: secondOwner, role: 'owner' });
    expect(error).not.toBeNull();
  });

  it('auto-increments health form versions per client', async () => {
    const first = await admin
      .from('health_forms')
      .insert({ tenant_id: tenantId, client_id: clientId, data: { weight: 80 } })
      .select()
      .single();
    const second = await admin
      .from('health_forms')
      .insert({ tenant_id: tenantId, client_id: clientId, data: { weight: 79 } })
      .select()
      .single();
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(first.data!.version).toBe(1);
    expect(second.data!.version).toBe(2);
  });

  it('prevents overlapping bookings for the same coach', async () => {
    const { data: owner } = await admin
      .from('team_members')
      .select('id')
      .eq('tenant_id', tenantId)
      .single();
    const coachId = owner!.id;

    const start = new Date('2030-01-01T10:00:00Z').toISOString();
    const end = new Date('2030-01-01T11:00:00Z').toISOString();
    const overlapStart = new Date('2030-01-01T10:30:00Z').toISOString();
    const overlapEnd = new Date('2030-01-01T11:30:00Z').toISOString();

    const first = await admin.from('bookings').insert({
      tenant_id: tenantId,
      client_id: clientId,
      team_member_id: coachId,
      slot_start: start,
      slot_end: end,
    });
    expect(first.error).toBeNull();

    const overlapping = await admin.from('bookings').insert({
      tenant_id: tenantId,
      client_id: clientId,
      team_member_id: coachId,
      slot_start: overlapStart,
      slot_end: overlapEnd,
    });
    expect(overlapping.error).not.toBeNull();

    const adjacent = await admin.from('bookings').insert({
      tenant_id: tenantId,
      client_id: clientId,
      team_member_id: coachId,
      slot_start: end,
      slot_end: new Date('2030-01-01T12:00:00Z').toISOString(),
    });
    expect(adjacent.error).toBeNull();
  });
});
