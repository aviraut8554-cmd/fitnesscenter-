import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { ApiError } from '@/lib/http';
import { decryptSecret } from '@/lib/crypto';
import type { AdminSupabase } from '@/lib/supabase/admin';

/**
 * Thin Razorpay REST client + signature helpers. We use the REST API directly
 * (via fetch) rather than the SDK to keep the dependency surface small and the
 * behaviour explicit. All monetary values are integer minor units (paise).
 */

const RAZORPAY_API = 'https://api.razorpay.com/v1';

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

/** Resolve Razorpay config or throw a 500 with a clear, actionable message. */
export function requireRazorpayConfig(): RazorpayConfig {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET } = env;
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET || !RAZORPAY_WEBHOOK_SECRET) {
    throw new ApiError(
      500,
      'razorpay_not_configured',
      'Razorpay is not configured: set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET',
    );
  }
  return {
    keyId: RAZORPAY_KEY_ID,
    keySecret: RAZORPAY_KEY_SECRET,
    webhookSecret: RAZORPAY_WEBHOOK_SECRET,
  };
}

/** Where a resolved Razorpay config came from. */
export type RazorpaySource = 'tenant' | 'env';

/** Row shape read from `tenant_payment_credentials` (secrets encrypted). */
interface StoredCredentials {
  key_id: string;
  key_secret_enc: string;
  webhook_secret_enc: string;
}

/**
 * Resolve the Razorpay config for a tenant. Prefers the tenant's own connected
 * account (secrets decrypted from `tenant_payment_credentials`); falls back to
 * the deployment-wide env keys when the tenant hasn't connected one. Throws a
 * clear 500 when neither is available.
 *
 * Must be called with the service-role client — the credentials table is not
 * readable by user-scoped (RLS) clients by design.
 */
export async function resolveRazorpayConfig(
  admin: AdminSupabase,
  tenantId: string,
): Promise<RazorpayConfig & { source: RazorpaySource }> {
  const { data, error } = await admin
    .from('tenant_payment_credentials')
    .select('key_id, key_secret_enc, webhook_secret_enc')
    .eq('tenant_id', tenantId)
    .maybeSingle<StoredCredentials>();
  if (error) throw ApiError.unprocessable(error.message);

  if (data) {
    return {
      keyId: data.key_id,
      keySecret: decryptSecret(data.key_secret_enc),
      webhookSecret: decryptSecret(data.webhook_secret_enc),
      source: 'tenant',
    };
  }

  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET } = env;
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET || !RAZORPAY_WEBHOOK_SECRET) {
    throw new ApiError(
      500,
      'razorpay_not_configured',
      'Razorpay is not connected for this tenant and no deployment keys are set. Connect Razorpay in Settings → Payments.',
    );
  }
  return {
    keyId: RAZORPAY_KEY_ID,
    keySecret: RAZORPAY_KEY_SECRET,
    webhookSecret: RAZORPAY_WEBHOOK_SECRET,
    source: 'env',
  };
}

function authHeader(cfg: RazorpayConfig): string {
  return `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString('base64')}`;
}

async function razorpayFetch<T>(
  cfg: RazorpayConfig,
  path: string,
  init: { method: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${RAZORPAY_API}${path}`, {
    method: init.method,
    headers: {
      Authorization: authHeader(cfg),
      'content-type': 'application/json',
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : {};
  if (!res.ok) {
    const description =
      (json as { error?: { description?: string } }).error?.description ??
      `Razorpay request failed (${res.status})`;
    throw new ApiError(502, 'razorpay_error', description, json);
  }
  return json as T;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt?: string;
}

export async function createRazorpayOrder(
  cfg: RazorpayConfig,
  params: { amountMinor: number; currency: string; receipt: string; notes?: Record<string, string> },
): Promise<RazorpayOrder> {
  return razorpayFetch<RazorpayOrder>(cfg, '/orders', {
    method: 'POST',
    body: {
      amount: params.amountMinor,
      currency: params.currency,
      receipt: params.receipt,
      notes: params.notes,
    },
  });
}

export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: string;
}

export async function refundRazorpayPayment(
  cfg: RazorpayConfig,
  razorpayPaymentId: string,
  amountMinor?: number,
): Promise<RazorpayRefund> {
  return razorpayFetch<RazorpayRefund>(cfg, `/payments/${razorpayPaymentId}/refund`, {
    method: 'POST',
    body: amountMinor !== undefined ? { amount: amountMinor } : {},
  });
}

/** Constant-time comparison of two hex signatures. */
function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ab.length !== bb.length || ab.length === 0) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Verify a Razorpay webhook signature: HMAC-SHA256 of the raw request body,
 * keyed by the webhook secret, compared against the `x-razorpay-signature`
 * header. The RAW body must be passed (not a re-serialized object).
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  webhookSecret: string,
): boolean {
  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}

/**
 * Verify a Razorpay Checkout handshake signature: HMAC-SHA256 of
 * `${orderId}|${paymentId}` keyed by the key secret. Used to authenticate the
 * client-side callback, but never to unlock access on its own — unlock is
 * webhook-driven per the PRD.
 */
export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  keySecret: string,
): boolean {
  const expected = createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return safeEqualHex(expected, signature);
}
