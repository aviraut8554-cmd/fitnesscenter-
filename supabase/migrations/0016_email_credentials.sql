-- 0016_email_credentials.sql
-- Per-tenant Resend connection for automation email delivery.
--
-- The API key is encrypted in the application with AES-256-GCM before storage.
-- This table is service-role only: team members manage it through owner-guarded
-- server routes and no secret is ever exposed through PostgREST.

create table tenant_email_credentials (
  tenant_id        uuid primary key references tenants(id) on delete cascade,
  provider         text not null default 'resend' check (provider = 'resend'),
  api_key_enc      text not null,
  from_email       text not null check (length(trim(from_email)) > 0),
  from_name        text,
  connected_at     timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger set_updated_at before update on tenant_email_credentials
  for each row execute function app.set_updated_at();

grant all privileges on tenant_email_credentials to service_role;

alter table tenant_email_credentials enable row level security;
