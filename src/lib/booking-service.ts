import type { ServerSupabase } from '@/lib/auth';
import type { AvailabilityRule, BookingSettings, BusyInterval } from '@/lib/booking';
import { ApiError } from '@/lib/http';

/** Applied when a tenant has no `booking_settings` row yet. */
export const DEFAULT_BOOKING_SETTINGS: BookingSettings = {
  timezone: 'Asia/Kolkata',
  slotMinutes: 30,
  bufferMinutes: 0,
  minNoticeMinutes: 120,
  cancelCutoffMinutes: 720,
};

/** Load a tenant's booking settings, falling back to defaults. */
export async function loadBookingSettings(
  supabase: ServerSupabase,
  tenantId: string,
): Promise<BookingSettings> {
  const { data, error } = await supabase
    .from('booking_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw ApiError.unprocessable(error.message);
  if (!data) return { ...DEFAULT_BOOKING_SETTINGS };
  return {
    timezone: data.timezone,
    slotMinutes: data.slot_minutes,
    bufferMinutes: data.buffer_minutes,
    minNoticeMinutes: data.min_notice_minutes,
    cancelCutoffMinutes: data.cancel_cutoff_minutes,
  };
}

/** Load a coach's weekly availability windows within a tenant. */
export async function loadAvailabilityRules(
  supabase: ServerSupabase,
  tenantId: string,
  teamMemberId: string,
): Promise<AvailabilityRule[]> {
  const { data, error } = await supabase
    .from('availability_rules')
    .select('weekday, start_time, end_time')
    .eq('tenant_id', tenantId)
    .eq('team_member_id', teamMemberId);
  if (error) throw ApiError.unprocessable(error.message);
  return (data ?? []).map((r) => ({
    weekday: r.weekday,
    startTime: r.start_time,
    endTime: r.end_time,
  }));
}

/**
 * Active bookings for a coach that could clash with the [from, to) range,
 * padded so buffer comparisons at the edges are covered by the caller.
 */
export async function loadBusyIntervals(
  supabase: ServerSupabase,
  tenantId: string,
  teamMemberId: string,
  from: Date,
  to: Date,
  excludeBookingId?: string,
): Promise<BusyInterval[]> {
  let query = supabase
    .from('bookings')
    .select('id, slot_start, slot_end')
    .eq('tenant_id', tenantId)
    .eq('team_member_id', teamMemberId)
    .in('status', ['scheduled', 'rescheduled'])
    .lt('slot_start', to.toISOString())
    .gt('slot_end', from.toISOString());
  if (excludeBookingId) query = query.neq('id', excludeBookingId);

  const { data, error } = await query;
  if (error) throw ApiError.unprocessable(error.message);
  return (data ?? []).map((b) => ({
    start: new Date(b.slot_start),
    end: new Date(b.slot_end),
  }));
}
