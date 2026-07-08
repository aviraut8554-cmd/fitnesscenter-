import { describe, expect, it } from 'vitest';
import {
  influencerSignupSchema,
  clientCreateSchema,
  subdomainSchema,
  productCreateSchema,
  orderCreateSchema,
  refundSchema,
  availabilityCreateSchema,
  bookingCreateSchema,
  bookingUpdateSchema,
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

const UUID = '11111111-1111-1111-1111-111111111111';

describe('availabilityCreateSchema', () => {
  it('accepts a valid weekly window', () => {
    expect(
      availabilityCreateSchema.safeParse({
        teamMemberId: UUID,
        weekday: 1,
        startTime: '09:00',
        endTime: '17:00',
      }).success,
    ).toBe(true);
  });

  it('rejects a bad weekday, malformed time or end<=start', () => {
    expect(
      availabilityCreateSchema.safeParse({ teamMemberId: UUID, weekday: 7, startTime: '09:00', endTime: '10:00' }).success,
    ).toBe(false);
    expect(
      availabilityCreateSchema.safeParse({ teamMemberId: UUID, weekday: 1, startTime: '9am', endTime: '10:00' }).success,
    ).toBe(false);
    expect(
      availabilityCreateSchema.safeParse({ teamMemberId: UUID, weekday: 1, startTime: '12:00', endTime: '10:00' }).success,
    ).toBe(false);
  });
});

describe('bookingCreateSchema', () => {
  it('requires a uuid coach and an ISO datetime', () => {
    expect(
      bookingCreateSchema.safeParse({ teamMemberId: UUID, slotStart: '2026-06-01T10:00:00Z' }).success,
    ).toBe(true);
    expect(
      bookingCreateSchema.safeParse({ teamMemberId: 'nope', slotStart: '2026-06-01T10:00:00Z' }).success,
    ).toBe(false);
    expect(
      bookingCreateSchema.safeParse({ teamMemberId: UUID, slotStart: '2026-06-01' }).success,
    ).toBe(false);
  });
});

describe('bookingUpdateSchema', () => {
  it('needs at least one field and a valid status', () => {
    expect(bookingUpdateSchema.safeParse({}).success).toBe(false);
    expect(bookingUpdateSchema.safeParse({ status: 'cancelled' }).success).toBe(true);
    expect(bookingUpdateSchema.safeParse({ status: 'scheduled' }).success).toBe(false);
  });
});
