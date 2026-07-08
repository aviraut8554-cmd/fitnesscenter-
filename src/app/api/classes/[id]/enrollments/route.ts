import { requireTeamMember } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { enrollmentCreateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** List a class's enrollments with client details (team members). */
export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id: classId } = await ctx.params;
    const { supabase, tenantId } = await requireTeamMember(request);

    const { data, error } = await supabase
      .from('enrollments')
      .select('*, client:clients(full_name, email)')
      .eq('tenant_id', tenantId)
      .eq('class_id', classId)
      .order('created_at', { ascending: true });
    if (error) throw ApiError.unprocessable(error.message);

    return jsonOk({ enrollments: data ?? [] });
  })(request, {});
}

/** Manually enroll a client into a class (owner/manager). */
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id: classId } = await ctx.params;
    const { supabase, tenantId } = await requireTeamMember(request, ['owner', 'manager']);
    const input = await parseJson(request, enrollmentCreateSchema);

    const { data, error } = await supabase
      .from('enrollments')
      .insert({
        tenant_id: tenantId,
        class_id: classId,
        client_id: input.clientId,
        status: input.status ?? 'active',
      })
      .select('*, client:clients(full_name, email)')
      .single();
    if (error) {
      if (error.code === '23505') throw ApiError.conflict('Client is already enrolled');
      if (error.code === '23503') throw ApiError.badRequest('Unknown class or client');
      throw ApiError.unprocessable(error.message);
    }

    return jsonOk({ enrollment: data }, 201);
  })(request, {});
}
