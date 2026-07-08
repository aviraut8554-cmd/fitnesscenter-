import { beforeAll, describe, expect, it } from 'vitest';
import { adminClient, createUser, supabaseReachable, uniq, userClient } from '../helpers/supabase';

const reachable = await supabaseReachable();

/**
 * Verifies multi-tenant isolation: RLS must guarantee zero cross-tenant
 * visibility through the data API, even when a caller knows another tenant's
 * ids. This is the "access-unlock / isolation" logic the PRD requires tests for.
 */
describe.skipIf(!reachable)('RLS multi-tenant isolation', () => {
  const admin = adminClient();

  let tenantA: string;
  let tenantB: string;
  let ownerAEmail: string;
  let ownerBEmail: string;
  let clientAEmail: string;
  let clientAId: string;
  let clientBId: string;

  beforeAll(async () => {
    ownerAEmail = `${uniq('ownerA')}@example.com`;
    ownerBEmail = `${uniq('ownerB')}@example.com`;
    clientAEmail = `${uniq('clientA')}@example.com`;

    const ownerAId = await createUser(ownerAEmail);
    const ownerBId = await createUser(ownerBEmail);

    const a = await admin.rpc('provision_tenant', {
      p_owner_user_id: ownerAId,
      p_name: 'Tenant A',
      p_subdomain: uniq('tenant-a').toLowerCase().replace(/[^a-z0-9-]/g, ''),
    });
    if (a.error) throw new Error(a.error.message);
    tenantA = a.data!.id;

    const b = await admin.rpc('provision_tenant', {
      p_owner_user_id: ownerBId,
      p_name: 'Tenant B',
      p_subdomain: uniq('tenant-b').toLowerCase().replace(/[^a-z0-9-]/g, ''),
    });
    if (b.error) throw new Error(b.error.message);
    tenantB = b.data!.id;

    const clientAUserId = await createUser(clientAEmail);
    const cA = await admin
      .from('clients')
      .insert({
        tenant_id: tenantA,
        user_id: clientAUserId,
        full_name: 'Client A',
        email: clientAEmail,
      })
      .select()
      .single();
    if (cA.error) throw new Error(cA.error.message);
    clientAId = cA.data.id;

    const cB = await admin
      .from('clients')
      .insert({ tenant_id: tenantB, full_name: 'Client B', email: `${uniq('cb')}@example.com` })
      .select()
      .single();
    if (cB.error) throw new Error(cB.error.message);
    clientBId = cB.data.id;
  });

  it('owner sees only their own tenant clients', async () => {
    const supa = await userClient(ownerAEmail);
    const { data, error } = await supa.from('clients').select('id, tenant_id');
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.every((c) => c.tenant_id === tenantA)).toBe(true);
    expect(data!.some((c) => c.id === clientBId)).toBe(false);
  });

  it('owner cannot read another tenant client by id', async () => {
    const supa = await userClient(ownerAEmail);
    const { data } = await supa.from('clients').select('id').eq('id', clientBId).maybeSingle();
    expect(data).toBeNull();
  });

  it('owner B cannot see tenant A clients', async () => {
    const supa = await userClient(ownerBEmail);
    const { data } = await supa.from('clients').select('id').eq('id', clientAId).maybeSingle();
    expect(data).toBeNull();
  });

  it('a client can read only their own client row', async () => {
    const supa = await userClient(clientAEmail);
    const { data, error } = await supa.from('clients').select('id, tenant_id');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].id).toBe(clientAId);
  });

  it('a client cannot read the team roster', async () => {
    const supa = await userClient(clientAEmail);
    const { data } = await supa.from('team_members').select('id');
    expect(data).toEqual([]);
  });

  it('writes cannot spoof another tenant_id (RLS with check)', async () => {
    const supa = await userClient(ownerAEmail);
    const { error } = await supa.from('clients').insert({
      tenant_id: tenantB,
      full_name: 'Spoof',
      email: `${uniq('spoof')}@example.com`,
    });
    expect(error).not.toBeNull();
  });
});
