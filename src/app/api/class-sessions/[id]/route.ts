import type { Database } from '@/lib/database.types';
import { requireTeamMember } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { classSessionUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type SessionUpdate = Database['public']['Tables']['class_sessions']['Update'];
type Ctx = { params: Promise<{ id: string }> };

/**
 * Update a session (owner/manager): reschedule, set/replace the live link or
 * recording URL, or adjust capacity.
 */
export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id } = await ctx.params;
    const { supabase, tenantId } = await requireTeamMember(request, ['owner', 'manager']);
    const input = await parseJson(request, classSessionUpdateSchema);

    // If only one of starts/ends is supplied, validate against the stored value.
    if ((input.startsAt === undefined) !== (input.endsAt === undefined)) {
      const cur = await supabase
        .from('class_sessions')
        .select('starts_at, ends_at')
        .eq('tenant_id', tenantId)
        .eq('id', id)
        .maybeSingle();
      if (cur.error) throw ApiError.unprocessable(cur.error.message);
      if (!cur.data) throw ApiError.notFound('Session not found');
      const starts = new Date(input.startsAt ?? cur.data.starts_at);
      const ends = new Date(input.endsAt ?? cur.data.ends_at);
      if (ends <= starts) throw ApiError.badRequest('endsAt must be after startsAt');
    }

    const patch: SessionUpdate = {};
    if (input.startsAt !== undefined) patch.starts_at = input.startsAt;
    if (input.endsAt !== undefined) patch.ends_at = input.endsAt;
    if (input.liveLink !== undefined) patch.live_link = input.liveLink;
    if (input.recordingUrl !== undefined) patch.recording_url = input.recordingUrl;
    if (input.capacity !== undefined) patch.capacity = input.capacity;

    const { data, error } = await supabase
      .from('class_sessions')
      .update(patch)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw ApiError.unprocessable(error.message);
    if (!data) throw ApiError.notFound('Session not found');

    return jsonOk({ session: data });
  })(request, {});
}

/** Delete a session (owner/manager). Attendance rows cascade. */
export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id } = await ctx.params;
    const { supabase, tenantId } = await requireTeamMember(request, ['owner', 'manager']);

    const { error } = await supabase
      .from('class_sessions')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', id);
    if (error) throw ApiError.unprocessable(error.message);

    return jsonOk({ deleted: true });
  })(request, {});
}
