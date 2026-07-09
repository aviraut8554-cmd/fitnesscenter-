import type { Json } from '@/lib/database.types';
import { requireTeamMember } from '@/lib/auth';
import { resolveInstructorNames } from '@/lib/class-service';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import {
  offeringCreateSchema,
  type OfferingBatchInput,
  type OfferingCreateInput,
} from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** Product row for an offering. Type is live unless every batch is recorded. */
function productRow(input: OfferingCreateInput) {
  const anyLive = input.batches.some((b) => b.classType !== 'recorded');
  const amountMinor = input.pricingType === 'free' ? 0 : (input.amountMinor ?? 0);
  return {
    type: (anyLive ? 'live_class' : 'course') as 'course' | 'live_class',
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
}

/** Class (batch) row from one batch input. */
export function batchRow(
  input: OfferingBatchInput,
  tenantId: string,
  productId: string,
  title: string,
) {
  const schedule = input.schedule
    ? {
        days: input.schedule.days ?? [],
        startTime: input.schedule.startTime ?? null,
        endTime: input.schedule.endTime ?? null,
        accessLink: input.schedule.accessLink ?? null,
      }
    : {};
  return {
    tenant_id: tenantId,
    product_id: productId,
    title,
    instructor_id: input.instructorId ?? null,
    capacity: input.capacity ?? null,
    is_recorded: input.classType === 'recorded',
    schedule: schedule as Json,
  };
}

/**
 * List offerings for the admin view: products that have at least one batch,
 * each with its batches (instructor + enrollment counts). Products with no
 * class attached are plain store products and live on the Products page.
 */
export const GET = handleRoute(async (request) => {
  const { supabase, tenantId } = await requireTeamMember(request);

  const { data, error } = await supabase
    .from('products_services')
    .select(
      '*, batches:classes!classes_product_id_fkey(*, sessions:class_sessions(*), enrollments(count))',
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) throw ApiError.unprocessable(error.message);

  const withBatches = (data ?? []).filter(
    (p) => Array.isArray(p.batches) && p.batches.length > 0,
  );

  // `team_members` has no name column — names live in auth metadata.
  const names = await resolveInstructorNames(
    tenantId,
    withBatches
      .flatMap((p) => p.batches.map((b) => b.instructor_id))
      .filter((id): id is string => Boolean(id)),
  );
  const offerings = withBatches.map((p) => ({
    ...p,
    batches: p.batches.map((b) => ({
      ...b,
      instructor: b.instructor_id
        ? { id: b.instructor_id, name: names.get(b.instructor_id) ?? 'Coach' }
        : null,
    })),
  }));
  return jsonOk({ offerings });
});

/**
 * Create an offering: one submit provisions the sellable product AND one or
 * more linked batches. Owner/manager only. Rolls the product back if a batch
 * insert fails so we never leave an orphaned store item.
 */
export const POST = handleRoute(async (request) => {
  const { supabase, tenantId } = await requireTeamMember(request, ['owner', 'manager']);
  const input = await parseJson(request, offeringCreateSchema);

  const { data: product, error: productErr } = await supabase
    .from('products_services')
    .insert({ tenant_id: tenantId, ...productRow(input) })
    .select()
    .single();
  if (productErr) throw ApiError.unprocessable(productErr.message);

  const rows = input.batches.map((b) => batchRow(b, tenantId, product.id, input.name));
  const { data: classes, error: classErr } = await supabase
    .from('classes')
    .insert(rows)
    .select();
  if (classErr || !classes) {
    await supabase.from('products_services').delete().eq('id', product.id);
    throw ApiError.unprocessable(classErr?.message ?? 'Could not create batches');
  }

  // Persist which batch is the auto-assign default (first if none marked).
  const defaultIdx = input.batches.findIndex((b) => b.isDefault);
  const defaultClassId = classes[defaultIdx >= 0 ? defaultIdx : 0]?.id ?? null;
  await supabase
    .from('products_services')
    .update({ default_class_id: defaultClassId })
    .eq('id', product.id);

  return jsonOk({ offering: { ...classes[0], product } }, 201);
});
