import { requireTenantActor } from '@/lib/auth';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { orderCreateSchema } from '@/lib/validation';
import { createRazorpayOrder, requireRazorpayConfig } from '@/lib/razorpay';

export const dynamic = 'force-dynamic';

/**
 * List orders. RLS scopes visibility: owner/manager see all tenant orders, a
 * client sees only their own. (Support has no orders_select access.)
 */
export const GET = handleRoute(async (request) => {
  const actor = await requireTenantActor(request);

  let query = actor.supabase
    .from('orders')
    .select(
      '*, client:clients(full_name, email), product:products_services(name, type), invoices(number, status, issued_at)',
    )
    .eq('tenant_id', actor.tenantId)
    .order('created_at', { ascending: false });

  if (actor.kind === 'client') query = query.eq('client_id', actor.clientId);

  const { data, error } = await query;
  if (error) throw ApiError.unprocessable(error.message);

  return jsonOk({ orders: data });
});

/**
 * Create an order and its Razorpay counterpart (checkout). The amount is taken
 * from the product server-side — never from the request — so a client cannot
 * choose their own price. The returned `checkout` payload is what the frontend
 * hands to Razorpay Checkout. The order stays `created` until a verified
 * webhook marks it paid.
 */
export const POST = handleRoute(async (request) => {
  const actor = await requireTenantActor(request);
  const input = await parseJson(request, orderCreateSchema);
  const cfg = requireRazorpayConfig();
  const admin = createAdminSupabase();

  // Resolve the client this order is for.
  const clientId = actor.kind === 'client' ? actor.clientId : input.clientId;
  if (!clientId) {
    throw ApiError.badRequest('clientId is required when creating an order for a client');
  }

  const { data: client, error: clientError } = await admin
    .from('clients')
    .select('id, tenant_id')
    .eq('id', clientId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle();
  if (clientError) throw ApiError.unprocessable(clientError.message);
  if (!client) throw ApiError.notFound('Client not found');

  const { data: product, error: productError } = await admin
    .from('products_services')
    .select('id, tenant_id, amount_minor, currency, is_active, name')
    .eq('id', input.productId)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle();
  if (productError) throw ApiError.unprocessable(productError.message);
  if (!product) throw ApiError.notFound('Product not found');
  if (!product.is_active) throw ApiError.conflict('Product is not available for purchase');

  const receipt = `rcpt_${Date.now()}_${product.id.slice(0, 8)}`;
  const rzpOrder = await createRazorpayOrder(cfg, {
    amountMinor: product.amount_minor,
    currency: product.currency,
    receipt,
    notes: { tenant_id: actor.tenantId, client_id: clientId, product_id: product.id },
  });

  const { data: order, error: orderError } = await admin
    .from('orders')
    .insert({
      tenant_id: actor.tenantId,
      client_id: clientId,
      product_id: product.id,
      amount_minor: product.amount_minor,
      currency: product.currency,
      status: 'created',
      razorpay_order_id: rzpOrder.id,
      receipt,
    })
    .select()
    .single();
  if (orderError) throw ApiError.unprocessable(orderError.message);

  return jsonOk(
    {
      order,
      checkout: {
        razorpayOrderId: rzpOrder.id,
        keyId: cfg.keyId,
        amountMinor: product.amount_minor,
        currency: product.currency,
      },
    },
    201,
  );
});
