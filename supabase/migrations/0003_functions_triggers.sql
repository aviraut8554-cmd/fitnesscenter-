-- 0003_functions_triggers.sql
-- Helper functions (used by RLS), triggers, and the atomic tenant-provisioning
-- RPC. RLS helpers are SECURITY DEFINER so they can read membership tables
-- without being subject to (and recursing through) the policies they support.

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
  tables text[] := array[
    'plans','tenants','team_members','clients','products_services','orders',
    'payments','subscriptions','invoices','bookings','classes','class_sessions',
    'automation_rules'
  ];
begin
  foreach t in array tables loop
    execute format(
      'create trigger set_updated_at before update on %I
         for each row execute function app.set_updated_at()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Health form auto-versioning: assign next version per client when omitted.
-- ---------------------------------------------------------------------------
create or replace function app.assign_health_form_version()
returns trigger
language plpgsql
as $$
begin
  if new.version is null or new.version = 0 then
    select coalesce(max(version), 0) + 1
      into new.version
      from health_forms
     where client_id = new.client_id;
  end if;
  return new;
end;
$$;

create trigger assign_health_form_version
  before insert on health_forms
  for each row execute function app.assign_health_form_version();

-- ---------------------------------------------------------------------------
-- RLS helper functions
-- ---------------------------------------------------------------------------

-- Is the current user a team member of the given tenant?
create or replace function app.is_team_member(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select exists (
    select 1 from team_members
    where tenant_id = p_tenant and user_id = auth.uid()
  );
$$;

-- Does the current user hold one of the given roles in the tenant?
create or replace function app.has_role(p_tenant uuid, p_roles team_role[])
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select exists (
    select 1 from team_members
    where tenant_id = p_tenant
      and user_id = auth.uid()
      and role = any (p_roles)
  );
$$;

-- Is the current user a client of the given tenant?
create or replace function app.is_client_of(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select exists (
    select 1 from clients
    where tenant_id = p_tenant and user_id = auth.uid()
  );
$$;

-- Does the given client row belong to the current user?
create or replace function app.owns_client(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select exists (
    select 1 from clients
    where id = p_client and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Public branding lookup (safe subset) for anonymous branded pages.
-- Avoids exposing the whole tenants table to anon.
-- ---------------------------------------------------------------------------
create or replace function public.tenant_branding(p_subdomain citext)
returns table (id uuid, name text, subdomain citext, branding jsonb)
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select id, name, subdomain, branding
  from tenants
  where subdomain = p_subdomain and is_active = true;
$$;

grant execute on function public.tenant_branding(citext) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Audit logging helper (usable from user context; bypasses audit_log RLS).
-- ---------------------------------------------------------------------------
create or replace function public.log_audit(
  p_tenant uuid,
  p_action text,
  p_target_table text default null,
  p_target_id text default null,
  p_changes jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into audit_log (tenant_id, actor_user_id, action, target_table, target_id, changes)
  values (p_tenant, auth.uid(), p_action, p_target_table, p_target_id, coalesce(p_changes, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.log_audit(uuid, text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Atomic tenant provisioning: create tenant + owner membership in one tx.
-- Called by the backend with the service role after an auth user exists.
-- ---------------------------------------------------------------------------
create or replace function public.provision_tenant(
  p_owner_user_id uuid,
  p_name text,
  p_subdomain citext,
  p_branding jsonb default '{}'::jsonb,
  p_plan_code text default null
)
returns tenants
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
declare
  v_plan_id uuid;
  v_tenant tenants;
begin
  if p_plan_code is not null then
    select id into v_plan_id from plans where code = p_plan_code and is_active = true;
    if v_plan_id is null then
      raise exception 'unknown or inactive plan code: %', p_plan_code
        using errcode = 'foreign_key_violation';
    end if;
  end if;

  insert into tenants (name, subdomain, branding, plan_id, owner_user_id)
  values (p_name, p_subdomain, coalesce(p_branding, '{}'::jsonb), v_plan_id, p_owner_user_id)
  returning * into v_tenant;

  insert into team_members (tenant_id, user_id, role)
  values (v_tenant.id, p_owner_user_id, 'owner');

  insert into audit_log (tenant_id, actor_user_id, action, target_table, target_id)
  values (v_tenant.id, p_owner_user_id, 'tenant.provisioned', 'tenants', v_tenant.id::text);

  return v_tenant;
end;
$$;

-- Only the service role provisions tenants (not exposed to anon/authenticated).
revoke all on function public.provision_tenant(uuid, text, citext, jsonb, text) from public;
