import { beforeAll, describe, expect, it } from 'vitest';
import { adminClient, createUser, supabaseReachable, uniq, userClient } from '../helpers/supabase';

const reachable = await supabaseReachable();

const sub = (p: string) => uniq(p).toLowerCase().replace(/[^a-z0-9-]/g, '');

/**
 * Settings + client self-service profile rely on RLS: only the owner may update
 * their tenant's branding, and a client may edit only their own row. These are
 * the guarantees the `/api/settings` and `/api/me` routes lean on.
 */
describe.skipIf(!reachable)('Settings & profile RLS', () => {
  const admin = adminClient();

  let tenantId: string;
  let ownerEmail: string;
  let managerEmail: string;
  let clientEmail: string;
  let otherClientId: string;

  beforeAll(async () => {
    ownerEmail = `${uniq('owner')}@example.com`;
    managerEmail = `${uniq('manager')}@example.com`;
    clientEmail = `${uniq('client')}@example.com`;

    const ownerId = await createUser(ownerEmail);
    const t = await admin.rpc('provision_tenant', {
      p_owner_user_id: ownerId,
      p_name: 'Settings Tenant',
      p_subdomain: sub('settings'),
      p_plan_code: 'growth',
    });
    if (t.error) throw new Error(t.error.message);
    tenantId = t.data!.id;

    const managerId = await createUser(managerEmail);
    const m = await admin
      .from('team_members')
      .insert({ tenant_id: tenantId, user_id: managerId, role: 'manager' });
    if (m.error) throw new Error(m.error.message);

    const clientUserId = await createUser(clientEmail);
    const c = await admin
      .from('clients')
      .insert({ tenant_id: tenantId, user_id: clientUserId, full_name: 'Client One', email: clientEmail })
      .select()
      .single();
    if (c.error) throw new Error(c.error.message);

    const other = await admin
      .from('clients')
      .insert({ tenant_id: tenantId, full_name: 'Client Two', email: `${uniq('c2')}@example.com` })
      .select()
      .single();
    if (other.error) throw new Error(other.error.message);
    otherClientId = other.data.id;
  });

  it('owner can update tenant name and branding', async () => {
    const supa = await userClient(ownerEmail);
    const { data, error } = await supa
      .from('tenants')
      .update({ name: 'Renamed Gym', branding: { primaryColor: '#123ABC', tagline: 'Go hard' } })
      .eq('id', tenantId)
      .select('name, branding')
      .single();
    expect(error).toBeNull();
    expect(data?.name).toBe('Renamed Gym');
    expect((data?.branding as { primaryColor?: string })?.primaryColor).toBe('#123ABC');
  });

  it('a manager (non-owner) cannot update the tenant', async () => {
    const supa = await userClient(managerEmail);
    const { data } = await supa
      .from('tenants')
      .update({ name: 'Manager Rename' })
      .eq('id', tenantId)
      .select('id');
    // RLS `tenants_update` is owner-only, so the update matches no rows.
    expect(data ?? []).toHaveLength(0);
  });

  it('a client can update their own name/phone but not another client', async () => {
    const supa = await userClient(clientEmail);

    const mine = await supa
      .from('clients')
      .update({ full_name: 'Client One Updated', phone: '+911234567890' })
      .eq('user_id', (await supa.auth.getUser()).data.user!.id)
      .select('full_name, phone')
      .single();
    expect(mine.error).toBeNull();
    expect(mine.data?.full_name).toBe('Client One Updated');
    expect(mine.data?.phone).toBe('+911234567890');

    const theirs = await supa
      .from('clients')
      .update({ full_name: 'Hacked' })
      .eq('id', otherClientId)
      .select('id');
    expect(theirs.data ?? []).toHaveLength(0);
  });

  it('a client can insert and read their own health form versions', async () => {
    const supa = await userClient(clientEmail);
    const clientId = (
      await supa.from('clients').select('id').eq('email', clientEmail).single()
    ).data!.id;

    const ins = await supa
      .from('health_forms')
      .insert({ tenant_id: tenantId, client_id: clientId, data: { weightKg: '72' } })
      .select('version')
      .single();
    expect(ins.error).toBeNull();
    expect(ins.data?.version).toBeGreaterThanOrEqual(1);

    const list = await supa.from('health_forms').select('*').eq('client_id', clientId);
    expect(list.error).toBeNull();
    expect((list.data ?? []).length).toBeGreaterThanOrEqual(1);
  });
});
