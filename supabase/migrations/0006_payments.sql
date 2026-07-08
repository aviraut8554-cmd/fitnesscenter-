-- 0006_payments.sql
-- Phase 2 (Core Commerce): idempotent webhook processing, per-tenant invoice
-- numbering, and the SECURITY DEFINER RPCs that apply payment/refund/subscription
-- state transitions atomically. Payment state is driven ONLY by verified webhooks
-- (see src/app/api/payments/webhook) — never by client-side confirmation.

-- ---------------------------------------------------------------------------
-- Webhook event ledger. One row per Razorpay event id; gives idempotency so a
-- duplicate delivery is a no-op (never double-unlock / double-invoice).
-- ---------------------------------------------------------------------------
create table razorpay_webhook_events (
  event_id      text primary key,          -- Razorpay `x-razorpay-event-id`
  event_type    text not null,
  payload       jsonb not null default '{}'::jsonb,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz
);

alter table razorpay_webhook_events enable row level security;
-- No policies: only the service role (which bypasses RLS) touches this table.

-- ---------------------------------------------------------------------------
-- Per-tenant invoice numbering. A dedicated counter row per tenant, bumped
-- under a row lock so concurrent payments never collide on invoice number.
-- ---------------------------------------------------------------------------
create table invoice_counters (
  tenant_id   uuid primary key references tenants(id) on delete cascade,
  last_number integer not null default 0
);

alter table invoice_counters enable row level security;
-- No policies: service-role only.

-- ---------------------------------------------------------------------------
-- Track the cumulative refunded amount per payment so revenue math (net of
-- refunds) is exact even for partial refunds.
-- ---------------------------------------------------------------------------
alter table payments
  add column amount_refunded_minor integer not null default 0
    check (amount_refunded_minor >= 0);

create or replace function app.next_invoice_number(p_tenant uuid)
returns text
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
declare
  v_seq integer;
begin
  insert into invoice_counters (tenant_id, last_number)
  values (p_tenant, 1)
  on conflict (tenant_id)
    do update set last_number = invoice_counters.last_number + 1
  returning last_number into v_seq;

  -- e.g. INV-000001. Human-friendly and unique per tenant.
  return 'INV-' || lpad(v_seq::text, 6, '0');
end;
$$;

-- Orders/payments/invoices remain server-managed: Phase 1 defines SELECT
-- policies (owner/manager or owning client) but no INSERT/UPDATE/DELETE
-- policies, so authenticated users can never write them directly. Every order
-- is created — and its amount fixed from the product — by the service role in
-- the checkout route, and every status transition comes only from a verified
-- webhook. This is intentional and needs no additional write policy here.

-- ---------------------------------------------------------------------------
-- Apply a captured payment: mark order paid, upsert the payment, generate an
-- invoice, and activate the client. Idempotent via the webhook ledger and the
-- unique payment id. Returns true when it performed work, false when the event
-- was already processed.
-- ---------------------------------------------------------------------------
create or replace function public.apply_payment_captured(
  p_event_id            text,
  p_event_type          text,
  p_razorpay_order_id   text,
  p_razorpay_payment_id text,
  p_signature           text,
  p_amount_minor        integer,
  p_method              text default null,
  p_payload             jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
declare
  v_order   orders;
  v_inserted integer;
begin
  -- Idempotency: claim this event id, or bail if already seen.
  insert into razorpay_webhook_events (event_id, event_type, payload)
  values (p_event_id, p_event_type, coalesce(p_payload, '{}'::jsonb))
  on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return false;
  end if;

  select * into v_order from orders where razorpay_order_id = p_razorpay_order_id;
  if v_order.id is null then
    raise exception 'no order for razorpay_order_id %', p_razorpay_order_id
      using errcode = 'no_data_found';
  end if;

  update orders set status = 'paid' where id = v_order.id;

  insert into payments (
    tenant_id, order_id, razorpay_payment_id, razorpay_signature,
    status, amount_minor, method, verified_at, webhook_event_id
  )
  values (
    v_order.tenant_id, v_order.id, p_razorpay_payment_id, p_signature,
    'captured', p_amount_minor, p_method, now(), p_event_id
  )
  on conflict (razorpay_payment_id) do update
    set status = 'captured', verified_at = now(), webhook_event_id = p_event_id;

  -- Auto-generate the invoice (exactly one per order, even if the order is
  -- somehow captured again under a different event id).
  if not exists (select 1 from invoices where order_id = v_order.id) then
    insert into invoices (tenant_id, client_id, order_id, number, status, amount_minor, currency, issued_at)
    values (
      v_order.tenant_id, v_order.client_id, v_order.id,
      app.next_invoice_number(v_order.tenant_id),
      'issued', v_order.amount_minor, v_order.currency, now()
    );
  end if;

  update clients set status = 'active'
   where id = v_order.client_id and status in ('trial', 'renewal_due', 'expired');

  update razorpay_webhook_events set processed_at = now() where event_id = p_event_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Apply a failed payment: mark the order failed and record the failed payment.
-- ---------------------------------------------------------------------------
create or replace function public.apply_payment_failed(
  p_event_id            text,
  p_event_type          text,
  p_razorpay_order_id   text,
  p_razorpay_payment_id text,
  p_amount_minor        integer,
  p_error_code          text default null,
  p_error_description   text default null,
  p_payload             jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
declare
  v_order   orders;
  v_inserted integer;
begin
  insert into razorpay_webhook_events (event_id, event_type, payload)
  values (p_event_id, p_event_type, coalesce(p_payload, '{}'::jsonb))
  on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return false;
  end if;

  select * into v_order from orders where razorpay_order_id = p_razorpay_order_id;
  if v_order.id is null then
    raise exception 'no order for razorpay_order_id %', p_razorpay_order_id
      using errcode = 'no_data_found';
  end if;

  update orders set status = 'failed' where id = v_order.id and status <> 'paid';

  insert into payments (
    tenant_id, order_id, razorpay_payment_id, status, amount_minor,
    webhook_event_id, error_code, error_description
  )
  values (
    v_order.tenant_id, v_order.id, p_razorpay_payment_id, 'failed', p_amount_minor,
    p_event_id, p_error_code, p_error_description
  )
  on conflict (razorpay_payment_id) do update
    set status = 'failed', error_code = p_error_code,
        error_description = p_error_description, webhook_event_id = p_event_id;

  update razorpay_webhook_events set processed_at = now() where event_id = p_event_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Apply a refund: mark payment + order refunded (full or partial), void invoice
-- on full refund. `p_amount_minor` is the refunded amount.
-- ---------------------------------------------------------------------------
create or replace function public.apply_refund(
  p_event_id            text,
  p_event_type          text,
  p_razorpay_payment_id text,
  p_amount_minor        integer,
  p_payload             jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
declare
  v_payment      payments;
  v_full         boolean;
  v_new_refunded integer;
  v_inserted     integer;
begin
  insert into razorpay_webhook_events (event_id, event_type, payload)
  values (p_event_id, p_event_type, coalesce(p_payload, '{}'::jsonb))
  on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return false;
  end if;

  select * into v_payment from payments where razorpay_payment_id = p_razorpay_payment_id;
  if v_payment.id is null then
    raise exception 'no payment for razorpay_payment_id %', p_razorpay_payment_id
      using errcode = 'no_data_found';
  end if;

  v_new_refunded := least(v_payment.amount_minor, v_payment.amount_refunded_minor + p_amount_minor);
  v_full := v_new_refunded >= v_payment.amount_minor;

  update payments
     set status = (case when v_full then 'refunded' else 'partially_refunded' end)::payment_status,
         amount_refunded_minor = v_new_refunded
   where id = v_payment.id;

  update orders
     set status = (case when v_full then 'refunded' else 'partially_refunded' end)::order_status
   where id = v_payment.order_id;

  if v_full then
    update invoices set status = 'refunded' where order_id = v_payment.order_id;
  end if;

  update razorpay_webhook_events set processed_at = now() where event_id = p_event_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Apply a subscription lifecycle event: upsert the subscription row by its
-- Razorpay id. Order/invoice for subscription charges are handled separately.
-- ---------------------------------------------------------------------------
create or replace function public.apply_subscription_event(
  p_event_id                text,
  p_event_type              text,
  p_razorpay_subscription_id text,
  p_status                  subscription_status,
  p_current_period_start    timestamptz default null,
  p_current_period_end      timestamptz default null,
  p_payload                 jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
declare
  v_inserted integer;
begin
  insert into razorpay_webhook_events (event_id, event_type, payload)
  values (p_event_id, p_event_type, coalesce(p_payload, '{}'::jsonb))
  on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return false;
  end if;

  update subscriptions
     set status = p_status,
         current_period_start = coalesce(p_current_period_start, current_period_start),
         current_period_end = coalesce(p_current_period_end, current_period_end)
   where razorpay_subscription_id = p_razorpay_subscription_id;

  update razorpay_webhook_events set processed_at = now() where event_id = p_event_id;
  return true;
end;
$$;

-- The processing RPCs are server-only (called by the webhook handler with the
-- service role). Never exposed to anon/authenticated.
revoke all on function public.apply_payment_captured(text, text, text, text, text, integer, text, jsonb) from public;
revoke all on function public.apply_payment_failed(text, text, text, text, integer, text, text, jsonb) from public;
revoke all on function public.apply_refund(text, text, text, integer, jsonb) from public;
revoke all on function public.apply_subscription_event(text, text, text, subscription_status, timestamptz, timestamptz, jsonb) from public;
grant execute on function public.apply_payment_captured(text, text, text, text, text, integer, text, jsonb) to service_role;
grant execute on function public.apply_payment_failed(text, text, text, text, integer, text, text, jsonb) to service_role;
grant execute on function public.apply_refund(text, text, text, integer, jsonb) to service_role;
grant execute on function public.apply_subscription_event(text, text, text, subscription_status, timestamptz, timestamptz, jsonb) to service_role;

-- New tables/sequences created above must also be grantable to service_role
-- (Phase 1 granted existing objects; re-run for the ones added here).
grant all privileges on razorpay_webhook_events, invoice_counters to service_role;
