import type { AdminSupabase } from '@/lib/supabase/admin';
import type { Database } from '@/lib/database.types';
import { dispatch, type Channel } from '@/lib/notifier';
import {
  renderTemplate,
  type AutomationTrigger,
  type Template,
} from '@/lib/automation-templates';

/**
 * Automation engine. An `automation_rules` row is a per-tenant template that
 * fires on a trigger over a channel (email/WhatsApp). When something happens
 * (a signup, an upcoming class), the engine looks up the tenant's enabled rules
 * for that trigger, renders each template, and records one `notifications` row
 * per (rule, recipient) in the outbox. A separate dispatch step delivers the
 * pending rows via the pluggable notifier and records the outcome.
 *
 * Recording first (outbox) then dispatching gives idempotency: every enqueue
 * carries a `dedupKey`, and a unique (tenant, dedup_key) constraint means
 * re-running the daily cron can never double-send the same reminder.
 *
 * Pure, client-safe metadata (labels, tokens, default templates, the renderer)
 * lives in `@/lib/automation-templates` and is re-exported here for server
 * callers that already import from this module. Client components must import
 * from `@/lib/automation-templates` directly to avoid pulling this server-only
 * module (and its `env`/admin/notifier imports) into the browser bundle.
 */

export * from '@/lib/automation-templates';

function asTemplate(value: unknown): Template {
  if (value && typeof value === 'object') {
    const v = value as { subject?: unknown; body?: unknown };
    if (typeof v.body === 'string') {
      return { subject: typeof v.subject === 'string' ? v.subject : undefined, body: v.body };
    }
  }
  return { body: '' };
}

export interface Recipient {
  clientId: string;
  email: string | null;
  phone: string | null;
}

function recipientFor(channel: Channel, r: Recipient): string | null {
  return channel === 'email' ? r.email : r.phone;
}

export interface EnqueueInput {
  admin: AdminSupabase;
  tenantId: string;
  trigger: AutomationTrigger;
  recipient: Recipient;
  vars: Record<string, string>;
  /** Stable per-event key; the channel is appended so each channel dedups. */
  dedupKey?: string;
}

/**
 * Look up the tenant's enabled rules for `trigger` and queue one notification
 * per rule (channel). Rows with a `dedupKey` are inserted with `ignoreDuplicates`
 * so repeated enqueues are no-ops. Returns the number of rows newly queued.
 */
export async function enqueueNotifications(input: EnqueueInput): Promise<number> {
  const { admin, tenantId, trigger, recipient, vars, dedupKey } = input;

  const { data: rules, error } = await admin
    .from('automation_rules')
    .select('id, channel, template')
    .eq('tenant_id', tenantId)
    .eq('trigger_type', trigger)
    .eq('enabled', true);
  if (error) throw new Error(`automation: failed to load rules: ${error.message}`);
  if (!rules || rules.length === 0) return 0;

  const rows = rules.map((rule) => {
    const channel = rule.channel as Channel;
    const tpl = asTemplate(rule.template);
    const to = recipientFor(channel, recipient);
    return {
      tenant_id: tenantId,
      client_id: recipient.clientId,
      automation_rule_id: rule.id,
      trigger_type: trigger,
      channel: rule.channel,
      recipient: to,
      subject: tpl.subject ? renderTemplate(tpl.subject, vars) : null,
      body: renderTemplate(tpl.body, vars),
      // No recipient for the channel → record as skipped, never dispatched.
      status: (to ? 'pending' : 'skipped') as Database['public']['Enums']['notification_status'],
      error: to ? null : `no ${channel} address on file`,
      dedup_key: dedupKey ? `${dedupKey}:${rule.channel}` : null,
    };
  });

  const { data, error: insErr } = await admin
    .from('notifications')
    .upsert(rows, { onConflict: 'tenant_id,dedup_key', ignoreDuplicates: true })
    .select('id');
  if (insErr) throw new Error(`automation: failed to queue notifications: ${insErr.message}`);
  return data?.length ?? 0;
}

/**
 * Deliver pending notifications via the notifier and record each outcome.
 * `filter` narrows the batch (e.g. to a tenant or the ids just enqueued).
 * Returns counts for a summary. Delivery failures are recorded, not thrown, so
 * one bad recipient never aborts the batch.
 */
export async function dispatchPending(
  admin: AdminSupabase,
  filter: { ids?: string[]; tenantId?: string; limit?: number } = {},
  options: { allowLogFallback?: boolean } = {},
): Promise<{ sent: number; failed: number }> {
  let query = admin
    .from('notifications')
    .select('id, tenant_id, channel, recipient, subject, body')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(filter.limit ?? 500);
  if (filter.ids && filter.ids.length > 0) query = query.in('id', filter.ids);
  if (filter.tenantId) query = query.eq('tenant_id', filter.tenantId);

  const { data: pending, error } = await query;
  if (error) throw new Error(`automation: failed to load pending: ${error.message}`);

  let sent = 0;
  let failed = 0;
  for (const n of pending ?? []) {
    if (!n.recipient) {
      await admin
        .from('notifications')
        .update({ status: 'skipped', error: 'missing recipient' })
        .eq('id', n.id);
      continue;
    }
    const result = await dispatch(
      admin,
      n.tenant_id,
      {
        channel: n.channel as Channel,
        recipient: n.recipient,
        subject: n.subject,
        body: n.body,
      },
      options,
    );
    if (result.ok) {
      sent += 1;
      await admin
        .from('notifications')
        .update({ status: 'sent', sent_at: new Date().toISOString(), error: null })
        .eq('id', n.id);
    } else if (result.reason === 'not_configured') {
      await admin
        .from('notifications')
        .update({ status: 'skipped', error: result.error })
        .eq('id', n.id);
    } else {
      failed += 1;
      await admin.from('notifications').update({ status: 'failed', error: result.error }).eq('id', n.id);
    }
  }
  return { sent, failed };
}

/**
 * Convenience for event-driven triggers: enqueue then immediately dispatch.
 * Best-effort — callers wrap this so a notification failure never breaks the
 * primary action (signup, booking, …).
 */
export async function fireEvent(input: EnqueueInput): Promise<void> {
  const queued = await enqueueNotifications(input);
  if (queued > 0) {
    await dispatchPending(input.admin, { tenantId: input.tenantId }, { allowLogFallback: false });
  }
}
