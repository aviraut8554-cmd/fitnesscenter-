import type { User } from '@supabase/supabase-js';
import type { TeamRole } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * Server-side session helpers for React Server Components (cookie-based auth).
 * The API route helpers in `@/lib/auth` operate on a `Request`; these operate
 * on the ambient request cookies so layouts/pages can resolve the viewer.
 */

export type TeamMembership = { tenantId: string; role: TeamRole };
export type ClientMembership = { tenantId: string; clientId: string; fullName: string };

export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

/** The caller's single team membership, or null if they are not a team member. */
export async function getTeamMembership(): Promise<TeamMembership | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('team_members')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { tenantId: data.tenant_id, role: data.role };
}

/** The caller's client record, or null if they are not a client. */
export async function getClientMembership(): Promise<ClientMembership | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('clients')
    .select('tenant_id, id, full_name')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { tenantId: data.tenant_id, clientId: data.id, fullName: data.full_name };
}
