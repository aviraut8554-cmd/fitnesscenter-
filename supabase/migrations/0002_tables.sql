-- 0002_tables.sql
-- Normalized relational schema for Fitness Creator OS.
-- Monetary amounts are stored as integer minor units (paise for INR) to avoid
-- floating-point rounding; `currency` is an ISO-4217 code (INR at launch).

-- ---------------------------------------------------------------------------
-- Plans (pricing tiers). Client-count-tied tiering per PRD.
-- Global reference data, not tenant-scoped.
-- ---------------------------------------------------------------------------
create table plans (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  name              text not null,
  max_clients       integer not null check (max_clients >= 0),
  max_team_members  integer not null check (max_team_members >= 1),
  price_minor       integer not null default 0 check (price_minor >= 0),
  currency          text not null default 'INR',
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tenants (influencers). Root of every multi-tenant access path.
-- ---------------------------------------------------------------------------
create table tenants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) > 0),
  subdomain     citext not null unique
                  check (subdomain ~ '^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$'),
  branding      jsonb not null default '{}'::jsonb,
  plan_id       uuid references plans(id) on delete restrict,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Team members. A user's role within a tenant. One row per (tenant, user).
-- ---------------------------------------------------------------------------
create table team_members (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        team_role not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index team_members_tenant_idx on team_members (tenant_id);
create index team_members_user_idx on team_members (user_id);

-- Exactly one owner per tenant.
create unique index team_members_one_owner_idx
  on team_members (tenant_id)
  where role = 'owner';

-- ---------------------------------------------------------------------------
-- Clients (end users of a tenant).
-- ---------------------------------------------------------------------------
create table clients (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  full_name   text not null check (length(trim(full_name)) > 0),
  email       citext not null,
  phone       text,
  status      client_status not null default 'trial',
  joined_at   timestamptz not null default now(),
  notes       text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, email)
);

create index clients_tenant_idx on clients (tenant_id);
create index clients_user_idx on clients (user_id);
create index clients_status_idx on clients (tenant_id, status);

-- A given auth user maps to at most one client row per tenant.
create unique index clients_tenant_user_idx
  on clients (tenant_id, user_id)
  where user_id is not null;

-- ---------------------------------------------------------------------------
-- Health forms (versioned per client).
-- ---------------------------------------------------------------------------
create table health_forms (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  client_id     uuid not null references clients(id) on delete cascade,
  -- Assigned by the assign_health_form_version() BEFORE INSERT trigger when
  -- omitted; the default 0 is always replaced with the next per-client version.
  version       integer not null default 0 check (version >= 1),
  data          jsonb not null,
  submitted_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (client_id, version)
);

create index health_forms_client_idx on health_forms (client_id);
create index health_forms_tenant_idx on health_forms (tenant_id);

-- ---------------------------------------------------------------------------
-- Products & services.
-- ---------------------------------------------------------------------------
create table products_services (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  type          product_type not null,
  name          text not null check (length(trim(name)) > 0),
  description   text,
  amount_minor  integer not null check (amount_minor >= 0),
  currency      text not null default 'INR',
  billing_cycle billing_cycle not null default 'one_time',
  capacity      integer check (capacity is null or capacity > 0),
  is_active     boolean not null default true,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index products_tenant_idx on products_services (tenant_id);
create index products_active_idx on products_services (tenant_id, is_active);

-- ---------------------------------------------------------------------------
-- Orders. Status transitions to paid/failed/refunded are webhook-driven only.
-- ---------------------------------------------------------------------------
create table orders (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  client_id         uuid not null references clients(id) on delete restrict,
  product_id        uuid not null references products_services(id) on delete restrict,
  amount_minor      integer not null check (amount_minor >= 0),
  currency          text not null default 'INR',
  status            order_status not null default 'created',
  razorpay_order_id text unique,
  receipt           text,
  notes             jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index orders_tenant_idx on orders (tenant_id);
create index orders_client_idx on orders (client_id);
create index orders_status_idx on orders (tenant_id, status);

-- ---------------------------------------------------------------------------
-- Payments. Mirror of Razorpay payment objects; created/updated only by
-- verified webhook handlers. `webhook_event_id` gives idempotency.
-- ---------------------------------------------------------------------------
create table payments (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  order_id            uuid not null references orders(id) on delete restrict,
  razorpay_payment_id text not null unique,
  razorpay_signature  text,
  status              payment_status not null default 'created',
  amount_minor        integer not null check (amount_minor >= 0),
  method              text,
  verified_at         timestamptz,
  webhook_event_id    text,
  error_code          text,
  error_description   text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index payments_tenant_idx on payments (tenant_id);
create index payments_order_idx on payments (order_id);

-- ---------------------------------------------------------------------------
-- Subscriptions. Mirror of Razorpay subscription objects.
-- ---------------------------------------------------------------------------
create table subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references tenants(id) on delete cascade,
  client_id                 uuid not null references clients(id) on delete restrict,
  product_id                uuid not null references products_services(id) on delete restrict,
  razorpay_subscription_id  text not null unique,
  status                    subscription_status not null default 'created',
  current_period_start      timestamptz,
  current_period_end        timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index subscriptions_tenant_idx on subscriptions (tenant_id);
create index subscriptions_client_idx on subscriptions (client_id);
create index subscriptions_period_end_idx on subscriptions (current_period_end);

-- ---------------------------------------------------------------------------
-- Invoices (auto-generated on successful payment).
-- ---------------------------------------------------------------------------
create table invoices (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  client_id       uuid not null references clients(id) on delete restrict,
  order_id        uuid references orders(id) on delete set null,
  subscription_id uuid references subscriptions(id) on delete set null,
  number          text not null,
  status          invoice_status not null default 'draft',
  amount_minor    integer not null check (amount_minor >= 0),
  currency        text not null default 'INR',
  issued_at       timestamptz,
  pdf_url         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, number)
);

create index invoices_tenant_idx on invoices (tenant_id);
create index invoices_client_idx on invoices (client_id);

-- ---------------------------------------------------------------------------
-- Bookings (consultations). Server-enforced no-overlap per assigned coach.
-- ---------------------------------------------------------------------------
create table bookings (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  client_id         uuid not null references clients(id) on delete restrict,
  product_id        uuid references products_services(id) on delete set null,
  team_member_id    uuid references team_members(id) on delete set null,
  slot_start        timestamptz not null,
  slot_end          timestamptz not null,
  status            booking_status not null default 'scheduled',
  calendar_event_id text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (slot_end > slot_start)
);

create index bookings_tenant_idx on bookings (tenant_id);
create index bookings_client_idx on bookings (client_id);
create index bookings_slot_idx on bookings (tenant_id, slot_start);

-- Prevent double-booking the same coach for overlapping active slots.
alter table bookings
  add constraint bookings_no_overlap
  exclude using gist (
    team_member_id with =,
    tstzrange(slot_start, slot_end) with &&
  )
  where (status in ('scheduled', 'rescheduled') and team_member_id is not null);

-- ---------------------------------------------------------------------------
-- Classes and their sessions.
-- ---------------------------------------------------------------------------
create table classes (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  product_id   uuid references products_services(id) on delete set null,
  title        text not null check (length(trim(title)) > 0),
  description  text,
  schedule     jsonb not null default '{}'::jsonb,
  capacity     integer check (capacity is null or capacity > 0),
  is_recorded  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index classes_tenant_idx on classes (tenant_id);

create table class_sessions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  class_id      uuid not null references classes(id) on delete cascade,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  live_link     text,
  recording_url text,
  capacity      integer check (capacity is null or capacity > 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index class_sessions_class_idx on class_sessions (class_id);
create index class_sessions_tenant_idx on class_sessions (tenant_id, starts_at);

-- ---------------------------------------------------------------------------
-- Attendance.
-- ---------------------------------------------------------------------------
create table attendance (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  class_session_id  uuid not null references class_sessions(id) on delete cascade,
  client_id         uuid not null references clients(id) on delete cascade,
  status            attendance_status not null default 'registered',
  marked_at         timestamptz,
  created_at        timestamptz not null default now(),
  unique (class_session_id, client_id)
);

create index attendance_session_idx on attendance (class_session_id);
create index attendance_client_idx on attendance (client_id);

-- ---------------------------------------------------------------------------
-- Chat messages (client <-> team, threaded per client).
-- ---------------------------------------------------------------------------
create table chat_messages (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  client_id       uuid not null references clients(id) on delete cascade,
  sender_type     sender_type not null,
  sender_user_id  uuid references auth.users(id) on delete set null,
  body            text not null check (length(body) > 0),
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index chat_messages_thread_idx on chat_messages (tenant_id, client_id, created_at);

-- ---------------------------------------------------------------------------
-- Automation rules.
-- ---------------------------------------------------------------------------
create table automation_rules (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  trigger_type  automation_trigger not null,
  channel       automation_channel not null,
  template      jsonb not null default '{}'::jsonb,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, trigger_type, channel)
);

create index automation_rules_tenant_idx on automation_rules (tenant_id);

-- ---------------------------------------------------------------------------
-- Audit log (sensitive actions). Inserted via SECURITY DEFINER helper only.
-- ---------------------------------------------------------------------------
create table audit_log (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid references tenants(id) on delete set null,
  actor_user_id  uuid references auth.users(id) on delete set null,
  action         text not null,
  target_table   text,
  target_id      text,
  changes        jsonb not null default '{}'::jsonb,
  ip             inet,
  created_at     timestamptz not null default now()
);

create index audit_log_tenant_idx on audit_log (tenant_id, created_at);
create index audit_log_actor_idx on audit_log (actor_user_id);
