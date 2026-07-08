import { createAdminSupabase } from '@/lib/supabase/admin';
import { ApiError, handleRoute } from '@/lib/http';
import { resolveRazorpayConfig } from '@/lib/razorpay';
import { processRazorpayWebhook } from '@/lib/razorpay-webhook';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ tenantId: string }> };

/**
 * Per-tenant Razorpay webhook receiver. Each creator configures this URL (with
 * their own tenant id) in their Razorpay dashboard, so the signature is
 * verified against THAT tenant's webhook secret. Falls back to the deployment
 * env secret if the tenant hasn't connected their own account yet.
 */
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { tenantId } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(tenantId)) {
      throw ApiError.badRequest('Invalid tenant id');
    }
    const admin = createAdminSupabase();
    const cfg = await resolveRazorpayConfig(admin, tenantId);
    return processRazorpayWebhook(request, cfg.webhookSecret);
  })(request, {});
}
