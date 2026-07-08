import type { MeResponse } from '@/lib/admin-types';
import { requireTenantActor } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { clientProfileUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** The signed-in client's own account (PWA profile). Team members get 403. */
export const GET = handleRoute(async (request) => {
  const actor = await requireTenantActor(request);
  if (actor.kind !== 'client') {
    throw ApiError.forbidden('Only clients have a personal profile');
  }
  const { supabase, clientId, tenantId } = actor;

  const [{ data: client, error }, { data: tenant }] = await Promise.all([
    supabase.from('clients').select('id, full_name, email, phone').eq('id', clientId).maybeSingle(),
    supabase.from('tenants').select('name').eq('id', tenantId).maybeSingle(),
  ]);
  if (error) throw ApiError.unprocessable(error.message);
  if (!client) throw ApiError.notFound('Client not found');

  const response: MeResponse = {
    client,
    tenant: tenant ? { name: tenant.name } : null,
  };
  return jsonOk(response);
});

/** Update the signed-in client's own name/phone. RLS restricts to their row. */
export const PATCH = handleRoute(async (request) => {
  const actor = await requireTenantActor(request);
  if (actor.kind !== 'client') {
    throw ApiError.forbidden('Only clients can edit their profile');
  }
  const { supabase, clientId } = actor;
  const input = await parseJson(request, clientProfileUpdateSchema);

  const patch: { full_name?: string; phone?: string } = {};
  if (input.fullName !== undefined) patch.full_name = input.fullName;
  if (input.phone !== undefined) patch.phone = input.phone;

  const { data, error } = await supabase
    .from('clients')
    .update(patch)
    .eq('id', clientId)
    .select('id, full_name, email, phone')
    .maybeSingle();
  if (error) throw ApiError.unprocessable(error.message);
  if (!data) throw ApiError.notFound('Client not found');

  return jsonOk({ client: data });
});
