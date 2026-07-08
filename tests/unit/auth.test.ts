import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the request-scoped Supabase client factory so requireTeamMember can be
// exercised in isolation.
const getUser = vi.fn();
const eq = vi.fn();
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({ auth: { getUser }, from })),
}));

import { requireTeamMember } from '@/lib/auth';
import { ApiError } from '@/lib/http';

const USER = { id: 'user-1' };

function req(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/team', {
    headers: { authorization: 'Bearer token', ...headers },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: USER }, error: null });
});

describe('requireTeamMember', () => {
  it('queries only the caller\'s own memberships (filtered by user_id)', async () => {
    eq.mockResolvedValue({ data: [{ tenant_id: 't1', role: 'owner' }], error: null });

    const ctx = await requireTeamMember(req());

    expect(from).toHaveBeenCalledWith('team_members');
    // Regression: must filter by the caller's user_id, not read the whole roster.
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(ctx.tenantId).toBe('t1');
    expect(ctx.role).toBe('owner');
  });

  it('resolves a single-tenant owner even when the tenant has multiple members', async () => {
    // The filtered query returns exactly one row for this user.
    eq.mockResolvedValue({ data: [{ tenant_id: 't1', role: 'owner' }], error: null });

    const ctx = await requireTeamMember(req());
    expect(ctx.tenantId).toBe('t1');
  });

  it('enforces allowedRoles (support cannot perform owner-only action)', async () => {
    eq.mockResolvedValue({ data: [{ tenant_id: 't1', role: 'support' }], error: null });

    await expect(requireTeamMember(req(), ['owner'])).rejects.toMatchObject({
      status: 403,
    } satisfies Partial<ApiError>);
  });

  it('requires x-tenant-id only when the caller truly belongs to multiple tenants', async () => {
    eq.mockResolvedValue({
      data: [
        { tenant_id: 't1', role: 'owner' },
        { tenant_id: 't2', role: 'manager' },
      ],
      error: null,
    });

    await expect(requireTeamMember(req())).rejects.toMatchObject({ status: 400 });

    const ctx = await requireTeamMember(req({ 'x-tenant-id': 't2' }));
    expect(ctx.tenantId).toBe('t2');
    expect(ctx.role).toBe('manager');
  });
});
