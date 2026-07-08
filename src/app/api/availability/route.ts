import { requireTeamMember, requireTenantActor } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { availabilityCreateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** 'HH:MM' or 'HH:MM:SS' → seconds since midnight, for overlap comparison. */
function toSeconds(t: string): number {
  const [h, m, s] = t.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

/**
 * List availability windows for the tenant (team members and clients).
 * Optional `?teamMemberId=` filters to a single coach.
 */
export const GET = handleRoute(async (request) => {
  const { supabase, tenantId } = await requireTenantActor(request);
  const teamMemberId = new URL(request.url).searchParams.get('teamMemberId');

  let query = supabase
    .from('availability_rules')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('weekday', { ascending: true })
    .order('start_time', { ascending: true });
  if (teamMemberId) query = query.eq('team_member_id', teamMemberId);

  const { data, error } = await query;
  if (error) throw ApiError.unprocessable(error.message);

  return jsonOk({ rules: data });
});

/** Add an availability window for a coach (owner/manager only). */
export const POST = handleRoute(async (request) => {
  const { supabase, tenantId } = await requireTeamMember(request, ['owner', 'manager']);
  const input = await parseJson(request, availabilityCreateSchema);

  // The coach must belong to this tenant (RLS also scopes the read).
  const { data: member, error: mErr } = await supabase
    .from('team_members')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('id', input.teamMemberId)
    .maybeSingle();
  if (mErr) throw ApiError.unprocessable(mErr.message);
  if (!member) throw ApiError.badRequest('teamMemberId is not a member of this tenant');

  // Reject a window that duplicates or overlaps an existing one for the same
  // coach on the same weekday, so the availability list stays clean.
  const { data: existing, error: exErr } = await supabase
    .from('availability_rules')
    .select('start_time, end_time')
    .eq('tenant_id', tenantId)
    .eq('team_member_id', input.teamMemberId)
    .eq('weekday', input.weekday);
  if (exErr) throw ApiError.unprocessable(exErr.message);

  const newStart = toSeconds(input.startTime);
  const newEnd = toSeconds(input.endTime);
  const clash = (existing ?? []).some(
    (r) => newStart < toSeconds(r.end_time) && toSeconds(r.start_time) < newEnd,
  );
  if (clash) {
    throw ApiError.conflict(
      'This overlaps an existing window for that coach on that day. Remove or adjust it first.',
    );
  }

  const { data, error } = await supabase
    .from('availability_rules')
    .insert({
      tenant_id: tenantId,
      team_member_id: input.teamMemberId,
      weekday: input.weekday,
      start_time: input.startTime,
      end_time: input.endTime,
    })
    .select()
    .single();
  if (error) throw ApiError.unprocessable(error.message);

  return jsonOk({ rule: data }, 201);
});
