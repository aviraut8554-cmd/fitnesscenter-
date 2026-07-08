import { requireTeamMember } from '@/lib/auth';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { refundSchema } from '@/lib/validation';
import { refundRazorpayPayment, resolveRazorpayConfig } from '@/lib/razorpay';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Initiate a refund for an order (owner only). Calls Razorpay to create the
 * refund and writes an audit entry; the order/payment/invoice status is applied
 * by the verified `refund.*` webhook — never optimistically here — so a failed
 * refund never leaves the DB claiming money was returned.
 */
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id } = await ctx.params;
    const { tenantId, user } = await requireTeamMember(request, ['owner']);
    const input = await parseJson(request, refundSchema);
    const admin = createAdminSupabase();
    const cfg = await resolveRazorpayConfig(admin, tenantId);

    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('id, status, tenant_id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (orderError) throw ApiError.unprocessable(orderError.message);
    if (!order) throw ApiError.notFound('Order not found');
    if (order.status !== 'paid' && order.status !== 'partially_refunded') {
      throw ApiError.conflict(`Order is not refundable (status: ${order.status})`);
    }

    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .select('id, razorpay_payment_id, amount_minor')
      .eq('order_id', order.id)
      .eq('status', 'captured')
      .maybeSingle();
    if (paymentError) throw ApiError.unprocessable(paymentError.message);
    if (!payment) throw ApiError.conflict('No captured payment to refund for this order');

    if (input.amountMinor !== undefined && input.amountMinor > payment.amount_minor) {
      throw ApiError.badRequest('Refund amount exceeds the captured amount');
    }

    const refund = await refundRazorpayPayment(
      cfg,
      payment.razorpay_payment_id,
      input.amountMinor,
    );

    await admin.from('audit_log').insert({
      tenant_id: tenantId,
      actor_user_id: user.id,
      action: 'payment.refund_initiated',
      target_table: 'orders',
      target_id: order.id,
      changes: {
        razorpay_payment_id: payment.razorpay_payment_id,
        razorpay_refund_id: refund.id,
        amount_minor: input.amountMinor ?? payment.amount_minor,
      },
    });

    return jsonOk({ refund: { id: refund.id, status: refund.status, amount: refund.amount } }, 202);
  })(request, {});
}
