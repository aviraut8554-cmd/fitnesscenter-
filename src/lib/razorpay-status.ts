import { env } from '@/lib/env';
import { encryptionConfigured } from '@/lib/crypto';
import type { AdminSupabase } from '@/lib/supabase/admin';
import type { RazorpayStatus } from '@/lib/admin-types';

/** Mask a publishable key id: keep the prefix + last 4, star the middle. */
function maskKeyId(keyId: string): string {
  const m = /^(rzp_(?:test|live)_)(.*)$/.exec(keyId);
  if (!m) return '••••';
  const [, prefix, rest] = m;
  const tail = rest.slice(-4);
  return `${prefix}••••${tail}`;
}

function modeOf(keyId: string): 'test' | 'live' | null {
  if (keyId.startsWith('rzp_test_')) return 'test';
  if (keyId.startsWith('rzp_live_')) return 'live';
  return null;
}

/**
 * Compute the (secret-free) Razorpay connection status for a tenant. Prefers
 * the tenant's connected account, else the deployment env keys. Reads only the
 * public key id from the credentials table — never the encrypted secrets.
 * Requires the service-role client (the credentials table is not RLS-readable).
 */
export async function razorpayStatusForTenant(
  admin: AdminSupabase,
  tenantId: string,
): Promise<RazorpayStatus> {
  const encryptionReady = encryptionConfigured();

  const { data } = await admin
    .from('tenant_payment_credentials')
    .select('key_id')
    .eq('tenant_id', tenantId)
    .maybeSingle<{ key_id: string }>();

  if (data?.key_id) {
    return {
      configured: true,
      source: 'tenant',
      keyIdMasked: maskKeyId(data.key_id),
      mode: modeOf(data.key_id),
      encryptionReady,
    };
  }

  const envKeyId = env.RAZORPAY_KEY_ID;
  if (envKeyId && env.RAZORPAY_KEY_SECRET) {
    return {
      configured: true,
      source: 'env',
      keyIdMasked: maskKeyId(envKeyId),
      mode: modeOf(envKeyId),
      encryptionReady,
    };
  }

  return {
    configured: false,
    source: null,
    keyIdMasked: null,
    mode: null,
    encryptionReady,
  };
}
