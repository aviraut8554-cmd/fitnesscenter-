import { handleRoute } from '@/lib/http';
import { requireRazorpayConfig } from '@/lib/razorpay';
import { processRazorpayWebhook } from '@/lib/razorpay-webhook';

export const dynamic = 'force-dynamic';

/**
 * Global Razorpay webhook receiver, verified against the deployment-wide env
 * webhook secret. Used when a tenant relies on the deployment's shared Razorpay
 * account. Tenants with their own connected account should point Razorpay at
 * the per-tenant endpoint `/api/payments/webhook/[tenantId]` instead.
 */
export const POST = handleRoute(async (request) => {
  const cfg = requireRazorpayConfig();
  return processRazorpayWebhook(request, cfg.webhookSecret);
});
