import type { User } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { createServerSupabase } from '@/lib/supabase/server';
import { ApiError } from '@/lib/http';

export type TeamRole = Database['public']['Enums']['team_role'];
export type ServerSupabase = Awaited<ReturnType<typeof createServerSupabase>>;

export interface AuthedRequest {
  supabase: ServerSupabase;
  user: User;
}

function bearerToken(request: Request): string | undefined {
  const header = request.headers.get('authorization');
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

/** Resolve the current session (bearer token or cookie), or throw 401. */
export async function requireUser(request: Request): Promise<AuthedRequest> {
  const token = bearerToken(request);
  const supabase = await createServerSupabase(token);
  const { data, error } = token
    ? await supabase.auth.getUser(token)
    : await supabase.auth.getUser();
  if (error || !data.user) {
    throw ApiError.unauthorized();
  }
  return { supabase, user: data.user };
}

const TENANT_HEADER = 'x-tenant-id';

export interface TeamContext extends AuthedRequest {
  tenantId: string;
  role: TeamRole;
}

/**
 * Resolve the tenant the request operates on for a team member, and their role.
 * Tenant selection: an explicit `x-tenant-id` header when the user belongs to
 * multiple tenants, otherwise the user's single membership. Authorization is
 * still enforced by RLS on every subsequent query; this only resolves context
 * and rejects roles below `minRole` early with a clear error.
 */
export async function requireTeamMember(
  request: Request,
  allowedRoles?: TeamRole[],
): Promise<TeamContext> {
  const { supabase, user } = await requireUser(request);

  // Only the caller's own memberships. RLS lets a team member read the whole
  // tenant roster, so this must filter by user_id or a multi-member tenant is
  // mistaken for the caller belonging to multiple tenants.
  const { data: memberships, error } = await supabase
    .from('team_members')
    .select('tenant_id, role')
    .eq('user_id', user.id);
  if (error) {
    throw new ApiError(500, 'internal_error', 'Failed to resolve membership');
  }
  if (!memberships || memberships.length === 0) {
    throw ApiError.forbidden('You are not a member of any tenant');
  }

  const requestedTenant = request.headers.get(TENANT_HEADER);
  let membership;
  if (requestedTenant) {
    membership = memberships.find((m) => m.tenant_id === requestedTenant);
    if (!membership) {
      throw ApiError.forbidden('You are not a member of the requested tenant');
    }
  } else if (memberships.length === 1) {
    membership = memberships[0];
  } else {
    throw ApiError.badRequest(
      `Ambiguous tenant: pass the ${TENANT_HEADER} header (member of ${memberships.length} tenants)`,
    );
  }

  if (allowedRoles && !allowedRoles.includes(membership.role)) {
    throw ApiError.forbidden(
      `Requires role: ${allowedRoles.join(' or ')}; you are ${membership.role}`,
    );
  }

  return { supabase, user, tenantId: membership.tenant_id, role: membership.role };
}

/** A team member (with role) or a client, resolved for a single tenant. */
export type TenantActor =
  | ({ kind: 'team'; role: TeamRole } & AuthedRequest & { tenantId: string })
  | ({ kind: 'client'; clientId: string } & AuthedRequest & { tenantId: string });

/**
 * Resolve the tenant context for either a team member or a client. Used by
 * endpoints both roles can reach (e.g. checkout). A team member is resolved
 * exactly as `requireTeamMember` (honouring `x-tenant-id`); otherwise the
 * caller's single client row determines the tenant. Throws 403 if neither.
 */
export async function requireTenantActor(request: Request): Promise<TenantActor> {
  const { supabase, user } = await requireUser(request);

  const { data: memberships, error: mErr } = await supabase
    .from('team_members')
    .select('tenant_id, role')
    .eq('user_id', user.id);
  if (mErr) throw new ApiError(500, 'internal_error', 'Failed to resolve membership');

  if (memberships && memberships.length > 0) {
    const ctx = await requireTeamMember(request);
    return { kind: 'team', ...ctx };
  }

  const { data: clientRows, error: cErr } = await supabase
    .from('clients')
    .select('id, tenant_id')
    .eq('user_id', user.id);
  if (cErr) throw new ApiError(500, 'internal_error', 'Failed to resolve client');

  if (!clientRows || clientRows.length === 0) {
    throw ApiError.forbidden('You are not a member or client of any tenant');
  }
  if (clientRows.length > 1) {
    // A user could be a client under multiple tenants; require disambiguation.
    const requested = request.headers.get('x-tenant-id');
    const row = requested ? clientRows.find((c) => c.tenant_id === requested) : undefined;
    if (!row) {
      throw ApiError.badRequest(
        'Ambiguous tenant: pass the x-tenant-id header (client of multiple tenants)',
      );
    }
    return { kind: 'client', clientId: row.id, tenantId: row.tenant_id, supabase, user };
  }

  return {
    kind: 'client',
    clientId: clientRows[0].id,
    tenantId: clientRows[0].tenant_id,
    supabase,
    user,
  };
}
