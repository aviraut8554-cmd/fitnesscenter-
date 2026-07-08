import { describe, expect, it } from 'vitest';
import {
  influencerSignupSchema,
  clientCreateSchema,
  subdomainSchema,
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
