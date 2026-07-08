-- 0008_classes.sql
-- Phase 3b: class management. Extends the existing classes/class_sessions/
-- attendance tables with a per-class instructor and a client<->class enrollment
-- model, so batches, attendance and (later) reminders are scoped per-class and
-- per-instructor rather than tenant-wide. One tenant can have multiple coaches
-- each running separate batches.

-- ---------------------------------------------------------------------------
-- Per-class instructor. A class is run by one team member (coach); nullable so
-- deleting a coach doesn't cascade-delete their classes.
-- ---------------------------------------------------------------------------
alter table classes
  add column instructor_id uuid references team_members(id) on delete set null;

create index classes_instructor_idx on classes (tenant_id, instructor_id);

-- ---------------------------------------------------------------------------
-- Enrollment lifecycle within a batch.
-- ---------------------------------------------------------------------------
create type enrollment_status as enum ('active', 'cancelled', 'completed');

-- ---------------------------------------------------------------------------
-- Which client belongs to which class (batch). Unique per (class, client).
-- Populated manually by owner/manager or automatically when an order for the
-- class's linked product is paid (see app.enroll_on_paid_order below).
-- ---------------------------------------------------------------------------
create table enrollments (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  class_id    uuid not null references classes(id) on delete cascade,
  client_id   uuid not null references clients(id) on delete cascade,
  status      enrollment_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (class_id, client_id)
);

create index enrollments_tenant_idx on enrollments (tenant_id);
create index enrollments_class_idx on enrollments (class_id);
create index enrollments_client_idx on enrollments (client_id);

create trigger set_updated_at before update on enrollments
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-enrollment on purchase. When an order transitions to `paid`, enroll the
-- buyer into every class whose linked product is the purchased one. Runs as a
-- SECURITY DEFINER trigger so it applies regardless of the caller's RLS
-- context (the webhook path uses the service role, but this keeps the rule in
-- the database next to the data it maintains).
-- ---------------------------------------------------------------------------
create or replace function app.enroll_on_paid_order()
returns trigger
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
begin
  if new.status = 'paid' and new.status is distinct from old.status then
    insert into enrollments (tenant_id, class_id, client_id, status)
    select c.tenant_id, c.id, new.client_id, 'active'
    from classes c
    where c.tenant_id = new.tenant_id
      and c.product_id = new.product_id
    on conflict (class_id, client_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger enroll_on_paid_order
  after update on orders
  for each row execute function app.enroll_on_paid_order();

-- ---------------------------------------------------------------------------
-- Grants + RLS
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on enrollments to authenticated;
-- The blanket service_role grant in 0004 only covered tables existing then, so
-- new tables must grant explicitly (the webhook/service path queries this table).
grant all privileges on enrollments to service_role;

alter table enrollments enable row level security;

-- Team members see all enrollments in their tenant; a client sees only their own.
create policy enrollments_select on enrollments
  for select to authenticated
  using (app.is_team_member(tenant_id) or app.owns_client(client_id));

-- Only owner/manager may manually manage enrollments. Auto-enrollment goes
-- through the SECURITY DEFINER trigger (or the service role) and bypasses this.
create policy enrollments_write on enrollments
  for all to authenticated
  using (app.has_role(tenant_id, array['owner','manager']::team_role[]))
  with check (app.has_role(tenant_id, array['owner','manager']::team_role[]));
