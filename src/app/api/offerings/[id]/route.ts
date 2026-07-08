import type { Database, Json } from '@/lib/database.types';
import { requireTeamMember } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { offeringUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type ProductUpdate = Database['public']['Tables']['products_services']['Update'];
type ClassUpdate = Database['public']['Tables']['classes']['Update'];
type Ctx = { params: Promise<{ id: string }> };

/**
 * Update an offering: patches both the linked product and its class in one
 * call. `id` is the class id. Owner/manager only.
 */
export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id } = await ctx.params;
    const { supabase, tenantId } = await requireTeamMember(request, ['owner', 'manager']);
    const input = await parseJson(request, offeringUpdateSchema);

    const { data: existing, error: findErr } = await supabase
      .from('classes')
      .select('id, product_id')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (findErr) throw ApiError.unprocessable(findErr.message);
    if (!existing) throw ApiError.notFound('Offering not found');

    const isRecorded = input.classType === 'recorded';
    const amountMinor = input.pricingType === 'free' ? 0 : (input.amountMinor ?? 0);
    const schedule = {
      days: input.schedule?.days ?? [],
      startTime: input.schedule?.startTime ?? null,
      endTime: input.schedule?.endTime ?? null,
      accessLink: input.schedule?.accessLink ?? null,
    } as Json;

    if (existing.product_id) {
      const productPatch: ProductUpdate = {
        type: isRecorded ? 'course' : 'live_class',
        name: input.name,
        description: input.description ?? null,
        amount_minor: amountMinor,
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
      };
      const { error: pErr } = await supabase
        .from('products_services')
        .update(productPatch)
        .eq('tenant_id', tenantId)
        .eq('id', existing.product_id);
      if (pErr) throw ApiError.unprocessable(pErr.message);
    }

    const classPatch: ClassUpdate = {
      title: input.name,
      description: input.description ?? null,
      instructor_id: input.instructorId ?? null,
      capacity: input.capacity ?? null,
      is_recorded: isRecorded,
      schedule,
    };
    const { data, error } = await supabase
      .from('classes')
      .update(classPatch)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select('*, product:products_services(*)')
      .maybeSingle();
    if (error) throw ApiError.unprocessable(error.message);
    if (!data) throw ApiError.notFound('Offering not found');

    return jsonOk({ offering: data });
  })(request, {});
}
