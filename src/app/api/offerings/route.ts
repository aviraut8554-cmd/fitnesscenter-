import type { Json } from '@/lib/database.types';
import { requireTeamMember } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { offeringCreateSchema, type OfferingCreateInput } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** Build the product + class rows a single offering maps to. */
function toRows(input: OfferingCreateInput) {
  const isRecorded = input.classType === 'recorded';
  const amountMinor = input.pricingType === 'free' ? 0 : (input.amountMinor ?? 0);
  const schedule = input.schedule
    ? {
        days: input.schedule.days ?? [],
        startTime: input.schedule.startTime ?? null,
        endTime: input.schedule.endTime ?? null,
        accessLink: input.schedule.accessLink ?? null,
      }
    : {};

  return {
    isRecorded,
    product: {
      type: (isRecorded ? 'course' : 'live_class') as 'course' | 'live_class',
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
    },
    schedule: schedule as Json,
  };
}

/**
 * List offerings (classes joined with their linked store product) for the
 * admin view. Any team member may read.
 */
export const GET = handleRoute(async (request) => {
  const { supabase, tenantId } = await requireTeamMember(request);

  const { data, error } = await supabase
    .from('classes')
    .select('*, product:products_services(*)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) throw ApiError.unprocessable(error.message);

  return jsonOk({ offerings: data ?? [] });
});

/**
 * Create an offering: one submit provisions the sellable product AND its linked
 * class/batch. Owner/manager only. If the class insert fails we roll back the
 * product so we never leave an orphaned store item.
 */
export const POST = handleRoute(async (request) => {
  const { supabase, tenantId } = await requireTeamMember(request, ['owner', 'manager']);
  const input = await parseJson(request, offeringCreateSchema);
  const { isRecorded, product, schedule } = toRows(input);

  const { data: productRow, error: productErr } = await supabase
    .from('products_services')
    .insert({ tenant_id: tenantId, ...product })
    .select()
    .single();
  if (productErr) throw ApiError.unprocessable(productErr.message);

  const { data: classRow, error: classErr } = await supabase
    .from('classes')
    .insert({
      tenant_id: tenantId,
      product_id: productRow.id,
      title: input.name,
      description: input.description ?? null,
      instructor_id: input.instructorId ?? null,
      capacity: input.capacity ?? null,
      is_recorded: isRecorded,
      schedule,
    })
    .select('*, product:products_services(*)')
    .single();

  if (classErr) {
    await supabase.from('products_services').delete().eq('id', productRow.id);
    throw ApiError.unprocessable(classErr.message);
  }

  return jsonOk({ offering: classRow }, 201);
});
