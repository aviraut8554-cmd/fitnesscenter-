import { createAdminSupabase } from '@/lib/supabase/admin';

/**
 * How long before a session's `starts_at` the live link becomes available to
 * enrolled clients, and how long after `ends_at` it stays available.
 */
export const LIVE_LINK_LEAD_MINUTES = 10;
export const LIVE_LINK_GRACE_MINUTES = 15;

/** Is a session "live" now (link should be exposed to enrolled clients)? */
export function isSessionLive(startsAt: string, endsAt: string, now = new Date()): boolean {
  const start = new Date(startsAt).getTime() - LIVE_LINK_LEAD_MINUTES * 60000;
  const end = new Date(endsAt).getTime() + LIVE_LINK_GRACE_MINUTES * 60000;
  const t = now.getTime();
  return t >= start && t <= end;
}

/**
 * Resolve display names for a set of team member ids via the service role.
 * `team_members` only stores `user_id`, and clients cannot read the table, so
 * name resolution always goes through the admin client (never leaks PII beyond
 * the name).
 */
export async function resolveInstructorNames(
  tenantId: string,
  memberIds: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const ids = [...new Set(memberIds.filter(Boolean))];
  if (ids.length === 0) return names;

  const admin = createAdminSupabase();
  const { data: members } = await admin
    .from('team_members')
    .select('id, user_id')
    .eq('tenant_id', tenantId)
    .in('id', ids);

  await Promise.all(
    (members ?? []).map(async (m) => {
      const { data: authUser } = await admin.auth.admin.getUserById(m.user_id);
      const name =
        (authUser.user?.user_metadata?.name as string | undefined) ??
        authUser.user?.email?.split('@')[0] ??
        'Coach';
      names.set(m.id, name);
    }),
  );
  return names;
}
