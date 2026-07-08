import { requireTenantActor } from '@/lib/auth';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { ApiError, handleRoute, jsonOk } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * Bookable coaches for the caller's tenant: team members that have at least one
 * availability window. Reachable by clients too (they cannot read
 * `team_members` directly), so it returns a minimal display subset (id, name,
 * role) resolved via the service role — never emails or other PII.
 */
export const GET = handleRoute(async (request) => {
  const { supabase, tenantId } = await requireTenantActor(request);

  // Coaches with availability (availability_rules is client-readable via RLS).
  const { data: rules, error } = await supabase
    .from('availability_rules')
    .select('team_member_id')
    .eq('tenant_id', tenantId);
  if (error) throw ApiError.unprocessable(error.message);

  const memberIds = [...new Set((rules ?? []).map((r) => r.team_member_id))];
  if (memberIds.length === 0) return jsonOk({ coaches: [] });

  const admin = createAdminSupabase();
  const { data: members, error: mErr } = await admin
    .from('team_members')
    .select('id, user_id, role')
    .eq('tenant_id', tenantId)
    .in('id', memberIds);
  if (mErr) throw ApiError.unprocessable(mErr.message);

  const coaches = await Promise.all(
    (members ?? []).map(async (m) => {
      const { data: authUser } = await admin.auth.admin.getUserById(m.user_id);
      const name =
        (authUser.user?.user_metadata?.name as string | undefined) ??
        authUser.user?.email?.split('@')[0] ??
        'Coach';
      return { id: m.id, name, role: m.role };
    }),
  );
  coaches.sort((a, b) => a.name.localeCompare(b.name));

  return jsonOk({ coaches });
});
