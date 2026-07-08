import type { Database, Json } from '@/lib/database.types';
import { requireTeamMember, requireTenantActor } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { productCreateSchema } from '@/lib/validation';

type ProductType = Database['public']['Enums']['product_type'];

export const dynamic = 'force-dynamic';

/**
 * List products/services for the caller's tenant. Reachable by both team
 * members and clients; RLS scopes visibility: team members see all, clients see
 * only active items (so they can browse the catalogue before checkout).
 */
export const GET = handleRoute(async (request) => {
  const { supabase, tenantId } = await requireTenantActor(request);

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const activeOnly = url.searchParams.get('active') === 'true';

  let query = supabase
    .from('products_services')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (type) query = query.eq('type', type as ProductType);
  if (activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) throw ApiError.unprocessable(error.message);

  return jsonOk({ products: data });
});

/** Create a product/service (owner or manager only). */
export const POST = handleRoute(async (request) => {
  const { supabase, tenantId } = await requireTeamMember(request, ['owner', 'manager']);
  const input = await parseJson(request, productCreateSchema);

  const { data, error } = await supabase
    .from('products_services')
    .insert({
      tenant_id: tenantId,
      type: input.type,
      name: input.name,
      description: input.description ?? null,
      amount_minor: input.amountMinor,
      currency: input.currency,
      billing_cycle: input.billingCycle,
      capacity: input.capacity ?? null,
      is_active: input.isActive,
      image_url: input.imageUrl ?? null,
      testimonials: input.testimonials ?? [],
      is_bestseller: input.isBestseller ?? false,
      has_trial: input.hasTrial ?? false,
      trial_price_minor: input.trialPriceMinor ?? null,
      trial_duration_days: input.trialDurationDays ?? null,
      metadata: (input.metadata ?? {}) as Json,
    })
    .select()
    .single();

  if (error) throw ApiError.unprocessable(error.message);

  return jsonOk({ product: data }, 201);
});
