import { requireTeamMember } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * Revenue summary for the tenant (owner only — mirrors the owner-only RLS on
 * payments; managers/support never see payment data). Amounts are integer minor
 * units. `net = gross - refunded`. Computed from the payments ledger, which is
 * itself only ever written by verified webhooks.
 */
export const GET = handleRoute(async (request) => {
  const { supabase, tenantId } = await requireTeamMember(request, ['owner']);

  const { data, error } = await supabase
    .from('payments')
    .select('amount_minor, amount_refunded_minor, status')
    .eq('tenant_id', tenantId);
  if (error) throw ApiError.unprocessable(error.message);

  const rows = data ?? [];
  const captured = rows.filter((r) =>
    ['captured', 'partially_refunded', 'refunded'].includes(r.status),
  );

  const grossMinor = captured.reduce((sum, r) => sum + r.amount_minor, 0);
  const refundedMinor = captured.reduce((sum, r) => sum + (r.amount_refunded_minor ?? 0), 0);

  return jsonOk({
    revenue: {
      // INR at launch; amounts are integer minor units (paise).
      currency: 'INR',
      grossMinor,
      refundedMinor,
      netMinor: grossMinor - refundedMinor,
      capturedCount: captured.length,
      refundedCount: rows.filter((r) => r.status === 'refunded').length,
      failedCount: rows.filter((r) => r.status === 'failed').length,
    },
  });
});
