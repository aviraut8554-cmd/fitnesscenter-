import { createHmac } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { verifyPaymentSignature, verifyWebhookSignature } from '@/lib/razorpay';

const WEBHOOK_SECRET = 'whsec_test_123';
const KEY_SECRET = 'keysec_test_123';

function webhookSig(body: string, secret = WEBHOOK_SECRET): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

describe('verifyWebhookSignature', () => {
  const body = JSON.stringify({ event: 'payment.captured', payload: {} });

  it('accepts a signature computed over the exact raw body', () => {
    expect(verifyWebhookSignature(body, webhookSig(body), WEBHOOK_SECRET)).toBe(true);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(verifyWebhookSignature(body, webhookSig(body, 'wrong'), WEBHOOK_SECRET)).toBe(false);
  });

  it('rejects when the body was tampered with after signing', () => {
    const sig = webhookSig(body);
    expect(verifyWebhookSignature(body + ' ', sig, WEBHOOK_SECRET)).toBe(false);
  });

  it('rejects a malformed (non-hex / empty) signature', () => {
    expect(verifyWebhookSignature(body, '', WEBHOOK_SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, 'not-hex', WEBHOOK_SECRET)).toBe(false);
  });
});

describe('verifyPaymentSignature', () => {
  const orderId = 'order_ABC';
  const paymentId = 'pay_XYZ';
  const good = createHmac('sha256', KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  it('accepts the correct order|payment signature', () => {
    expect(verifyPaymentSignature(orderId, paymentId, good, KEY_SECRET)).toBe(true);
  });

  it('rejects when order/payment ids do not match the signature', () => {
    expect(verifyPaymentSignature(orderId, 'pay_OTHER', good, KEY_SECRET)).toBe(false);
  });
});
