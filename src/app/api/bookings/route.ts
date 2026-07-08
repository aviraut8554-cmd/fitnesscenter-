import type { Database } from '@/lib/database.types';
import { requireTenantActor } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { bookingCreateSchema } from '@/lib/validation';
import { generateSlots, hasConflict } from '@/lib/booking';
import {
  loadAvailabilityRules,
  loadBookingSettings,
  loadBusyIntervals,
} from '@/lib/booking-service';

export const dynamic = 'force-dynamic';

/**
 * List bookings. RLS scopes visibility: team members see all of the tenant's
 * bookings; a client sees only their own. Optional `?status=` filter.
 */
export const GET = handleRoute(async (request) => {
  const { supabase, tenantId } = await requireTenantActor(request);
  const status = new URL(request.url).searchParams.get('status');

  let query = supabase
    .from('bookings')
    .select(
      '*, client:clients(full_name, email), product:products_services(name, type), team_member:team_members(role)',
    )
    .eq('tenant_id', tenantId)
    .order('slot_start', { ascending: true });
  if (status) {
    query = query.eq('status', status as Database['public']['Enums']['booking_status']);
  }

  const { data, error } = await query;
  if (error) throw ApiError.unprocessable(error.message);

  return jsonOk({ bookings: data });
});

/**
 * Create a booking. Clients book for themselves; team members may book on
 * behalf of a client (`clientId` required). The requested `slotStart` must be a
 * bookable slot from the coach's availability, satisfy the notice policy and
 * not clash with an existing booking. The DB exclusion constraint is the final
 * guard against a race (→ 409).
 */
export const POST = handleRoute(async (request) => {
  const actor = await requireTenantActor(request);
  const { supabase, tenantId } = actor;
  const input = await parseJson(request, bookingCreateSchema);

  const clientId = actor.kind === 'client' ? actor.clientId : input.clientId;
  if (!clientId) throw ApiError.badRequest('clientId is required when booking for a client');

  const settings = await loadBookingSettings(supabase, tenantId);
  const rules = await loadAvailabilityRules(supabase, tenantId, input.teamMemberId);

  const slotStart = new Date(input.slotStart);
  if (Number.isNaN(slotStart.getTime())) throw ApiError.badRequest('slotStart is invalid');
  const slotEnd = new Date(slotStart.getTime() + settings.slotMinutes * 60000);

  const buffer = settings.bufferMinutes * 60000;
  const busy = await loadBusyIntervals(
    supabase,
    tenantId,
    input.teamMemberId,
    new Date(slotStart.getTime() - buffer),
    new Date(slotEnd.getTime() + buffer),
  );

  if (hasConflict(slotStart, slotEnd, busy, settings.bufferMinutes)) {
    throw ApiError.conflict('That time is no longer available');
  }
  const valid = generateSlots({ rules, settings, from: slotStart, to: slotEnd, busy }).length === 1;
  if (!valid) {
    throw ApiError.unprocessable(
      'Requested time is outside the coach’s availability or does not meet the notice window',
    );
  }

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      tenant_id: tenantId,
      client_id: clientId,
      team_member_id: input.teamMemberId,
      product_id: input.productId ?? null,
      slot_start: slotStart.toISOString(),
      slot_end: slotEnd.toISOString(),
      status: 'scheduled',
      notes: input.notes ?? null,
    })
    .select()
    .single();

  if (error) {
    // exclusion_violation: the coach was double-booked in a race.
    if (error.code === '23P01') throw ApiError.conflict('That time was just booked');
    throw ApiError.unprocessable(error.message);
  }

  return jsonOk({ booking: data }, 201);
});
