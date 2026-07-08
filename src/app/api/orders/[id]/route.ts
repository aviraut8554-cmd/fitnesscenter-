import { requireTenantActor } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk } from '@/lib/http';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Fetch a single order. RLS enforces owner/manager or owning-client access. */
export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id } = await ctx.params;
    const actor = await requireTenantActor(request);

    const { data, error } = await actor.supabase
      .from('orders')
      .select('*, payments(*), invoices(*)')
      .eq('tenant_id', actor.tenantId)
      .eq('id', id)
      .maybeSingle();

    if (error) throw ApiError.unprocessable(error.message);
    if (!data) throw ApiError.notFound('Order not found');

    return jsonOk({ order: data });
  })(request, {});
}
