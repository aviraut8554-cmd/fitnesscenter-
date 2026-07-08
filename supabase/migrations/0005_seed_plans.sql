-- 0005_seed_plans.sql
-- Default pricing tiers (client-count-tied). Final pricing is an open PRD item;
-- these are safe defaults and can be adjusted without schema changes.
-- Amounts are monthly, in paise (INR minor units).

insert into plans (code, name, max_clients, max_team_members, price_minor, currency)
values
  ('starter', 'Starter',  100,  2, 149900, 'INR'),
  ('growth',  'Growth',   500,  5, 399900, 'INR'),
  ('pro',     'Pro',     1000, 10, 799900, 'INR'),
  ('scale',   'Scale',   5000, 25, 1499900, 'INR')
on conflict (code) do nothing;
