import { beforeAll, describe, expect, it } from 'vitest';
import { adminClient, createUser, supabaseReachable, uniq, userClient } from '../helpers/supabase';
import { enqueueNotifications, dispatchPending } from '@/lib/automation';
import { runReminders } from '@/lib/reminder-service';

const reachable = await supabaseReachable();

/**
 * Phase 4 automation: rule RLS (owner/manager only), the enqueue→dispatch
 * outbox with dry-run delivery + dedup idempotency, the skip path when a
 * recipient has no address for a channel, and the daily reminder scan
 * (per-class scoping + idempotent re-run).
 */
describe.skipIf(!reachable)('automation: rules RLS, outbox & reminders', () => {
  const admin = adminClient();

  let tenantId: string;
  let ownerEmail: string;
  let supportEmail: string;
  let ownerMemberId: string;
  let clientAId: string; // enrolled, has email + phone
  let clientBId: string; // not enrolled
  let classId: string;
  let sessionId: string;

  beforeAll(async () => {
    ownerEmail = `${uniq('ownerau')}@example.com`;
    supportEmail = `${uniq('supportau')}@example.com`;

    const ownerId = await createUser(ownerEmail);
    const supportId = await createUser(supportEmail);
    const clientAUser = await createUser(`${uniq('clienta')}@example.com`);

    const t = await admin.rpc('provision_tenant', {
      p_owner_user_id: ownerId,
      p_name: 'Automation Tenant',
      p_subdomain: uniq('autenant').toLowerCase().replace(/[^a-z0-9-]/g, ''),
    });
    if (t.error) throw new Error(t.error.message);
    tenantId = t.data!.id;

    const owner = await admin
      .from('team_members')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('user_id', ownerId)
      .single();
    ownerMemberId = owner.data!.id;

    await admin.from('team_members').insert({ tenant_id: tenantId, user_id: supportId, role: 'support' });

    const a = await admin
      .from('clients')
      .insert({
        tenant_id: tenantId,
        user_id: clientAUser,
        full_name: 'Client A',
        email: `${uniq('ca')}@example.com`,
        phone: '+919999999999',
        status: 'active',
      })
      .select()
      .single();
    clientAId = a.data!.id;

    const b = await admin
      .from('clients')
      .insert({ tenant_id: tenantId, full_name: 'Client B', email: `${uniq('cb')}@example.com`, status: 'active' })
      .select()
      .single();
    clientBId = b.data!.id;

    const cls = await admin
      .from('classes')
      .insert({ tenant_id: tenantId, title: 'Sunrise HIIT', instructor_id: ownerMemberId, is_recorded: false })
      .select()
      .single();
    classId = cls.data!.id;

    // Session ~2 hours from now (inside the 24h reminder window).
    const startsAt = new Date(Date.now() + 2 * 3600_000);
    const endsAt = new Date(startsAt.getTime() + 3600_000);
    const sess = await admin
      .from('class_sessions')
      .insert({
        tenant_id: tenantId,
        class_id: classId,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
      })
      .select()
      .single();
    sessionId = sess.data!.id;

    // Only Client A is enrolled in this batch.
    await admin
      .from('enrollments')
      .insert({ tenant_id: tenantId, class_id: classId, client_id: clientAId, status: 'active' });
  });

  it('rules are readable/writable only by owner/manager', async () => {
    const ownerSupa = await userClient(ownerEmail);
    const created = await ownerSupa
      .from('automation_rules')
      .insert({
        tenant_id: tenantId,
        trigger_type: 'client_signup',
        channel: 'email',
        enabled: true,
        template: { subject: 'Welcome', body: 'Hi {{clientName}}' },
      })
      .select()
      .single();
    expect(created.error).toBeNull();

    const ownerRead = await ownerSupa.from('automation_rules').select('id').eq('tenant_id', tenantId);
    expect(ownerRead.data!.length).toBeGreaterThan(0);

    const supportSupa = await userClient(supportEmail);
    const supportRead = await supportSupa.from('automation_rules').select('id').eq('tenant_id', tenantId);
    expect(supportRead.error).toBeNull();
    expect(supportRead.data!.length).toBe(0); // filtered out by RLS

    const supportWrite = await supportSupa
      .from('automation_rules')
      .insert({ tenant_id: tenantId, trigger_type: 'payment_success', channel: 'email', enabled: true, template: { body: 'x' } });
    expect(supportWrite.error).not.toBeNull();
  });

  it('enqueue queues one row per enabled rule, dry-run dispatch marks it sent, and is idempotent', async () => {
    // client_signup email rule already created above; add a whatsapp rule too.
    await admin
      .from('automation_rules')
      .upsert(
        {
          tenant_id: tenantId,
          trigger_type: 'client_signup',
          channel: 'whatsapp',
          enabled: true,
          template: { body: 'Welcome {{clientName}}' },
        },
        { onConflict: 'tenant_id,trigger_type,channel' },
      );

    // Client B has no phone → the whatsapp row must be recorded as skipped.
    const queued = await enqueueNotifications({
      admin,
      tenantId,
      trigger: 'client_signup',
      recipient: { clientId: clientBId, email: 'cb@example.com', phone: null },
      vars: { clientName: 'Client B', businessName: 'Automation Tenant' },
      dedupKey: `signup:${clientBId}`,
    });
    expect(queued).toBe(2); // email + whatsapp rows

    const rows = await admin
      .from('notifications')
      .select('channel, status, recipient, body')
      .eq('tenant_id', tenantId)
      .eq('trigger_type', 'client_signup');
    expect(rows.data!.length).toBe(2);
    const email = rows.data!.find((r) => r.channel === 'email')!;
    const whatsapp = rows.data!.find((r) => r.channel === 'whatsapp')!;
    expect(email.status).toBe('pending');
    expect(email.body).toBe('Hi Client B'); // rendered from the rule created in the RLS test
    expect(whatsapp.status).toBe('skipped'); // no phone on file

    const result = await dispatchPending(admin, { tenantId });
    expect(result.sent).toBeGreaterThanOrEqual(1);

    const afterEmail = await admin
      .from('notifications')
      .select('status, sent_at')
      .eq('tenant_id', tenantId)
      .eq('trigger_type', 'client_signup')
      .eq('channel', 'email')
      .single();
    expect(afterEmail.data!.status).toBe('sent'); // dry-run log mode reports success
    expect(afterEmail.data!.sent_at).not.toBeNull();

    // Re-enqueue with the same dedup key → no new rows.
    const again = await enqueueNotifications({
      admin,
      tenantId,
      trigger: 'client_signup',
      recipient: { clientId: clientBId, email: 'cb@example.com', phone: null },
      vars: { clientName: 'Client B', businessName: 'Automation Tenant' },
      dedupKey: `signup:${clientBId}`,
    });
    expect(again).toBe(0);
  });

  it('daily reminder scan queues a class reminder for the enrolled client only, and re-runs idempotently', async () => {
    await admin.from('automation_rules').upsert(
      {
        tenant_id: tenantId,
        trigger_type: 'class_reminder',
        channel: 'email',
        enabled: true,
        template: { subject: 'Class soon', body: '{{className}} at {{startTime}}' },
      },
      { onConflict: 'tenant_id,trigger_type,channel' },
    );

    await runReminders(admin, { now: new Date() });

    const reminders = await admin
      .from('notifications')
      .select('client_id, dedup_key, body')
      .eq('tenant_id', tenantId)
      .eq('trigger_type', 'class_reminder');
    expect(reminders.data!.length).toBe(1);
    expect(reminders.data![0].client_id).toBe(clientAId); // Client B not enrolled
    expect(reminders.data![0].dedup_key).toContain(`class_session:${sessionId}:${clientAId}`);
    expect(reminders.data![0].body).toContain('Sunrise HIIT');

    // Second run must not duplicate.
    await runReminders(admin, { now: new Date() });
    const after = await admin
      .from('notifications')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('trigger_type', 'class_reminder');
    expect(after.data!.length).toBe(1);
  });
});
