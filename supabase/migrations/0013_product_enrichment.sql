-- 0013_product_enrichment.sql
-- Client-facing merchandising fields for products/services, shown on the PWA
-- store product cards. All are display/marketing metadata — no effect on RLS,
-- pricing math, or checkout logic.

alter table products_services
  -- Thumbnail shown to clients in the PWA store.
  add column image_url text
    check (image_url is null or length(trim(image_url)) > 0),
  -- Admin-authored social proof (1-2 short testimonials). Stored as a text
  -- array; not client-submitted.
  add column testimonials text[] not null default '{}'::text[],
  -- Manual "Bestseller" / "Most Popular" flag (admin-set, not computed).
  add column is_bestseller boolean not null default false,
  -- Optional intro/trial offer: a flag plus an optional trial price and/or
  -- duration. Purely presentational for now.
  add column has_trial boolean not null default false,
  add column trial_price_minor integer
    check (trial_price_minor is null or trial_price_minor >= 0),
  add column trial_duration_days integer
    check (trial_duration_days is null or trial_duration_days > 0);
