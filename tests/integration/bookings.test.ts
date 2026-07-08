import { beforeAll, describe, expect, it } from 'vitest';
import { adminClient, createUser, supabaseReachable, uniq, userClient } from '../helpers/supabase';

const reachable = await supabaseReachable();

/**
 * Phase 3a booking: verifies the DB-level double-booking guard (gist exclusion),
 * the availability/settings write RLS (owner/manager only), and that clients can
 * book only for themselves and see only their own bookings.
 */
describe.skipIf(!reachable)('bookings: conflict constraint & RLS', () => {
  const admin = adminClient();

  let tenantId: string;
  let ownerEmail: string;
  let supportEmail: string;
  let clientEmail: string;
  let otherClientEmail: string;
  let coachMemberId: string;
  let clientId: string;
  let otherClientId: string;

  beforeAll(async () => {
    ownerEmail = `${uniq('ownerbk')}@example.com`;
    supportEmail = `${uniq('supportbk')}@example.com`;
    clientEmail = `${uniq('clientbk')}@example.com`;
    otherClientEmail = `${uniq('otherbk')}@example.com`;

    const ownerId = await createUser(ownerEmail);
    const supportId = await createUser(supportEmail);
    const clientUserId = await createUser(clientEmail);
    const otherUserId = await createUser(otherClientEmail);

    const t = await admin.rpc('provision_tenant', {
      p_owner_user_id: ownerId,
      p_name: 'Booking Tenant',
      p_subdomain: uniq('bktenant').toLowerCase().replace(/[^a-z0-9-]/g, ''),
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
    coachMemberId = owner.data.id;

    const s = await admin
      .from('team_members')
      .insert({ tenant_id: tenantId, user_id: supportId, role: 'support' });
    if (s.error) throw new Error(s.error.message);

    const c = await admin
      .from('clients')
      .insert({ tenant_id: tenantId, user_id: clientUserId, full_name: 'BK Client', email: clientEmail, status: 'active' })
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
  });

  it('rejects a second overlapping booking for the same coach (gist exclusion)', async () => {
    const first = await admin.from('bookings').insert({
      tenant_id: tenantId,
      client_id: clientId,
      team_member_id: coachMemberId,
      slot_start: '2026-06-01T10:00:00Z',
      slot_end: '2026-06-01T11:00:00Z',
      status: 'scheduled',
    });
    expect(first.error).toBeNull();

    const overlap = await admin.from('bookings').insert({
      tenant_id: tenantId,
      client_id: otherClientId,
      team_member_id: coachMemberId,
      slot_start: '2026-06-01T10:30:00Z',
      slot_end: '2026-06-01T11:30:00Z',
      status: 'scheduled',
    });
    expect(overlap.error).not.toBeNull();
    expect(overlap.error!.code).toBe('23P01'); // exclusion_violation

    // A non-overlapping slot for the same coach is fine.
    const after = await admin.from('bookings').insert({
      tenant_id: tenantId,
      client_id: otherClientId,
      team_member_id: coachMemberId,
      slot_start: '2026-06-01T11:00:00Z',
      slot_end: '2026-06-01T12:00:00Z',
      status: 'scheduled',
    });
    expect(after.error).toBeNull();
  });

  it('lets a cancelled booking free the slot again', async () => {
    const start = '2026-06-02T09:00:00Z';
    const end = '2026-06-02T10:00:00Z';
    const b = await admin
      .from('bookings')
      .insert({ tenant_id: tenantId, client_id: clientId, team_member_id: coachMemberId, slot_start: start, slot_end: end, status: 'scheduled' })
      .select()
      .single();
    expect(b.error).toBeNull();

    // Cancel it, then the same slot can be booked again (constraint only covers
    // scheduled/rescheduled).
    const cancel = await admin.from('bookings').update({ status: 'cancelled' }).eq('id', b.data!.id);
    expect(cancel.error).toBeNull();

    const rebook = await admin.from('bookings').insert({
      tenant_id: tenantId,
      client_id: otherClientId,
      team_member_id: coachMemberId,
      slot_start: start,
      slot_end: end,
      status: 'scheduled',
    });
    expect(rebook.error).toBeNull();
  });

  it('only owner/manager can write availability & settings; support cannot', async () => {
    const ownerSupa = await userClient(ownerEmail);
    const ok = await ownerSupa.from('availability_rules').insert({
      tenant_id: tenantId,
      team_member_id: coachMemberId,
      weekday: 1,
      start_time: '09:00',
      end_time: '12:00',
    });
    expect(ok.error).toBeNull();

    const supportSupa = await userClient(supportEmail);
    const denied = await supportSupa.from('availability_rules').insert({
      tenant_id: tenantId,
      team_member_id: coachMemberId,
      weekday: 2,
      start_time: '09:00',
      end_time: '12:00',
    });
    expect(denied.error).not.toBeNull(); // no write policy for support

    const setOk = await ownerSupa
      .from('booking_settings')
      .upsert({ tenant_id: tenantId, slot_minutes: 45 }, { onConflict: 'tenant_id' });
    expect(setOk.error).toBeNull();

    const setDenied = await supportSupa
      .from('booking_settings')
      .upsert({ tenant_id: tenantId, slot_minutes: 30 }, { onConflict: 'tenant_id' });
    expect(setDenied.error).not.toBeNull();
  });

  it('a client can read availability but sees only their own bookings', async () => {
    const clientSupa = await userClient(clientEmail);

    const rules = await clientSupa.from('availability_rules').select('id').eq('tenant_id', tenantId);
    expect(rules.error).toBeNull();
    expect(rules.data!.length).toBeGreaterThan(0);

    const bookings = await clientSupa.from('bookings').select('id, client_id');
    expect(bookings.error).toBeNull();
    expect(bookings.data!.every((b) => b.client_id === clientId)).toBe(true);
  });

  it('a client can book for themselves but not for another client', async () => {
    const clientSupa = await userClient(clientEmail);

    const own = await clientSupa.from('bookings').insert({
      tenant_id: tenantId,
      client_id: clientId,
      team_member_id: coachMemberId,
      slot_start: '2026-06-03T10:00:00Z',
      slot_end: '2026-06-03T11:00:00Z',
      status: 'scheduled',
    });
    expect(own.error).toBeNull();

    const forOther = await clientSupa.from('bookings').insert({
      tenant_id: tenantId,
      client_id: otherClientId,
      team_member_id: coachMemberId,
      slot_start: '2026-06-03T12:00:00Z',
      slot_end: '2026-06-03T13:00:00Z',
      status: 'scheduled',
    });
    expect(forOther.error).not.toBeNull(); // owns_client(false) & not a team member
  });
});
