import type { Database, Json } from '@/lib/database.types';
import { requireTeamMember, requireTenantActor } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { productUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type ProductUpdate = Database['public']['Tables']['products_services']['Update'];
type Ctx = { params: Promise<{ id: string }> };

/**
 * Fetch a single product/service in the caller's tenant. Reachable by team
 * members and clients; RLS hides inactive items from clients.
 */
export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id } = await ctx.params;
    const { supabase, tenantId } = await requireTenantActor(request);

    const { data, error } = await supabase
      .from('products_services')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();

    if (error) throw ApiError.unprocessable(error.message);
    if (!data) throw ApiError.notFound('Product not found');

    return jsonOk({ product: data });
  })(request, {});
}

/** Update a product/service (owner/manager only). */
export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id } = await ctx.params;
    const { supabase, tenantId } = await requireTeamMember(request, ['owner', 'manager']);
    const input = await parseJson(request, productUpdateSchema);

    const patch: ProductUpdate = {};
    if (input.type !== undefined) patch.type = input.type;
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.amountMinor !== undefined) patch.amount_minor = input.amountMinor;
    if (input.currency !== undefined) patch.currency = input.currency;
    if (input.billingCycle !== undefined) patch.billing_cycle = input.billingCycle;
    if (input.capacity !== undefined) patch.capacity = input.capacity;
    if (input.isActive !== undefined) patch.is_active = input.isActive;
    if (input.imageUrl !== undefined) patch.image_url = input.imageUrl;
    if (input.testimonials !== undefined) patch.testimonials = input.testimonials;
    if (input.isBestseller !== undefined) patch.is_bestseller = input.isBestseller;
    if (input.hasTrial !== undefined) patch.has_trial = input.hasTrial;
    if (input.trialPriceMinor !== undefined) patch.trial_price_minor = input.trialPriceMinor;
    if (input.trialDurationDays !== undefined) patch.trial_duration_days = input.trialDurationDays;
    if (input.metadata !== undefined) patch.metadata = input.metadata as Json;

    if (Object.keys(patch).length === 0) {
      throw ApiError.badRequest('No fields to update');
    }

    const { data, error } = await supabase
      .from('products_services')
      .update(patch)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw ApiError.unprocessable(error.message);
    if (!data) throw ApiError.notFound('Product not found');

    return jsonOk({ product: data });
  })(request, {});
}

/** Delete a product/service (owner/manager only). */
export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id } = await ctx.params;
    const { supabase, tenantId } = await requireTeamMember(request, ['owner', 'manager']);

    const { data, error } = await supabase
      .from('products_services')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      // FK restrict: a product referenced by orders cannot be hard-deleted.
      if (error.code === '23503') {
        throw ApiError.conflict('Product has orders; deactivate it instead');
      }
      throw ApiError.unprocessable(error.message);
    }
    if (!data) throw ApiError.notFound('Product not found');

    return jsonOk({ deleted: data.id });
  })(request, {});
}
