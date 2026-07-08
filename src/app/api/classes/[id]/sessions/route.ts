import { requireTeamMember } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { classSessionCreateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Add a session to a class (owner/manager). */
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id: classId } = await ctx.params;
    const { supabase, tenantId } = await requireTeamMember(request, ['owner', 'manager']);
    const input = await parseJson(request, classSessionCreateSchema);

    // Confirm the class belongs to the tenant (RLS also guards, but this yields
    // a clean 404 instead of a FK error).
    const parent = await supabase
      .from('classes')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', classId)
      .maybeSingle();
    if (parent.error) throw ApiError.unprocessable(parent.error.message);
    if (!parent.data) throw ApiError.notFound('Class not found');

    const { data, error } = await supabase
      .from('class_sessions')
      .insert({
        tenant_id: tenantId,
        class_id: classId,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        live_link: input.liveLink ?? null,
        recording_url: input.recordingUrl ?? null,
        capacity: input.capacity ?? null,
      })
      .select()
      .single();
    if (error) throw ApiError.unprocessable(error.message);

    return jsonOk({ session: data }, 201);
  })(request, {});
}
