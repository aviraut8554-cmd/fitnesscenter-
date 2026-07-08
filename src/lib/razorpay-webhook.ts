import type { Database } from '@/lib/database.types';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { ApiError, jsonOk } from '@/lib/http';
import { verifyWebhookSignature } from '@/lib/razorpay';

/**
 * Shared Razorpay webhook processor. Verifies the signature over the RAW body
 * using the supplied webhook secret, then dispatches to the SECURITY DEFINER
 * RPCs that apply state changes idempotently (keyed by the Razorpay event id).
 *
 * The webhook secret is passed in so callers can use either the deployment-wide
 * env secret (global endpoint) or a tenant's own secret (per-tenant endpoint).
 * Payment/order/subscription state changes happen ONLY here — never from
 * client-side confirmation.
 */

type SubscriptionStatus = Database['public']['Enums']['subscription_status'];

interface RazorpayEntity {
  id?: string;
  order_id?: string;
  payment_id?: string;
  amount?: number;
  method?: string;
  error_code?: string | null;
  error_description?: string | null;
  status?: string;
  current_start?: number | null;
  current_end?: number | null;
}

interface RazorpayWebhookBody {
  event?: string;
  payload?: {
    payment?: { entity?: RazorpayEntity };
    refund?: { entity?: RazorpayEntity };
    subscription?: { entity?: RazorpayEntity };
  };
}

const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  'created', 'authenticated', 'active', 'pending', 'halted', 'paused',
  'cancelled', 'completed', 'expired',
];

function toIso(unixSeconds: number | null | undefined): string | undefined {
  return unixSeconds ? new Date(unixSeconds * 1000).toISOString() : undefined;
}

export async function processRazorpayWebhook(
  request: Request,
  webhookSecret: string,
): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature');
  const eventId = request.headers.get('x-razorpay-event-id');

  if (!signature) throw new ApiError(400, 'missing_signature', 'Missing x-razorpay-signature');
  if (!eventId) throw new ApiError(400, 'missing_event_id', 'Missing x-razorpay-event-id');
  if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    throw new ApiError(401, 'invalid_signature', 'Webhook signature verification failed');
  }

  let body: RazorpayWebhookBody;
  try {
    body = JSON.parse(rawBody) as RazorpayWebhookBody;
  } catch {
    throw ApiError.badRequest('Webhook body is not valid JSON');
  }

  const event = body.event ?? '';
  const admin = createAdminSupabase();
  const payloadJson = body as unknown as Database['public']['Tables']['razorpay_webhook_events']['Insert']['payload'];

  let applied = false;

  if (event === 'payment.captured') {
    const p = body.payload?.payment?.entity ?? {};
    if (!p.order_id || !p.id) throw ApiError.badRequest('payment.captured missing ids');
    const { data, error } = await admin.rpc('apply_payment_captured', {
      p_event_id: eventId,
      p_event_type: event,
      p_razorpay_order_id: p.order_id,
      p_razorpay_payment_id: p.id,
      p_signature: signature,
      p_amount_minor: p.amount ?? 0,
      p_method: p.method ?? undefined,
      p_payload: payloadJson,
    });
    if (error) throw ApiError.unprocessable(error.message);
    applied = data ?? false;
  } else if (event === 'payment.failed') {
    const p = body.payload?.payment?.entity ?? {};
    if (!p.order_id || !p.id) throw ApiError.badRequest('payment.failed missing ids');
    const { data, error } = await admin.rpc('apply_payment_failed', {
      p_event_id: eventId,
      p_event_type: event,
      p_razorpay_order_id: p.order_id,
      p_razorpay_payment_id: p.id,
      p_amount_minor: p.amount ?? 0,
      p_error_code: p.error_code ?? undefined,
      p_error_description: p.error_description ?? undefined,
      p_payload: payloadJson,
    });
    if (error) throw ApiError.unprocessable(error.message);
    applied = data ?? false;
  } else if (event === 'refund.processed' || event === 'refund.created') {
    const r = body.payload?.refund?.entity ?? {};
    if (!r.payment_id) throw ApiError.badRequest('refund event missing payment_id');
    const { data, error } = await admin.rpc('apply_refund', {
      p_event_id: eventId,
      p_event_type: event,
      p_razorpay_payment_id: r.payment_id,
      p_amount_minor: r.amount ?? 0,
      p_payload: payloadJson,
    });
    if (error) throw ApiError.unprocessable(error.message);
    applied = data ?? false;
  } else if (event.startsWith('subscription.')) {
    const s = body.payload?.subscription?.entity ?? {};
    if (!s.id) throw ApiError.badRequest('subscription event missing id');
    const status = SUBSCRIPTION_STATUSES.includes(s.status as SubscriptionStatus)
      ? (s.status as SubscriptionStatus)
      : null;
    if (!status) {
      // Unknown status: acknowledge without applying so Razorpay stops retrying.
      return jsonOk({ received: true, applied: false, ignored: `status:${s.status}` });
    }
    const { data, error } = await admin.rpc('apply_subscription_event', {
      p_event_id: eventId,
      p_event_type: event,
      p_razorpay_subscription_id: s.id,
      p_status: status,
      p_current_period_start: toIso(s.current_start),
      p_current_period_end: toIso(s.current_end),
      p_payload: payloadJson,
    });
    if (error) throw ApiError.unprocessable(error.message);
    applied = data ?? false;
  } else {
    // Unhandled event type: acknowledge so Razorpay does not retry.
    return jsonOk({ received: true, applied: false, ignored: event });
  }

  return jsonOk({ received: true, applied });
}
