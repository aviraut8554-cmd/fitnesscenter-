import { requireTenantActor } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk } from '@/lib/http';
import { generateSlots } from '@/lib/booking';
import {
  loadAvailabilityRules,
  loadBookingSettings,
  loadBusyIntervals,
} from '@/lib/booking-service';

export const dynamic = 'force-dynamic';

const MAX_RANGE_MS = 31 * 24 * 60 * 60 * 1000;

/**
 * Bookable slots for a coach in a date range. Reachable by team members and
 * clients (RLS lets both read availability). Slots exclude past/notice-window
 * times and clashes with the coach's existing bookings.
 * Query params: `teamMemberId` (required), `from` & `to` (ISO 8601).
 */
export const GET = handleRoute(async (request) => {
  const { supabase, tenantId } = await requireTenantActor(request);
  const url = new URL(request.url);
  const teamMemberId = url.searchParams.get('teamMemberId');
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');

  if (!teamMemberId) throw ApiError.badRequest('teamMemberId is required');
  const from = fromParam ? new Date(fromParam) : new Date();
  const to = toParam ? new Date(toParam) : new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw ApiError.badRequest('from/to must be valid ISO 8601 dates');
  }
  if (to <= from) throw ApiError.badRequest('to must be after from');
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
    throw ApiError.badRequest('Range too large (max 31 days)');
  }

  const settings = await loadBookingSettings(supabase, tenantId);
  const rules = await loadAvailabilityRules(supabase, tenantId, teamMemberId);
  const busy = await loadBusyIntervals(supabase, tenantId, teamMemberId, from, to);

  const slots = generateSlots({ rules, settings, from, to, busy });

  return jsonOk({ slots, slotMinutes: settings.slotMinutes, timezone: settings.timezone });
});
