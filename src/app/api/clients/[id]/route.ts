import type { Database } from '@/lib/database.types';
import { requireTeamMember } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { clientUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type ClientUpdate = Database['public']['Tables']['clients']['Update'];

type Ctx = { params: Promise<{ id: string }> };

/** Fetch a single client in the caller's tenant. */
export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id } = await ctx.params;
    const { supabase, tenantId } = await requireTeamMember(request);

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();

    if (error) throw ApiError.unprocessable(error.message);
    if (!data) throw ApiError.notFound('Client not found');

    return jsonOk({ client: data });
  })(request, {});
}

/** Update mutable fields of a client. */
export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id } = await ctx.params;
    const { supabase, tenantId } = await requireTeamMember(request);
    const input = await parseJson(request, clientUpdateSchema);

    const patch: ClientUpdate = {};
    if (input.fullName !== undefined) patch.full_name = input.fullName;
    if (input.email !== undefined) patch.email = input.email;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.status !== undefined) patch.status = input.status;
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.metadata !== undefined) patch.metadata = input.metadata as ClientUpdate['metadata'];

    if (Object.keys(patch).length === 0) {
      throw ApiError.badRequest('No fields to update');
    }

    const { data, error } = await supabase
      .from('clients')
      .update(patch)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === '23505') throw ApiError.conflict('Email already in use');
      throw ApiError.unprocessable(error.message);
    }
    if (!data) throw ApiError.notFound('Client not found');

    return jsonOk({ client: data });
  })(request, {});
}

/** Delete a client (owner/manager only). */
export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id } = await ctx.params;
    const { supabase, tenantId } = await requireTeamMember(request, ['owner', 'manager']);

    const { data, error } = await supabase
      .from('clients')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) throw ApiError.unprocessable(error.message);
    if (!data) throw ApiError.notFound('Client not found');

    return jsonOk({ deleted: data.id });
  })(request, {});
}
