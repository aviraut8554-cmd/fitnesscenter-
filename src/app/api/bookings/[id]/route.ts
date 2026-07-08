import type { Database } from '@/lib/database.types';
import { requireTenantActor } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { bookingUpdateSchema } from '@/lib/validation';
import { generateSlots, hasConflict, withinCancelWindow } from '@/lib/booking';
import {
  loadAvailabilityRules,
  loadBookingSettings,
  loadBusyIntervals,
} from '@/lib/booking-service';

export const dynamic = 'force-dynamic';

type BookingUpdate = Database['public']['Tables']['bookings']['Update'];
type Ctx = { params: Promise<{ id: string }> };

/** Fetch a single booking (RLS scopes: team sees all, client sees own). */
export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id } = await ctx.params;
    const { supabase, tenantId } = await requireTenantActor(request);

    const { data, error } = await supabase
      .from('bookings')
      .select(
        '*, client:clients(full_name, email), product:products_services(name, type), team_member:team_members(role)',
      )
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw ApiError.unprocessable(error.message);
    if (!data) throw ApiError.notFound('Booking not found');

    return jsonOk({ booking: data });
  })(request, {});
}

/**
 * Update a booking: reschedule (`slotStart`), change status
 * (`cancelled`/`completed`/`no_show`), or edit notes.
 *
 * - Clients may only cancel or reschedule their own booking, and only while it
 *   is still outside the cancel-cutoff window. `completed`/`no_show` are team-only.
 * - Rescheduling validates the new slot exactly like creation and excludes the
 *   booking itself from conflict checks.
 */
export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id } = await ctx.params;
    const actor = await requireTenantActor(request);
    const { supabase, tenantId } = actor;
    const input = await parseJson(request, bookingUpdateSchema);
    const isClient = actor.kind === 'client';

    const current = await supabase
      .from('bookings')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (current.error) throw ApiError.unprocessable(current.error.message);
    if (!current.data) throw ApiError.notFound('Booking not found');
    const booking = current.data;

    if (booking.status === 'cancelled' || booking.status === 'completed') {
      throw ApiError.conflict(`Booking is already ${booking.status}`);
    }

    const settings = await loadBookingSettings(supabase, tenantId);
    const patch: BookingUpdate = {};

    if (input.notes !== undefined) patch.notes = input.notes;

    if (input.status !== undefined) {
      if (isClient && input.status !== 'cancelled') {
        throw ApiError.forbidden('Clients can only cancel a booking');
      }
      if (
        isClient &&
        !withinCancelWindow(new Date(booking.slot_start), settings.cancelCutoffMinutes)
      ) {
        throw ApiError.conflict('Too late to cancel — past the cancellation window');
      }
      patch.status = input.status;
    }

    if (input.slotStart !== undefined) {
      if (
        isClient &&
        !withinCancelWindow(new Date(booking.slot_start), settings.cancelCutoffMinutes)
      ) {
        throw ApiError.conflict('Too late to reschedule — past the cancellation window');
      }
      const slotStart = new Date(input.slotStart);
      if (Number.isNaN(slotStart.getTime())) throw ApiError.badRequest('slotStart is invalid');
      const slotEnd = new Date(slotStart.getTime() + settings.slotMinutes * 60000);

      const rules = await loadAvailabilityRules(supabase, tenantId, booking.team_member_id!);
      const buffer = settings.bufferMinutes * 60000;
      const busy = await loadBusyIntervals(
        supabase,
        tenantId,
        booking.team_member_id!,
        new Date(slotStart.getTime() - buffer),
        new Date(slotEnd.getTime() + buffer),
        booking.id,
      );

      if (hasConflict(slotStart, slotEnd, busy, settings.bufferMinutes)) {
        throw ApiError.conflict('That time is no longer available');
      }
      const valid =
        generateSlots({ rules, settings, from: slotStart, to: slotEnd, busy }).length === 1;
      if (!valid) {
        throw ApiError.unprocessable(
          'Requested time is outside the coach’s availability or does not meet the notice window',
        );
      }
      patch.slot_start = slotStart.toISOString();
      patch.slot_end = slotEnd.toISOString();
      patch.status = 'rescheduled';
    }

    if (Object.keys(patch).length === 0) throw ApiError.badRequest('No fields to update');

    const { data, error } = await supabase
      .from('bookings')
      .update(patch)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) {
      if (error.code === '23P01') throw ApiError.conflict('That time was just booked');
      throw ApiError.unprocessable(error.message);
    }
    if (!data) throw ApiError.notFound('Booking not found');

    return jsonOk({ booking: data });
  })(request, {});
}
