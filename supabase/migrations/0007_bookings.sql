-- 0007_bookings.sql
-- Phase 3a: consultation booking. Adds per-tenant booking policy settings and
-- per-coach weekly availability rules. Bookable slots are derived server-side
-- from these rules; the existing `bookings.bookings_no_overlap` gist constraint
-- is the final guard against double-booking a coach.

-- ---------------------------------------------------------------------------
-- Per-tenant booking policy. One row per tenant (lazily created by the API).
-- Durations are in minutes; times are interpreted in `timezone`.
-- ---------------------------------------------------------------------------
create table booking_settings (
  tenant_id             uuid primary key references tenants(id) on delete cascade,
  timezone              text not null default 'Asia/Kolkata'
                          check (length(trim(timezone)) > 0),
  slot_minutes          integer not null default 30  check (slot_minutes between 5 and 480),
  buffer_minutes        integer not null default 0   check (buffer_minutes between 0 and 240),
  min_notice_minutes    integer not null default 120 check (min_notice_minutes >= 0),
  cancel_cutoff_minutes integer not null default 720 check (cancel_cutoff_minutes >= 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Recurring weekly availability windows per coach (team member).
-- weekday: 0=Sunday .. 6=Saturday (matches JS Date.getUTCDay in the tenant tz).
-- start_time/end_time are wall-clock times in the tenant timezone.
-- ---------------------------------------------------------------------------
create table availability_rules (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  team_member_id uuid not null references team_members(id) on delete cascade,
  weekday        smallint not null check (weekday between 0 and 6),
  start_time     time not null,
  end_time       time not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (end_time > start_time)
);

create index availability_rules_tenant_idx
  on availability_rules (tenant_id, team_member_id, weekday);

-- Overlapping windows for the same coach/day are tolerated: slot generation
-- dedupes overlapping windows, so duplicate rules never yield duplicate slots.
-- (Postgres has no built-in `time` range type for a gist exclusion here.)

-- updated_at maintenance (mirrors app.set_updated_at usage in 0003).
create trigger set_updated_at before update on booking_settings
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on availability_rules
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Grants + RLS
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on booking_settings, availability_rules
  to authenticated;

alter table booking_settings   enable row level security;
alter table availability_rules enable row level security;

-- booking_settings: team members and clients can read (clients need policy to
-- book); only owner/manager may write.
create policy booking_settings_select on booking_settings
  for select to authenticated
  using (app.is_team_member(tenant_id) or app.is_client_of(tenant_id));

create policy booking_settings_write on booking_settings
  for all to authenticated
  using (app.has_role(tenant_id, array['owner','manager']::team_role[]))
  with check (app.has_role(tenant_id, array['owner','manager']::team_role[]));

-- availability_rules: team members and clients can read (clients need windows to
-- see bookable slots); only owner/manager may write.
create policy availability_rules_select on availability_rules
  for select to authenticated
  using (app.is_team_member(tenant_id) or app.is_client_of(tenant_id));

create policy availability_rules_write on availability_rules
  for all to authenticated
  using (app.has_role(tenant_id, array['owner','manager']::team_role[]))
  with check (app.has_role(tenant_id, array['owner','manager']::team_role[]));
