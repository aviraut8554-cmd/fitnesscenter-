import { createAdminSupabase } from '@/lib/supabase/admin';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { clientSignupSchema } from '@/lib/validation';
import { fireEvent } from '@/lib/automation';

export const dynamic = 'force-dynamic';

/**
 * Onboard a client into a tenant (via its branded subdomain):
 *  1. resolve the tenant
 *  2. create the auth user
 *  3. create the client record (status: trial)
 * On failure after user creation, the auth user is rolled back.
 */
export const POST = handleRoute(async (request) => {
  const input = await parseJson(request, clientSignupSchema);
  const admin = createAdminSupabase();

  const tenant = await admin
    .from('tenants')
    .select('id, name, is_active')
    .eq('subdomain', input.subdomain)
    .maybeSingle();
  if (tenant.error) {
    throw ApiError.unprocessable('Failed to resolve tenant');
  }
  if (!tenant.data || !tenant.data.is_active) {
    throw ApiError.notFound('No active fitness business found for that subdomain');
  }
  const tenantId = tenant.data.id;

  const existingClient = await admin
    .from('clients')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('email', input.email)
    .maybeSingle();
  if (existingClient.data) {
    throw ApiError.conflict('A client with this email already exists for this business');
  }

  const created = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.fullName, role: 'client' },
  });
  if (created.error || !created.data.user) {
    if (created.error?.message?.toLowerCase().includes('already')) {
      throw ApiError.conflict('An account with this email already exists');
    }
    throw ApiError.badRequest(created.error?.message ?? 'Could not create user');
  }
  const userId = created.data.user.id;

  const client = await admin
    .from('clients')
    .insert({
      tenant_id: tenantId,
      user_id: userId,
      full_name: input.fullName,
      email: input.email,
      phone: input.phone ?? null,
      status: 'trial',
    })
    .select()
    .single();

  if (client.error) {
    await admin.auth.admin.deleteUser(userId);
    if (client.error.code === '23505') {
      throw ApiError.conflict('A client with this email already exists for this business');
    }
    throw ApiError.unprocessable(`Failed to create client: ${client.error.message}`);
  }

  await admin.from('audit_log').insert({
    tenant_id: tenantId,
    actor_user_id: userId,
    action: 'client.signup',
    target_table: 'clients',
    target_id: client.data.id,
  });

  // Best-effort welcome automation; never block signup on a notification error.
  try {
    await fireEvent({
      admin,
      tenantId,
      trigger: 'client_signup',
      recipient: {
        clientId: client.data.id,
        email: client.data.email,
        phone: client.data.phone,
      },
      vars: { clientName: input.fullName, businessName: tenant.data.name },
    });
  } catch (err) {
    console.error('client_signup automation failed:', err);
  }

  return jsonOk({ userId, client: client.data }, 201);
});
