import type { Database } from '@/lib/database.types';
import { requireTeamMember } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { offeringUpdateSchema } from '@/lib/validation';
import { batchRow } from '../route';

export const dynamic = 'force-dynamic';

type ProductUpdate = Database['public']['Tables']['products_services']['Update'];
type Ctx = { params: Promise<{ id: string }> };

/**
 * Update an offering (keyed by PRODUCT id): patches the product and reconciles
 * its batches — existing batches are updated, new ones inserted, and removed
 * ones deleted (unless they still have enrolled clients). Owner/manager only.
 */
export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id: productId } = await ctx.params;
    const { supabase, tenantId } = await requireTeamMember(request, ['owner', 'manager']);
    const input = await parseJson(request, offeringUpdateSchema);

    const { data: product, error: findErr } = await supabase
      .from('products_services')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', productId)
      .maybeSingle();
    if (findErr) throw ApiError.unprocessable(findErr.message);
    if (!product) throw ApiError.notFound('Offering not found');

    const anyLive = input.batches.some((b) => b.classType !== 'recorded');
    const amountMinor = input.pricingType === 'free' ? 0 : (input.amountMinor ?? 0);
    const productPatch: ProductUpdate = {
      type: anyLive ? 'live_class' : 'course',
      name: input.name,
      description: input.description ?? null,
      amount_minor: amountMinor,
      currency: input.currency,
      billing_cycle: input.billingCycle,
      is_active: input.isActive,
      image_url: input.imageUrl ?? null,
      testimonials: input.testimonials ?? [],
      is_bestseller: input.isBestseller ?? false,
      has_trial: input.hasTrial ?? false,
      trial_price_minor: input.trialPriceMinor ?? null,
      trial_duration_days: input.trialDurationDays ?? null,
    };
    const { error: pErr } = await supabase
      .from('products_services')
      .update(productPatch)
      .eq('tenant_id', tenantId)
      .eq('id', productId);
    if (pErr) throw ApiError.unprocessable(pErr.message);

    // Reconcile batches against the classes currently linked to this product.
    const { data: existing } = await supabase
      .from('classes')
      .select('id, enrollments(count)')
      .eq('tenant_id', tenantId)
      .eq('product_id', productId);
    const existingIds = new Set((existing ?? []).map((c) => c.id));
    const keepIds = new Set(input.batches.map((b) => b.id).filter(Boolean) as string[]);

    // Delete removed batches — but never one that still has enrolled clients.
    const toDelete = (existing ?? []).filter((c) => !keepIds.has(c.id));
    const blocked = toDelete.filter(
      (c) => (c.enrollments as { count: number }[] | null)?.[0]?.count,
    );
    if (blocked.length) {
      throw ApiError.conflict(
        'Cannot remove a batch that still has enrolled clients. Move them first.',
      );
    }
    for (const c of toDelete) {
      await supabase.from('classes').delete().eq('tenant_id', tenantId).eq('id', c.id);
    }

    // The class id the default batch resolves to (set after inserts).
    let defaultClassId: string | null = null;
    const defaultBatch = input.batches.find((b) => b.isDefault) ?? input.batches[0];

    for (const b of input.batches) {
      const row = batchRow(b, tenantId, productId, input.name);
      if (b.id && existingIds.has(b.id)) {
        await supabase
          .from('classes')
          .update({
            title: row.title,
            instructor_id: row.instructor_id,
            capacity: row.capacity,
            is_recorded: row.is_recorded,
            schedule: row.schedule,
          })
          .eq('tenant_id', tenantId)
          .eq('id', b.id);
        if (b === defaultBatch) defaultClassId = b.id;
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from('classes')
          .insert(row)
          .select('id')
          .single();
        if (insErr) throw ApiError.unprocessable(insErr.message);
        if (b === defaultBatch) defaultClassId = inserted.id;
      }
    }

    await supabase
      .from('products_services')
      .update({ default_class_id: defaultClassId })
      .eq('id', productId);

    const { data: offering, error } = await supabase
      .from('products_services')
      .select('*, batches:classes!classes_product_id_fkey(*, instructor:team_members(id, name), enrollments(count))')
      .eq('tenant_id', tenantId)
      .eq('id', productId)
      .maybeSingle();
    if (error) throw ApiError.unprocessable(error.message);

    return jsonOk({ offering });
  })(request, {});
}
