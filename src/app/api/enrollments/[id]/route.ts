import { requireTeamMember } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { enrollmentUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Change an enrollment's status (owner/manager). */
export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id } = await ctx.params;
    const { supabase, tenantId } = await requireTeamMember(request, ['owner', 'manager']);
    const input = await parseJson(request, enrollmentUpdateSchema);

    const { data, error } = await supabase
      .from('enrollments')
      .update({ status: input.status })
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw ApiError.unprocessable(error.message);
    if (!data) throw ApiError.notFound('Enrollment not found');

    return jsonOk({ enrollment: data });
  })(request, {});
}

/** Remove an enrollment (owner/manager). */
export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id } = await ctx.params;
    const { supabase, tenantId } = await requireTeamMember(request, ['owner', 'manager']);

    const { error } = await supabase
      .from('enrollments')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', id);
    if (error) throw ApiError.unprocessable(error.message);

    return jsonOk({ deleted: true });
  })(request, {});
}
