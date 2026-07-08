-- 0010_payment_credentials.sql
-- Per-tenant payment provider credentials (self-service Razorpay connection).
--
-- Each creator connects their OWN Razorpay account so payments settle to them.
-- Secrets (key secret + webhook secret) are stored ENCRYPTED at rest (AES-256-GCM
-- performed in the application layer with SETTINGS_ENCRYPTION_KEY); this table
-- only ever holds ciphertext. The publishable key id is stored in clear because
-- it is exposed to the browser at checkout anyway.
--
-- Security: this table is intentionally locked down. It is NOT granted to
-- `authenticated`, and RLS is enabled with no policies, so PostgREST/user
-- clients can never read or write it — even the tenant's own clients or team.
-- All access goes through the service role (server routes) which bypasses RLS,
-- after the route has authorized the caller as the tenant owner.

create table tenant_payment_credentials (
  tenant_id             uuid primary key references tenants(id) on delete cascade,
  provider              text not null default 'razorpay' check (provider = 'razorpay'),
  -- Publishable key id (e.g. rzp_test_xxx / rzp_live_xxx). Not secret.
  key_id                text not null check (length(trim(key_id)) > 0),
  -- Ciphertext (base64) of the key secret and webhook secret. Never plaintext.
  key_secret_enc        text not null,
  webhook_secret_enc    text not null,
  connected_at          timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger set_updated_at before update on tenant_payment_credentials
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Grants + RLS
-- ---------------------------------------------------------------------------
-- Service role only. No grant to `authenticated` — secrets must never be
-- reachable from a user-scoped (RLS) client. Enable RLS with no policies as a
-- belt-and-suspenders default-deny.
grant all privileges on tenant_payment_credentials to service_role;

alter table tenant_payment_credentials enable row level security;
