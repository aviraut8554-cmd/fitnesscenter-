import type { Json } from '@/lib/database.types';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { influencerSignupSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * Provision a new influencer (tenant owner):
 *  1. create the auth user
 *  2. atomically create the tenant + owner membership (provision_tenant RPC)
 * If provisioning fails, the just-created auth user is rolled back so signup
 * can be safely retried.
 */
export const POST = handleRoute(async (request) => {
  const input = await parseJson(request, influencerSignupSchema);
  const admin = createAdminSupabase();

  const existing = await admin
    .from('tenants')
    .select('id')
    .eq('subdomain', input.subdomain)
    .maybeSingle();
  if (existing.data) {
    throw ApiError.conflict('Subdomain is already taken');
  }

  const created = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name, role: 'influencer' },
  });
  if (created.error || !created.data.user) {
    if (created.error?.message?.toLowerCase().includes('already')) {
      throw ApiError.conflict('An account with this email already exists');
    }
    throw ApiError.badRequest(created.error?.message ?? 'Could not create user');
  }

  const userId = created.data.user.id;

  const provisioned = await admin.rpc('provision_tenant', {
    p_owner_user_id: userId,
    p_name: input.tenantName,
    p_subdomain: input.subdomain,
    p_branding: (input.branding ?? {}) as Json,
    p_plan_code: input.planCode ?? undefined,
  });

  if (provisioned.error) {
    // Roll back the orphaned auth user so the signup can be retried cleanly.
    await admin.auth.admin.deleteUser(userId);
    if (provisioned.error.code === '23505') {
      throw ApiError.conflict('Subdomain is already taken');
    }
    throw ApiError.unprocessable(`Failed to provision tenant: ${provisioned.error.message}`);
  }

  return jsonOk({ userId, tenant: provisioned.data }, 201);
});
