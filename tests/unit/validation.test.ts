import { describe, expect, it } from 'vitest';
import {
  influencerSignupSchema,
  clientCreateSchema,
  subdomainSchema,
  productCreateSchema,
  orderCreateSchema,
  refundSchema,
} from '@/lib/validation';

describe('subdomainSchema', () => {
  it('accepts valid subdomains', () => {
    for (const s of ['fitpro', 'fit-pro-1', 'a1b2c3']) {
      expect(subdomainSchema.safeParse(s).success).toBe(true);
    }
  });

  it('rejects invalid subdomains', () => {
    for (const s of ['ab', 'Fit', 'fit_pro', '-fit', 'fit-', 'a'.repeat(64)]) {
      expect(subdomainSchema.safeParse(s).success).toBe(false);
    }
  });
});

describe('influencerSignupSchema', () => {
  it('requires a strong-enough password and valid email', () => {
    const bad = influencerSignupSchema.safeParse({
      email: 'nope',
      password: 'short',
      name: 'X',
      tenantName: 'Gym',
      subdomain: 'gym',
    });
    expect(bad.success).toBe(false);
  });

  it('accepts a well-formed payload', () => {
    const ok = influencerSignupSchema.safeParse({
      email: 'coach@example.com',
      password: 'password123',
      name: 'Coach',
      tenantName: 'Coach Fitness',
      subdomain: 'coach-fit',
      planCode: 'growth',
    });
    expect(ok.success).toBe(true);
  });
});

describe('clientCreateSchema', () => {
  it('rejects unknown status values', () => {
    const res = clientCreateSchema.safeParse({
      fullName: 'Jane',
      email: 'jane@example.com',
      status: 'vip',
    });
    expect(res.success).toBe(false);
  });
});

describe('productCreateSchema', () => {
  it('applies defaults for currency, billingCycle and isActive', () => {
    const res = productCreateSchema.parse({
      type: 'course',
      name: '12-week plan',
      amountMinor: 149900,
    });
    expect(res.currency).toBe('INR');
    expect(res.billingCycle).toBe('one_time');
    expect(res.isActive).toBe(true);
  });

  it('rejects a negative or non-integer amount', () => {
    expect(productCreateSchema.safeParse({ type: 'merch', name: 'Tee', amountMinor: -1 }).success)
      .toBe(false);
    expect(productCreateSchema.safeParse({ type: 'merch', name: 'Tee', amountMinor: 9.9 }).success)
      .toBe(false);
  });

  it('rejects an unknown product type', () => {
    expect(
      productCreateSchema.safeParse({ type: 'ebook', name: 'X', amountMinor: 100 }).success,
    ).toBe(false);
  });
});

describe('orderCreateSchema', () => {
  it('requires a uuid productId; clientId is optional', () => {
    expect(orderCreateSchema.safeParse({ productId: 'not-a-uuid' }).success).toBe(false);
    const ok = orderCreateSchema.safeParse({
      productId: '11111111-1111-1111-1111-111111111111',
    });
    expect(ok.success).toBe(true);
  });
});

describe('refundSchema', () => {
  it('allows an empty body (full refund) and a positive partial amount', () => {
    expect(refundSchema.safeParse({}).success).toBe(true);
    expect(refundSchema.safeParse({ amountMinor: 5000 }).success).toBe(true);
    expect(refundSchema.safeParse({ amountMinor: -1 }).success).toBe(false);
  });
});
