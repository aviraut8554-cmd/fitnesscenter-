import type { AdminSupabase } from '@/lib/supabase/admin';
import { DEFAULT_BOOKING_SETTINGS } from '@/lib/booking-service';
import { resolveInstructorNames } from '@/lib/class-service';
import { enqueueNotifications, dispatchPending, type Recipient } from '@/lib/automation';

/**
 * Scheduled reminder scan. Run daily by the cron endpoint: it finds upcoming
 * class sessions, consultations and subscriptions nearing renewal, and queues
 * the tenant's configured reminders for each affected client. Class reminders
 * are scoped per-class/per-instructor (each enrolled client of that specific
 * batch), so multiple coaches' batches never cross-notify. Idempotent via the
 * outbox `dedup_key`, so re-running the same day never double-sends.
 */

export interface ReminderWindow {
  now?: Date;
  /** Hours ahead to look for class/booking reminders. */
  lookaheadHours?: number;
  /** Days ahead to look for subscription renewals. */
  renewalDays?: number;
}

export interface ReminderSummary {
  classReminders: number;
  bookingReminders: number;
  renewalReminders: number;
  sent: number;
  failed: number;
}

function fmtTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: tz,
  }).format(new Date(iso));
}

/** Per-tenant display context (business name + timezone), memoized per run. */
class TenantContext {
  private cache = new Map<string, { name: string; timezone: string }>();
  constructor(private admin: AdminSupabase) {}

  async get(tenantId: string): Promise<{ name: string; timezone: string }> {
    const hit = this.cache.get(tenantId);
    if (hit) return hit;

    const [{ data: tenant }, { data: settings }] = await Promise.all([
      this.admin.from('tenants').select('name').eq('id', tenantId).maybeSingle(),
      this.admin.from('booking_settings').select('timezone').eq('tenant_id', tenantId).maybeSingle(),
    ]);
    const ctx = {
      name: tenant?.name ?? 'Your coach',
      timezone: settings?.timezone ?? DEFAULT_BOOKING_SETTINGS.timezone,
    };
    this.cache.set(tenantId, ctx);
    return ctx;
  }
}

async function loadRecipients(
  admin: AdminSupabase,
  clientIds: string[],
): Promise<Map<string, Recipient & { fullName: string }>> {
  const map = new Map<string, Recipient & { fullName: string }>();
  const ids = [...new Set(clientIds)];
  if (ids.length === 0) return map;

  const { data } = await admin
    .from('clients')
    .select('id, full_name, email, phone')
    .in('id', ids);
  for (const c of data ?? []) {
    map.set(c.id, { clientId: c.id, fullName: c.full_name, email: c.email, phone: c.phone });
  }
  return map;
}

export async function runReminders(
  admin: AdminSupabase,
  window: ReminderWindow = {},
): Promise<ReminderSummary> {
  const now = window.now ?? new Date();
  const lookaheadHours = window.lookaheadHours ?? 24;
  const renewalDays = window.renewalDays ?? 3;
  const until = new Date(now.getTime() + lookaheadHours * 3600_000);
  const renewalUntil = new Date(now.getTime() + renewalDays * 86_400_000);

  const tenants = new TenantContext(admin);
  const summary: ReminderSummary = {
    classReminders: 0,
    bookingReminders: 0,
    renewalReminders: 0,
    sent: 0,
    failed: 0,
  };

  // --- Class reminders (per-class / per-instructor) ---
  const { data: sessions } = await admin
    .from('class_sessions')
    .select('id, tenant_id, class_id, starts_at, class:classes(title, instructor_id)')
    .gte('starts_at', now.toISOString())
    .lte('starts_at', until.toISOString());

  for (const s of sessions ?? []) {
    const cls = (s as { class: { title: string; instructor_id: string | null } | null }).class;
    if (!cls) continue;
    const { data: enrollments } = await admin
      .from('enrollments')
      .select('client_id')
      .eq('class_id', s.class_id)
      .eq('status', 'active');
    const clientIds = (enrollments ?? []).map((e) => e.client_id);
    if (clientIds.length === 0) continue;

    const [ctx, recipients, names] = await Promise.all([
      tenants.get(s.tenant_id),
      loadRecipients(admin, clientIds),
      cls.instructor_id
        ? resolveInstructorNames(s.tenant_id, [cls.instructor_id])
        : Promise.resolve(new Map<string, string>()),
    ]);
    const instructorName = cls.instructor_id ? (names.get(cls.instructor_id) ?? 'Coach') : 'Coach';

    for (const clientId of clientIds) {
      const r = recipients.get(clientId);
      if (!r) continue;
      summary.classReminders += await enqueueNotifications({
        admin,
        tenantId: s.tenant_id,
        trigger: 'class_reminder',
        recipient: r,
        dedupKey: `class_session:${s.id}:${clientId}`,
        vars: {
          clientName: r.fullName,
          businessName: ctx.name,
          className: cls.title,
          instructorName,
          startTime: fmtTime(s.starts_at, ctx.timezone),
        },
      });
    }
  }

  // --- Booking reminders ---
  const { data: bookings } = await admin
    .from('bookings')
    .select('id, tenant_id, client_id, slot_start, team_member:team_members(id)')
    .eq('status', 'scheduled')
    .gte('slot_start', now.toISOString())
    .lte('slot_start', until.toISOString());

  for (const b of bookings ?? []) {
    const [ctx, recipients] = await Promise.all([
      tenants.get(b.tenant_id),
      loadRecipients(admin, [b.client_id]),
    ]);
    const r = recipients.get(b.client_id);
    if (!r) continue;
    const coach = (b as { team_member: { id: string } | null }).team_member;
    const coachNames = coach
      ? await resolveInstructorNames(b.tenant_id, [coach.id])
      : new Map<string, string>();
    summary.bookingReminders += await enqueueNotifications({
      admin,
      tenantId: b.tenant_id,
      trigger: 'booking_reminder',
      recipient: r,
      dedupKey: `booking:${b.id}`,
      vars: {
        clientName: r.fullName,
        businessName: ctx.name,
        coachName: coach ? (coachNames.get(coach.id) ?? 'your coach') : 'your coach',
        startTime: fmtTime(b.slot_start, ctx.timezone),
      },
    });
  }

  // --- Subscription renewal reminders ---
  const { data: subs } = await admin
    .from('subscriptions')
    .select('id, tenant_id, client_id, current_period_end, product:products_services(name)')
    .eq('status', 'active')
    .gte('current_period_end', now.toISOString())
    .lte('current_period_end', renewalUntil.toISOString());

  for (const sub of subs ?? []) {
    if (!sub.current_period_end) continue;
    const [ctx, recipients] = await Promise.all([
      tenants.get(sub.tenant_id),
      loadRecipients(admin, [sub.client_id]),
    ]);
    const r = recipients.get(sub.client_id);
    if (!r) continue;
    const product = (sub as { product: { name: string } | null }).product;
    const renewalDate = new Date(sub.current_period_end).toISOString().slice(0, 10);
    summary.renewalReminders += await enqueueNotifications({
      admin,
      tenantId: sub.tenant_id,
      trigger: 'subscription_renewal_due',
      recipient: r,
      dedupKey: `subscription_renewal:${sub.id}:${renewalDate}`,
      vars: {
        clientName: r.fullName,
        businessName: ctx.name,
        productName: product?.name ?? 'your plan',
        renewalDate: fmtTime(sub.current_period_end, ctx.timezone),
      },
    });
  }

  const { sent, failed } = await dispatchPending(admin, {});
  summary.sent = sent;
  summary.failed = failed;
  return summary;
}
