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

  const { data: memberships, error } = await supabase
    .from('team_members')
    .select('tenant_id, role');
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
