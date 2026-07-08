import { beforeAll, describe, expect, it } from 'vitest';
import { adminClient, createUser, supabaseReachable, uniq, userClient } from '../helpers/supabase';

const reachable = await supabaseReachable();

/**
 * Exercises the Phase 2 payment flow at the DB level: the webhook-processing
 * RPCs (idempotent, invoice-generating), refund application, and the RLS that
 * keeps payment data owner-only. This is the "payment flow" the PRD requires
 * automated tests for.
 */
describe.skipIf(!reachable)('payments: webhook processing, invoicing, refunds & RLS', () => {
  const admin = adminClient();

  let tenantId: string;
  let ownerEmail: string;
  let managerEmail: string;
  let clientEmail: string;
  let clientId: string;
  let productId: string;
  let orderId: string;
  const razorpayOrderId = uniq('order_rzp');
  const razorpayPaymentId = uniq('pay_rzp');
  const AMOUNT = 149900;

  beforeAll(async () => {
    ownerEmail = `${uniq('ownerpay')}@example.com`;
    managerEmail = `${uniq('managerpay')}@example.com`;
    clientEmail = `${uniq('clientpay')}@example.com`;

    const ownerId = await createUser(ownerEmail);
    const managerId = await createUser(managerEmail);
    const clientUserId = await createUser(clientEmail);

    const t = await admin.rpc('provision_tenant', {
      p_owner_user_id: ownerId,
      p_name: 'Pay Tenant',
      p_subdomain: uniq('paytenant').toLowerCase().replace(/[^a-z0-9-]/g, ''),
    });
    if (t.error) throw new Error(t.error.message);
    tenantId = t.data!.id;

    const m = await admin
      .from('team_members')
      .insert({ tenant_id: tenantId, user_id: managerId, role: 'manager' });
    if (m.error) throw new Error(m.error.message);

    const c = await admin
      .from('clients')
      .insert({
        tenant_id: tenantId,
        user_id: clientUserId,
        full_name: 'Pay Client',
        email: clientEmail,
        status: 'trial',
      })
      .select()
      .single();
    if (c.error) throw new Error(c.error.message);
    clientId = c.data.id;

    const p = await admin
      .from('products_services')
      .insert({
        tenant_id: tenantId,
        type: 'course',
        name: '12-week transformation',
        amount_minor: AMOUNT,
        currency: 'INR',
      })
      .select()
      .single();
    if (p.error) throw new Error(p.error.message);
    productId = p.data.id;

    // Simulate the order the checkout route creates (service-role write).
    const o = await admin
      .from('orders')
      .insert({
        tenant_id: tenantId,
        client_id: clientId,
        product_id: productId,
        amount_minor: AMOUNT,
        currency: 'INR',
        status: 'created',
        razorpay_order_id: razorpayOrderId,
      })
      .select()
      .single();
    if (o.error) throw new Error(o.error.message);
    orderId = o.data.id;
  });

  it('apply_payment_captured marks the order paid, records the payment, and issues exactly one invoice', async () => {
    const first = await admin.rpc('apply_payment_captured', {
      p_event_id: uniq('evt_cap'),
      p_event_type: 'payment.captured',
      p_razorpay_order_id: razorpayOrderId,
      p_razorpay_payment_id: razorpayPaymentId,
      p_signature: 'sig',
      p_amount_minor: AMOUNT,
      p_method: 'upi',
    });
    expect(first.error).toBeNull();
    expect(first.data).toBe(true);

    const order = await admin.from('orders').select('status').eq('id', orderId).single();
    expect(order.data!.status).toBe('paid');

    const payment = await admin
      .from('payments')
      .select('status, amount_minor')
      .eq('razorpay_payment_id', razorpayPaymentId)
      .single();
    expect(payment.data!.status).toBe('captured');

    const invoices = await admin.from('invoices').select('id, number, status').eq('order_id', orderId);
    expect(invoices.data).toHaveLength(1);
    expect(invoices.data![0].status).toBe('issued');
    expect(invoices.data![0].number).toMatch(/^INV-\d{6}$/);

    const client = await admin.from('clients').select('status').eq('id', clientId).single();
    expect(client.data!.status).toBe('active');
  });

  it('is idempotent: a duplicate event id does nothing (no second invoice)', async () => {
    const eventId = uniq('evt_dup');
    const one = await admin.rpc('apply_payment_captured', {
      p_event_id: eventId,
      p_event_type: 'payment.captured',
      p_razorpay_order_id: razorpayOrderId,
      p_razorpay_payment_id: razorpayPaymentId,
      p_signature: 'sig',
      p_amount_minor: AMOUNT,
      p_method: 'upi',
    });
    const two = await admin.rpc('apply_payment_captured', {
      p_event_id: eventId,
      p_event_type: 'payment.captured',
      p_razorpay_order_id: razorpayOrderId,
      p_razorpay_payment_id: razorpayPaymentId,
      p_signature: 'sig',
      p_amount_minor: AMOUNT,
      p_method: 'upi',
    });
    expect(one.data).toBe(true);
    expect(two.data).toBe(false); // already processed

    const invoices = await admin.from('invoices').select('id').eq('order_id', orderId);
    expect(invoices.data).toHaveLength(1); // still exactly one
  });

  it('owner can read payments; a manager cannot (owner-only RLS)', async () => {
    const ownerSupa = await userClient(ownerEmail);
    const ownerView = await ownerSupa.from('payments').select('id').eq('tenant_id', tenantId);
    expect(ownerView.error).toBeNull();
    expect(ownerView.data!.length).toBeGreaterThan(0);

    const managerSupa = await userClient(managerEmail);
    const managerView = await managerSupa.from('payments').select('id').eq('tenant_id', tenantId);
    expect(managerView.data).toEqual([]);
  });

  it('a client can read only their own order and never payments', async () => {
    const clientSupa = await userClient(clientEmail);
    const orders = await clientSupa.from('orders').select('id, client_id');
    expect(orders.error).toBeNull();
    expect(orders.data!.every((o) => o.client_id === clientId)).toBe(true);
    expect(orders.data!.some((o) => o.id === orderId)).toBe(true);

    const payments = await clientSupa.from('payments').select('id');
    expect(payments.data).toEqual([]);
  });

  it('a client cannot insert an order directly (orders are server-managed)', async () => {
    const clientSupa = await userClient(clientEmail);
    const { error } = await clientSupa.from('orders').insert({
      tenant_id: tenantId,
      client_id: clientId,
      product_id: productId,
      amount_minor: 1,
      status: 'paid',
    });
    expect(error).not.toBeNull(); // no INSERT policy for authenticated
  });

  it('apply_refund fully refunds the payment, order and invoice (idempotently)', async () => {
    const eventId = uniq('evt_refund');
    const first = await admin.rpc('apply_refund', {
      p_event_id: eventId,
      p_event_type: 'refund.processed',
      p_razorpay_payment_id: razorpayPaymentId,
      p_amount_minor: AMOUNT,
    });
    expect(first.data).toBe(true);

    const payment = await admin
      .from('payments')
      .select('status, amount_refunded_minor')
      .eq('razorpay_payment_id', razorpayPaymentId)
      .single();
    expect(payment.data!.status).toBe('refunded');
    expect(payment.data!.amount_refunded_minor).toBe(AMOUNT);

    const order = await admin.from('orders').select('status').eq('id', orderId).single();
    expect(order.data!.status).toBe('refunded');

    const invoice = await admin.from('invoices').select('status').eq('order_id', orderId).single();
    expect(invoice.data!.status).toBe('refunded');

    const dup = await admin.rpc('apply_refund', {
      p_event_id: eventId,
      p_event_type: 'refund.processed',
      p_razorpay_payment_id: razorpayPaymentId,
      p_amount_minor: AMOUNT,
    });
    expect(dup.data).toBe(false);
  });

  it('apply_subscription_event upserts subscription status', async () => {
    const razorpaySubId = uniq('sub_rzp');
    const sub = await admin
      .from('subscriptions')
      .insert({
        tenant_id: tenantId,
        client_id: clientId,
        product_id: productId,
        razorpay_subscription_id: razorpaySubId,
        status: 'created',
      })
      .select()
      .single();
    expect(sub.error).toBeNull();

    const res = await admin.rpc('apply_subscription_event', {
      p_event_id: uniq('evt_sub'),
      p_event_type: 'subscription.activated',
      p_razorpay_subscription_id: razorpaySubId,
      p_status: 'active',
    });
    expect(res.data).toBe(true);

    const updated = await admin
      .from('subscriptions')
      .select('status')
      .eq('razorpay_subscription_id', razorpaySubId)
      .single();
    expect(updated.data!.status).toBe('active');
  });
});
