import { requireTeamMember } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk } from '@/lib/http';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Delete an automation rule (owner/manager). */
export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id } = await ctx.params;
    const { supabase, tenantId } = await requireTeamMember(request, ['owner', 'manager']);

    const { error } = await supabase
      .from('automation_rules')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', id);
    if (error) throw ApiError.unprocessable(error.message);

    return jsonOk({ deleted: true });
  })(request, {});
}
