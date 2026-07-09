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
  classCreateSchema,
  classSessionCreateSchema,
  offeringCreateSchema,
  enrollmentCreateSchema,
  attendanceMarkSchema,
  settingsUpdateSchema,
  brandingSchema,
  clientProfileUpdateSchema,
  razorpayConnectSchema,
  teamInviteSchema,
  teamMemberUpdateSchema,
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

  it('accepts merchandising fields and enforces their bounds', () => {
    const ok = productCreateSchema.safeParse({
      type: 'course',
      name: 'Plan',
      amountMinor: 1000,
      imageUrl: 'https://cdn.example.com/x.png',
      testimonials: ['Great!', 'Loved it'],
      isBestseller: true,
      hasTrial: true,
      trialPriceMinor: 100,
      trialDurationDays: 7,
    });
    expect(ok.success).toBe(true);
    // at most 2 testimonials
    expect(
      productCreateSchema.safeParse({
        type: 'course',
        name: 'Plan',
        amountMinor: 1000,
        testimonials: ['a', 'b', 'c'],
      }).success,
    ).toBe(false);
    // imageUrl must be a URL
    expect(
      productCreateSchema.safeParse({
        type: 'course',
        name: 'Plan',
        amountMinor: 1000,
        imageUrl: 'not-a-url',
      }).success,
    ).toBe(false);
  });
});

describe('offeringCreateSchema', () => {
  it('accepts a full live paid offering with a batch + merchandising', () => {
    const res = offeringCreateSchema.safeParse({
      name: 'Morning HIIT Batch',
      pricingType: 'paid',
      amountMinor: 149900,
      billingCycle: 'monthly',
      batches: [
        {
          classType: 'live',
          schedule: { days: ['mon', 'wed', 'fri'], startTime: '07:00', endTime: '08:00', accessLink: 'https://meet.example.com/x' },
          isDefault: true,
        },
      ],
      testimonials: ['Loved it'],
      isBestseller: true,
    });
    expect(res.success).toBe(true);
  });

  it('accepts multiple batches with at most one default', () => {
    expect(
      offeringCreateSchema.safeParse({
        name: 'Two batches',
        pricingType: 'free',
        batches: [
          { classType: 'live', isDefault: true },
          { classType: 'live' },
        ],
      }).success,
    ).toBe(true);
  });

  it('rejects more than one default batch', () => {
    expect(
      offeringCreateSchema.safeParse({
        name: 'Two defaults',
        pricingType: 'free',
        batches: [
          { classType: 'live', isDefault: true },
          { classType: 'live', isDefault: true },
        ],
      }).success,
    ).toBe(false);
  });

  it('requires at least one batch', () => {
    expect(
      offeringCreateSchema.safeParse({ name: 'No batch', pricingType: 'free', batches: [] }).success,
    ).toBe(false);
  });

  it('allows a free offering without a price', () => {
    expect(
      offeringCreateSchema.safeParse({
        name: 'Free intro',
        pricingType: 'free',
        batches: [{ classType: 'live' }],
      }).success,
    ).toBe(true);
  });

  it('requires a price when paid', () => {
    expect(
      offeringCreateSchema.safeParse({
        name: 'Paid',
        pricingType: 'paid',
        batches: [{ classType: 'live' }],
      }).success,
    ).toBe(false);
  });

  it('rejects an end time before the start time', () => {
    expect(
      offeringCreateSchema.safeParse({
        name: 'Bad hours',
        pricingType: 'free',
        batches: [{ classType: 'live', schedule: { startTime: '09:00', endTime: '08:00' } }],
      }).success,
    ).toBe(false);
  });

  it('rejects an invalid weekday', () => {
    expect(
      offeringCreateSchema.safeParse({
        name: 'Bad day',
        pricingType: 'free',
        batches: [{ classType: 'live', schedule: { days: ['funday'] } }],
      }).success,
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

describe('classCreateSchema', () => {
  it('requires a title and defaults isRecorded to false', () => {
    const ok = classCreateSchema.safeParse({ title: 'HIIT' });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.isRecorded).toBe(false);
    expect(classCreateSchema.safeParse({ title: '' }).success).toBe(false);
    expect(classCreateSchema.safeParse({ title: 'x', instructorId: 'nope' }).success).toBe(false);
  });
});

describe('classSessionCreateSchema', () => {
  it('requires end after start and rejects non-URL links', () => {
    expect(
      classSessionCreateSchema.safeParse({
        startsAt: '2026-06-01T10:00:00Z',
        endsAt: '2026-06-01T11:00:00Z',
      }).success,
    ).toBe(true);
    expect(
      classSessionCreateSchema.safeParse({
        startsAt: '2026-06-01T11:00:00Z',
        endsAt: '2026-06-01T10:00:00Z',
      }).success,
    ).toBe(false);
    expect(
      classSessionCreateSchema.safeParse({
        startsAt: '2026-06-01T10:00:00Z',
        endsAt: '2026-06-01T11:00:00Z',
        liveLink: 'not-a-url',
      }).success,
    ).toBe(false);
  });
});

describe('brandingSchema', () => {
  it('accepts hex colours and urls, rejects bad colours', () => {
    expect(brandingSchema.safeParse({ primaryColor: '#FF5A1F' }).success).toBe(true);
    expect(brandingSchema.safeParse({ logoUrl: 'https://x.test/l.png' }).success).toBe(true);
    expect(brandingSchema.safeParse({ logoUrl: '' }).success).toBe(true);
    expect(brandingSchema.safeParse({ primaryColor: 'red' }).success).toBe(false);
    expect(brandingSchema.safeParse({ primaryColor: '#FFF' }).success).toBe(false);
  });
});

describe('settingsUpdateSchema', () => {
  it('requires at least one field and validates subdomain', () => {
    expect(settingsUpdateSchema.safeParse({}).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ name: 'Peak Gym' }).success).toBe(true);
    expect(settingsUpdateSchema.safeParse({ subdomain: 'peak-gym' }).success).toBe(true);
    expect(settingsUpdateSchema.safeParse({ subdomain: 'Bad_Sub' }).success).toBe(false);
    expect(
      settingsUpdateSchema.safeParse({ branding: { primaryColor: '#123ABC' } }).success,
    ).toBe(true);
  });
});

describe('clientProfileUpdateSchema', () => {
  it('requires a field and bounds name length', () => {
    expect(clientProfileUpdateSchema.safeParse({}).success).toBe(false);
    expect(clientProfileUpdateSchema.safeParse({ fullName: 'Aarav' }).success).toBe(true);
    expect(clientProfileUpdateSchema.safeParse({ phone: '+91 98765 43210' }).success).toBe(true);
    expect(clientProfileUpdateSchema.safeParse({ fullName: '' }).success).toBe(false);
  });
});

describe('razorpayConnectSchema', () => {
  const valid = {
    keyId: 'rzp_test_ABC123xyz',
    keySecret: 'supersecret_value',
    webhookSecret: 'whsec_123456',
  };

  it('accepts test and live key ids with all three fields', () => {
    expect(razorpayConnectSchema.safeParse(valid).success).toBe(true);
    expect(
      razorpayConnectSchema.safeParse({ ...valid, keyId: 'rzp_live_ABC123xyz' }).success,
    ).toBe(true);
  });

  it('rejects a malformed key id', () => {
    expect(razorpayConnectSchema.safeParse({ ...valid, keyId: 'pk_test_x' }).success).toBe(false);
    expect(razorpayConnectSchema.safeParse({ ...valid, keyId: '' }).success).toBe(false);
  });

  it('requires a plausibly-long key and webhook secret', () => {
    expect(razorpayConnectSchema.safeParse({ ...valid, keySecret: 'short' }).success).toBe(false);
    expect(razorpayConnectSchema.safeParse({ ...valid, webhookSecret: 'x' }).success).toBe(false);
  });

  it('requires all three fields', () => {
    expect(razorpayConnectSchema.safeParse({ keyId: valid.keyId }).success).toBe(false);
  });
});

describe('enrollmentCreateSchema & attendanceMarkSchema', () => {
  it('validate ids and status enums', () => {
    expect(enrollmentCreateSchema.safeParse({ clientId: UUID }).success).toBe(true);
    expect(enrollmentCreateSchema.safeParse({ clientId: 'nope' }).success).toBe(false);
    expect(attendanceMarkSchema.safeParse({ clientId: UUID, status: 'present' }).success).toBe(true);
    expect(attendanceMarkSchema.safeParse({ clientId: UUID, status: 'here' }).success).toBe(false);
  });
});

describe('teamInviteSchema', () => {
  it('requires email, name and a non-owner role (no password)', () => {
    for (const role of ['manager', 'support', 'coach', 'dietician']) {
      expect(
        teamInviteSchema.safeParse({ email: 'a@b.com', name: 'Aarav', role }).success,
      ).toBe(true);
    }
    // name is required now
    expect(teamInviteSchema.safeParse({ email: 'a@b.com', role: 'support' }).success).toBe(false);
    // owner cannot be invited
    expect(
      teamInviteSchema.safeParse({ email: 'a@b.com', name: 'X', role: 'owner' }).success,
    ).toBe(false);
  });
});

describe('teamMemberUpdateSchema', () => {
  it('accepts partial profile/role/active updates', () => {
    expect(teamMemberUpdateSchema.safeParse({ role: 'manager' }).success).toBe(true);
    expect(teamMemberUpdateSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(
      teamMemberUpdateSchema.safeParse({ specialtyTags: ['Yoga', 'Rehab'], bio: 'Hi' }).success,
    ).toBe(true);
    expect(teamMemberUpdateSchema.safeParse({ profilePhotoUrl: null }).success).toBe(true);
  });

  it('rejects an empty patch and invalid fields', () => {
    expect(teamMemberUpdateSchema.safeParse({}).success).toBe(false);
    expect(teamMemberUpdateSchema.safeParse({ role: 'owner' }).success).toBe(false);
    expect(teamMemberUpdateSchema.safeParse({ profilePhotoUrl: 'not-a-url' }).success).toBe(false);
  });
});
