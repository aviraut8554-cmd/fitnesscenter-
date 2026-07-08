import type { Json } from '@/lib/database.types';
import { requireUser } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { healthFormSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Resolve the client row visible to the caller (RLS: team member of the
 * client's tenant, or the client themselves). Returns the tenant_id needed to
 * insert a versioned health form.
 */
async function resolveClient(
  supabase: Awaited<ReturnType<typeof requireUser>>['supabase'],
  clientId: string,
): Promise<{ tenantId: string }> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, tenant_id')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw ApiError.unprocessable(error.message);
  if (!data) throw ApiError.notFound('Client not found');
  return { tenantId: data.tenant_id };
}

/** List a client's health form versions (newest first). */
export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id } = await ctx.params;
    const { supabase } = await requireUser(request);
    await resolveClient(supabase, id);

    const { data, error } = await supabase
      .from('health_forms')
      .select('*')
      .eq('client_id', id)
      .order('version', { ascending: false });

    if (error) throw ApiError.unprocessable(error.message);
    return jsonOk({ healthForms: data });
  })(request, {});
}

/** Submit a new health form version. Version is assigned server-side. */
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id } = await ctx.params;
    const { supabase } = await requireUser(request);
    const { tenantId } = await resolveClient(supabase, id);
    const input = await parseJson(request, healthFormSchema);

    const { data, error } = await supabase
      .from('health_forms')
      .insert({
        tenant_id: tenantId,
        client_id: id,
        data: input.data as Json,
      })
      .select()
      .single();

    if (error) throw ApiError.unprocessable(error.message);
    return jsonOk({ healthForm: data }, 201);
  })(request, {});
}
