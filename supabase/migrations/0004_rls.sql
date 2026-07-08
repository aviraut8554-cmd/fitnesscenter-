-- 0004_rls.sql
-- Row-Level Security for multi-tenant isolation. Every tenant-scoped table has
-- RLS enabled with explicit policies. The `service_role` bypasses RLS and is
-- used by the backend for privileged, server-verified operations (signup,
-- order creation, webhook processing). `anon`/`authenticated` are constrained
-- entirely by the policies below.

-- Allow authenticated users to call the RLS helper functions.
grant usage on schema app to authenticated;
grant execute on function app.is_team_member(uuid) to authenticated;
grant execute on function app.has_role(uuid, team_role[]) to authenticated;
grant execute on function app.is_client_of(uuid) to authenticated;
grant execute on function app.owns_client(uuid) to authenticated;

-- Table privileges. RLS then restricts which rows are visible/writable.
grant select on plans to anon, authenticated;
grant select, insert, update, delete on
  tenants, team_members, clients, health_forms, products_services, orders,
  payments, subscriptions, invoices, bookings, classes, class_sessions,
  attendance, chat_messages, automation_rules, audit_log
to authenticated;

-- The backend `service_role` bypasses RLS but still needs table/sequence
-- privileges to run privileged server-verified operations (signup, webhooks).
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------
alter table plans              enable row level security;
alter table tenants            enable row level security;
alter table team_members       enable row level security;
alter table clients            enable row level security;
alter table health_forms       enable row level security;
alter table products_services  enable row level security;
alter table orders             enable row level security;
alter table payments           enable row level security;
alter table subscriptions      enable row level security;
alter table invoices           enable row level security;
alter table bookings           enable row level security;
alter table classes            enable row level security;
alter table class_sessions     enable row level security;
alter table attendance         enable row level security;
alter table chat_messages      enable row level security;
alter table automation_rules   enable row level security;
alter table audit_log          enable row level security;

-- ---------------------------------------------------------------------------
-- plans — public reference data (read-only to clients/anon)
-- ---------------------------------------------------------------------------
create policy plans_select on plans
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------
create policy tenants_select on tenants
  for select to authenticated
  using (app.is_team_member(id) or app.is_client_of(id));

create policy tenants_update on tenants
  for update to authenticated
  using (app.has_role(id, array['owner']::team_role[]))
  with check (app.has_role(id, array['owner']::team_role[]));

-- ---------------------------------------------------------------------------
-- team_members
-- ---------------------------------------------------------------------------
create policy team_members_select on team_members
  for select to authenticated
  using (app.is_team_member(tenant_id));

create policy team_members_insert on team_members
  for insert to authenticated
  with check (app.has_role(tenant_id, array['owner']::team_role[]));

create policy team_members_update on team_members
  for update to authenticated
  using (app.has_role(tenant_id, array['owner']::team_role[]))
  with check (app.has_role(tenant_id, array['owner']::team_role[]));

create policy team_members_delete on team_members
  for delete to authenticated
  using (app.has_role(tenant_id, array['owner']::team_role[]));

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
create policy clients_select on clients
  for select to authenticated
  using (app.is_team_member(tenant_id) or user_id = auth.uid());

create policy clients_insert on clients
  for insert to authenticated
  with check (app.is_team_member(tenant_id));

create policy clients_update on clients
  for update to authenticated
  using (app.is_team_member(tenant_id) or user_id = auth.uid())
  with check (app.is_team_member(tenant_id) or user_id = auth.uid());

create policy clients_delete on clients
  for delete to authenticated
  using (app.has_role(tenant_id, array['owner','manager']::team_role[]));

-- ---------------------------------------------------------------------------
-- health_forms (append-only versions)
-- ---------------------------------------------------------------------------
create policy health_forms_select on health_forms
  for select to authenticated
  using (app.is_team_member(tenant_id) or app.owns_client(client_id));

create policy health_forms_insert on health_forms
  for insert to authenticated
  with check (app.is_team_member(tenant_id) or app.owns_client(client_id));

-- ---------------------------------------------------------------------------
-- products_services
-- ---------------------------------------------------------------------------
create policy products_select on products_services
  for select to authenticated
  using (
    app.is_team_member(tenant_id)
    or (app.is_client_of(tenant_id) and is_active)
  );

create policy products_insert on products_services
  for insert to authenticated
  with check (app.has_role(tenant_id, array['owner','manager']::team_role[]));

create policy products_update on products_services
  for update to authenticated
  using (app.has_role(tenant_id, array['owner','manager']::team_role[]))
  with check (app.has_role(tenant_id, array['owner','manager']::team_role[]));

create policy products_delete on products_services
  for delete to authenticated
  using (app.has_role(tenant_id, array['owner','manager']::team_role[]));

-- ---------------------------------------------------------------------------
-- orders (writes are service-role only: webhook / server-verified)
-- ---------------------------------------------------------------------------
create policy orders_select on orders
  for select to authenticated
  using (
    app.has_role(tenant_id, array['owner','manager']::team_role[])
    or app.owns_client(client_id)
  );

-- ---------------------------------------------------------------------------
-- payments (owner-only; no payment data for manager/support)
-- ---------------------------------------------------------------------------
create policy payments_select on payments
  for select to authenticated
  using (app.has_role(tenant_id, array['owner']::team_role[]));

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------
create policy subscriptions_select on subscriptions
  for select to authenticated
  using (
    app.has_role(tenant_id, array['owner','manager']::team_role[])
    or app.owns_client(client_id)
  );

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------
create policy invoices_select on invoices
  for select to authenticated
  using (
    app.has_role(tenant_id, array['owner','manager']::team_role[])
    or app.owns_client(client_id)
  );

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------
create policy bookings_select on bookings
  for select to authenticated
  using (app.is_team_member(tenant_id) or app.owns_client(client_id));

create policy bookings_insert on bookings
  for insert to authenticated
  with check (app.is_team_member(tenant_id) or app.owns_client(client_id));

create policy bookings_update on bookings
  for update to authenticated
  using (app.is_team_member(tenant_id) or app.owns_client(client_id))
  with check (app.is_team_member(tenant_id) or app.owns_client(client_id));

create policy bookings_delete on bookings
  for delete to authenticated
  using (app.has_role(tenant_id, array['owner','manager']::team_role[]));

-- ---------------------------------------------------------------------------
-- classes
-- ---------------------------------------------------------------------------
create policy classes_select on classes
  for select to authenticated
  using (app.is_team_member(tenant_id) or app.is_client_of(tenant_id));

create policy classes_write on classes
  for all to authenticated
  using (app.has_role(tenant_id, array['owner','manager']::team_role[]))
  with check (app.has_role(tenant_id, array['owner','manager']::team_role[]));

-- ---------------------------------------------------------------------------
-- class_sessions
-- ---------------------------------------------------------------------------
create policy class_sessions_select on class_sessions
  for select to authenticated
  using (app.is_team_member(tenant_id) or app.is_client_of(tenant_id));

create policy class_sessions_write on class_sessions
  for all to authenticated
  using (app.has_role(tenant_id, array['owner','manager']::team_role[]))
  with check (app.has_role(tenant_id, array['owner','manager']::team_role[]));

-- ---------------------------------------------------------------------------
-- attendance
-- ---------------------------------------------------------------------------
create policy attendance_select on attendance
  for select to authenticated
  using (app.is_team_member(tenant_id) or app.owns_client(client_id));

create policy attendance_insert on attendance
  for insert to authenticated
  with check (app.is_team_member(tenant_id) or app.owns_client(client_id));

create policy attendance_update on attendance
  for update to authenticated
  using (app.is_team_member(tenant_id))
  with check (app.is_team_member(tenant_id));

create policy attendance_delete on attendance
  for delete to authenticated
  using (app.has_role(tenant_id, array['owner','manager']::team_role[]));

-- ---------------------------------------------------------------------------
-- chat_messages (sender_type must match the actor)
-- ---------------------------------------------------------------------------
create policy chat_select on chat_messages
  for select to authenticated
  using (app.is_team_member(tenant_id) or app.owns_client(client_id));

create policy chat_insert on chat_messages
  for insert to authenticated
  with check (
    (app.is_team_member(tenant_id) and sender_type = 'team')
    or (app.owns_client(client_id) and sender_type = 'client')
  );

create policy chat_update on chat_messages
  for update to authenticated
  using (app.is_team_member(tenant_id) or app.owns_client(client_id))
  with check (app.is_team_member(tenant_id) or app.owns_client(client_id));

create policy chat_delete on chat_messages
  for delete to authenticated
  using (app.has_role(tenant_id, array['owner']::team_role[]));

-- ---------------------------------------------------------------------------
-- automation_rules
-- ---------------------------------------------------------------------------
create policy automation_rules_select on automation_rules
  for select to authenticated
  using (app.has_role(tenant_id, array['owner','manager']::team_role[]));

create policy automation_rules_write on automation_rules
  for all to authenticated
  using (app.has_role(tenant_id, array['owner','manager']::team_role[]))
  with check (app.has_role(tenant_id, array['owner','manager']::team_role[]));

-- ---------------------------------------------------------------------------
-- audit_log (owner read-only; inserts via SECURITY DEFINER / service role)
-- ---------------------------------------------------------------------------
create policy audit_log_select on audit_log
  for select to authenticated
  using (app.has_role(tenant_id, array['owner']::team_role[]));
