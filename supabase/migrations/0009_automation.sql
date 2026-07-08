-- 0009_automation.sql
-- Phase 4: automation engine. The `automation_rules` table already exists (a
-- rule = one enabled template per tenant/trigger/channel). This migration adds
-- the delivery outbox: every reminder/notification the engine decides to send
-- is recorded here first (status `pending`), then a dispatcher attempts
-- delivery and flips it to `sent`/`failed`/`skipped`. The outbox gives
-- idempotency (a partial-unique `dedup_key`) so re-running the daily cron never
-- double-sends, and an auditable log the owner can inspect.

-- ---------------------------------------------------------------------------
-- Delivery lifecycle for a single queued notification.
--   pending  - queued, not yet attempted
--   sent     - handed to the channel provider successfully (or logged in
--              dry-run mode when no provider is configured)
--   failed   - provider rejected it; `error` holds the reason
--   skipped  - nothing to send (e.g. client has no email/phone for the channel)
-- ---------------------------------------------------------------------------
create type notification_status as enum ('pending', 'sent', 'failed', 'skipped');

create table notifications (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  -- The recipient client. Nullable so tenant-level notices (not tied to a
  -- single client) can be recorded too.
  client_id          uuid references clients(id) on delete set null,
  -- The rule that produced this row, if any. Null for ad-hoc/system sends.
  automation_rule_id uuid references automation_rules(id) on delete set null,
  trigger_type       automation_trigger not null,
  channel            automation_channel not null,
  recipient          text,
  subject            text,
  body               text not null,
  status             notification_status not null default 'pending',
  error              text,
  -- Idempotency key. When set, the same logical event (e.g. a class-session
  -- reminder for a given client on a given channel) can be enqueued only once.
  dedup_key          text,
  scheduled_for      timestamptz,
  sent_at            timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Idempotency: one row per (tenant, dedup_key). NULLs are distinct in a
  -- unique constraint, so ad-hoc sends (dedup_key null) are never deduplicated.
  -- A plain constraint (not a partial index) so `ON CONFLICT` inference works.
  unique (tenant_id, dedup_key)
);

create index notifications_tenant_idx on notifications (tenant_id, created_at desc);
create index notifications_status_idx on notifications (status, scheduled_for);
create index notifications_client_idx on notifications (client_id);

create trigger set_updated_at before update on notifications
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Grants + RLS
-- ---------------------------------------------------------------------------
-- Owner/manager may read the log via PostgREST; all writes go through the
-- service role (the engine + cron), which bypasses RLS.
grant select on notifications to authenticated;
grant all privileges on notifications to service_role;

alter table notifications enable row level security;

create policy notifications_select on notifications
  for select to authenticated
  using (app.has_role(tenant_id, array['owner','manager']::team_role[]));
