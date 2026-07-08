import { requireTeamMember } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk } from '@/lib/http';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Delete an availability window (owner/manager only). */
export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id } = await ctx.params;
    const { supabase, tenantId } = await requireTeamMember(request, ['owner', 'manager']);

    const { data, error } = await supabase
      .from('availability_rules')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) throw ApiError.unprocessable(error.message);
    if (!data) throw ApiError.notFound('Availability window not found');

    return jsonOk({ deleted: data.id });
  })(request, {});
}
