import type { Database, Json } from '@/lib/database.types';
import { requireTeamMember } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { clientCreateSchema } from '@/lib/validation';

type ClientStatus = Database['public']['Enums']['client_status'];

export const dynamic = 'force-dynamic';

/** List clients for the caller's tenant. RLS additionally scopes visibility. */
export const GET = handleRoute(async (request) => {
  const { supabase, tenantId } = await requireTeamMember(request);

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const search = url.searchParams.get('q');

  let query = supabase
    .from('clients')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status as ClientStatus);
  if (search) query = query.ilike('full_name', `%${search}%`);

  const { data, error } = await query;
  if (error) throw ApiError.unprocessable(error.message);

  return jsonOk({ clients: data });
});

/** Create a client under the caller's tenant. Any team role may add clients. */
export const POST = handleRoute(async (request) => {
  const { supabase, tenantId } = await requireTeamMember(request);
  const input = await parseJson(request, clientCreateSchema);

  const { data, error } = await supabase
    .from('clients')
    .insert({
      tenant_id: tenantId,
      full_name: input.fullName,
      email: input.email,
      phone: input.phone ?? null,
      status: input.status ?? 'trial',
      notes: input.notes ?? null,
      metadata: (input.metadata ?? {}) as Json,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw ApiError.conflict('A client with this email already exists');
    }
    throw ApiError.unprocessable(error.message);
  }

  return jsonOk({ client: data }, 201);
});
