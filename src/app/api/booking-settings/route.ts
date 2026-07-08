import { requireTeamMember, requireTenantActor } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { bookingSettingsSchema } from '@/lib/validation';
import { DEFAULT_BOOKING_SETTINGS } from '@/lib/booking-service';

export const dynamic = 'force-dynamic';

/** Read the tenant's booking policy (team members and clients). */
export const GET = handleRoute(async (request) => {
  const { supabase, tenantId } = await requireTenantActor(request);

  const { data, error } = await supabase
    .from('booking_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw ApiError.unprocessable(error.message);

  if (!data) {
    return jsonOk({ settings: { tenant_id: tenantId, ...toRow(DEFAULT_BOOKING_SETTINGS) } });
  }
  return jsonOk({ settings: data });
});

/** Upsert the tenant's booking policy (owner/manager only). */
export const PUT = handleRoute(async (request) => {
  const { supabase, tenantId } = await requireTeamMember(request, ['owner', 'manager']);
  const input = await parseJson(request, bookingSettingsSchema);

  const patch = {
    tenant_id: tenantId,
    ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
    ...(input.slotMinutes !== undefined ? { slot_minutes: input.slotMinutes } : {}),
    ...(input.bufferMinutes !== undefined ? { buffer_minutes: input.bufferMinutes } : {}),
    ...(input.minNoticeMinutes !== undefined ? { min_notice_minutes: input.minNoticeMinutes } : {}),
    ...(input.cancelCutoffMinutes !== undefined
      ? { cancel_cutoff_minutes: input.cancelCutoffMinutes }
      : {}),
  };

  const { data, error } = await supabase
    .from('booking_settings')
    .upsert(patch, { onConflict: 'tenant_id' })
    .select()
    .single();
  if (error) throw ApiError.unprocessable(error.message);

  return jsonOk({ settings: data });
});

function toRow(s: typeof DEFAULT_BOOKING_SETTINGS) {
  return {
    timezone: s.timezone,
    slot_minutes: s.slotMinutes,
    buffer_minutes: s.bufferMinutes,
    min_notice_minutes: s.minNoticeMinutes,
    cancel_cutoff_minutes: s.cancelCutoffMinutes,
  };
}
