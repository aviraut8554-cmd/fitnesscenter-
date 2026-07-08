import { beforeAll, describe, expect, it } from 'vitest';
import { adminClient, createUser, supabaseReachable, uniq, userClient } from '../helpers/supabase';

const reachable = await supabaseReachable();

/**
 * Phase 3b class management: verifies enrollment RLS (a client sees only their
 * own enrollment), owner/manager-only writes for classes/enrollments,
 * per-instructor scoping, auto-enrollment on a paid order, and attendance RLS.
 */
describe.skipIf(!reachable)('classes: enrollment/attendance RLS & auto-enroll', () => {
  const admin = adminClient();

  let tenantId: string;
  let ownerEmail: string;
  let managerEmail: string;
  let supportEmail: string;
  let clientEmail: string;
  let otherClientEmail: string;
  let ownerMemberId: string;
  let managerMemberId: string;
  let clientId: string;
  let otherClientId: string;
  let productId: string;
  let classId: string; // instructor = owner, linked to productId
  let otherClassId: string; // instructor = manager

  beforeAll(async () => {
    ownerEmail = `${uniq('ownercl')}@example.com`;
    managerEmail = `${uniq('managercl')}@example.com`;
    supportEmail = `${uniq('supportcl')}@example.com`;
    clientEmail = `${uniq('clientcl')}@example.com`;
    otherClientEmail = `${uniq('othercl')}@example.com`;

    const ownerId = await createUser(ownerEmail);
    const managerId = await createUser(managerEmail);
    const supportId = await createUser(supportEmail);
    const clientUserId = await createUser(clientEmail);
    const otherUserId = await createUser(otherClientEmail);

    const t = await admin.rpc('provision_tenant', {
      p_owner_user_id: ownerId,
      p_name: 'Class Tenant',
      p_subdomain: uniq('cltenant').toLowerCase().replace(/[^a-z0-9-]/g, ''),
    });
    if (t.error) throw new Error(t.error.message);
    tenantId = t.data!.id;

    const owner = await admin
      .from('team_members')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('user_id', ownerId)
      .single();
    if (owner.error) throw new Error(owner.error.message);
    ownerMemberId = owner.data.id;

    const mgr = await admin
      .from('team_members')
      .insert({ tenant_id: tenantId, user_id: managerId, role: 'manager' })
      .select()
      .single();
    if (mgr.error) throw new Error(mgr.error.message);
    managerMemberId = mgr.data.id;

    const sup = await admin
      .from('team_members')
      .insert({ tenant_id: tenantId, user_id: supportId, role: 'support' });
    if (sup.error) throw new Error(sup.error.message);

    const c = await admin
      .from('clients')
      .insert({ tenant_id: tenantId, user_id: clientUserId, full_name: 'CL Client', email: clientEmail, status: 'active' })
      .select()
      .single();
    if (c.error) throw new Error(c.error.message);
    clientId = c.data.id;

    const oc = await admin
      .from('clients')
      .insert({ tenant_id: tenantId, user_id: otherUserId, full_name: 'Other Client', email: otherClientEmail, status: 'active' })
      .select()
      .single();
    if (oc.error) throw new Error(oc.error.message);
    otherClientId = oc.data.id;

    const p = await admin
      .from('products_services')
      .insert({ tenant_id: tenantId, type: 'live_class', name: 'HIIT Batch', amount_minor: 150000 })
      .select()
      .single();
    if (p.error) throw new Error(p.error.message);
    productId = p.data.id;

    const cls = await admin
      .from('classes')
      .insert({ tenant_id: tenantId, title: 'Morning HIIT', instructor_id: ownerMemberId, product_id: productId, is_recorded: false })
      .select()
      .single();
    if (cls.error) throw new Error(cls.error.message);
    classId = cls.data.id;

    const cls2 = await admin
      .from('classes')
      .insert({ tenant_id: tenantId, title: 'Evening Yoga', instructor_id: managerMemberId, is_recorded: false })
      .select()
      .single();
    if (cls2.error) throw new Error(cls2.error.message);
    otherClassId = cls2.data.id;
  });

  it('auto-enrolls the buyer when their order for the class product is paid', async () => {
    const order = await admin
      .from('orders')
      .insert({ tenant_id: tenantId, client_id: clientId, product_id: productId, amount_minor: 150000, status: 'created' })
      .select()
      .single();
    expect(order.error).toBeNull();

    // No enrollment yet (order not paid).
    const before = await admin
      .from('enrollments')
      .select('id')
      .eq('class_id', classId)
      .eq('client_id', clientId);
    expect(before.data!.length).toBe(0);

    const paid = await admin.from('orders').update({ status: 'paid' }).eq('id', order.data!.id);
    expect(paid.error).toBeNull();

    const after = await admin
      .from('enrollments')
      .select('id, status')
      .eq('class_id', classId)
      .eq('client_id', clientId);
    expect(after.error).toBeNull();
    expect(after.data!.length).toBe(1);
    expect(after.data![0].status).toBe('active');
  });

  it('per-instructor scoping: each class carries its own instructor', async () => {
    const rows = await admin
      .from('classes')
      .select('id, instructor_id')
      .eq('tenant_id', tenantId)
      .in('id', [classId, otherClassId]);
    expect(rows.error).toBeNull();
    const map = new Map(rows.data!.map((r) => [r.id, r.instructor_id]));
    expect(map.get(classId)).toBe(ownerMemberId);
    expect(map.get(otherClassId)).toBe(managerMemberId);
    expect(map.get(classId)).not.toBe(map.get(otherClassId));
  });

  it('only owner/manager may write classes & enrollments; support cannot', async () => {
    const ownerSupa = await userClient(ownerEmail);
    const okEnroll = await ownerSupa
      .from('enrollments')
      .insert({ tenant_id: tenantId, class_id: otherClassId, client_id: otherClientId, status: 'active' });
    expect(okEnroll.error).toBeNull();

    const supportSupa = await userClient(supportEmail);
    const deniedClass = await supportSupa
      .from('classes')
      .insert({ tenant_id: tenantId, title: 'Sneaky class', is_recorded: false });
    expect(deniedClass.error).not.toBeNull();

    const deniedEnroll = await supportSupa
      .from('enrollments')
      .insert({ tenant_id: tenantId, class_id: classId, client_id: otherClientId, status: 'active' });
    expect(deniedEnroll.error).not.toBeNull();
  });

  it('a client sees only their own enrollments', async () => {
    const clientSupa = await userClient(clientEmail);
    const rows = await clientSupa.from('enrollments').select('id, client_id');
    expect(rows.error).toBeNull();
    expect(rows.data!.length).toBeGreaterThan(0);
    expect(rows.data!.every((e) => e.client_id === clientId)).toBe(true);

    const otherSupa = await userClient(otherClientEmail);
    const otherRows = await otherSupa.from('enrollments').select('id, client_id');
    expect(otherRows.error).toBeNull();
    expect(otherRows.data!.every((e) => e.client_id === otherClientId)).toBe(true);
  });

  it('team can mark attendance; a client cannot change another client’s attendance', async () => {
    const session = await admin
      .from('class_sessions')
      .insert({ tenant_id: tenantId, class_id: classId, starts_at: '2026-06-10T04:30:00Z', ends_at: '2026-06-10T05:30:00Z' })
      .select()
      .single();
    expect(session.error).toBeNull();

    const ownerSupa = await userClient(ownerEmail);
    const mark = await ownerSupa
      .from('attendance')
      .insert({ tenant_id: tenantId, class_session_id: session.data!.id, client_id: clientId, status: 'present', marked_at: new Date().toISOString() })
      .select()
      .single();
    expect(mark.error).toBeNull();

    // Another client cannot update someone else's attendance (update is team-only).
    const otherSupa = await userClient(otherClientEmail);
    const denied = await otherSupa
      .from('attendance')
      .update({ status: 'absent' })
      .eq('id', mark.data!.id)
      .select();
    // RLS filters the row out → no error but zero rows affected.
    expect(denied.error).toBeNull();
    expect(denied.data!.length).toBe(0);

    // The mark is unchanged.
    const check = await admin.from('attendance').select('status').eq('id', mark.data!.id).single();
    expect(check.data!.status).toBe('present');
  });
});
