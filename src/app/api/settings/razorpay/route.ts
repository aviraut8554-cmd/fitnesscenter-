import { requireTeamMember } from '@/lib/auth';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { encryptSecret } from '@/lib/crypto';
import { razorpayConnectSchema } from '@/lib/validation';
import type { RazorpayStatus } from '@/lib/admin-types';
import { razorpayStatusForTenant } from '@/lib/razorpay-status';

export const dynamic = 'force-dynamic';

/**
 * Connect (or replace) the tenant's own Razorpay account. Owner only. The key
 * id is stored in clear (it is exposed at checkout anyway); the key secret and
 * webhook secret are encrypted at rest with AES-256-GCM before they touch the
 * database. Secrets are never returned in any response.
 */
export const PUT = handleRoute(async (request) => {
  const { tenantId } = await requireTeamMember(request, ['owner']);
  const input = await parseJson(request, razorpayConnectSchema);
  const admin = createAdminSupabase();

  const { error } = await admin.from('tenant_payment_credentials').upsert(
    {
      tenant_id: tenantId,
      provider: 'razorpay',
      key_id: input.keyId,
      key_secret_enc: encryptSecret(input.keySecret),
      webhook_secret_enc: encryptSecret(input.webhookSecret),
      connected_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id' },
  );
  if (error) throw ApiError.unprocessable(error.message);

  const status: RazorpayStatus = await razorpayStatusForTenant(admin, tenantId);
  return jsonOk({ razorpay: status });
});

/** Disconnect the tenant's Razorpay account (owner only). */
export const DELETE = handleRoute(async (request) => {
  const { tenantId } = await requireTeamMember(request, ['owner']);
  const admin = createAdminSupabase();

  const { error } = await admin
    .from('tenant_payment_credentials')
    .delete()
    .eq('tenant_id', tenantId);
  if (error) throw ApiError.unprocessable(error.message);

  const status: RazorpayStatus = await razorpayStatusForTenant(admin, tenantId);
  return jsonOk({ razorpay: status });
});
