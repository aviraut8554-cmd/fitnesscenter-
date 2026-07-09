-- Batch selection: a product can have multiple batches (classes). When such a
-- product is paid for, the client picks a batch (auto-assigned after 24h).

-- The batch a client is auto-assigned to if they don't choose in time.
alter table products_services
  add column default_class_id uuid references classes(id) on delete set null;

-- When an order was paid (drives the 24h auto-assign window).
alter table orders
  add column paid_at timestamptz;

-- Stamp paid_at the moment an order transitions into 'paid'.
create or replace function app.set_order_paid_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'paid' and new.status is distinct from old.status and new.paid_at is null then
    new.paid_at := now();
  end if;
  return new;
end;
$$;

create trigger set_order_paid_at
  before update on orders
  for each row execute function app.set_order_paid_at();

-- Auto-enroll on paid ONLY when the product maps to exactly one batch.
-- Products with 2+ batches leave the client to pick one (or get auto-assigned
-- by the daily cron after 24h); products with 0 batches are plain products.
create or replace function app.enroll_on_paid_order()
returns trigger
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
declare
  batch_count integer;
  only_batch  uuid;
begin
  if new.status = 'paid' and new.status is distinct from old.status then
    select count(*)
      into batch_count
      from classes c
      where c.tenant_id = new.tenant_id
        and c.product_id = new.product_id;

    if batch_count = 1 then
      select c.id
        into only_batch
        from classes c
        where c.tenant_id = new.tenant_id
          and c.product_id = new.product_id
        limit 1;

      insert into enrollments (tenant_id, class_id, client_id, status)
      values (new.tenant_id, only_batch, new.client_id, 'active')
      on conflict (class_id, client_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;
