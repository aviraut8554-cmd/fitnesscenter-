import { requireTeamMember } from '@/lib/auth';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { encryptSecret } from '@/lib/crypto';
import { emailConfigForTenant, emailStatusForTenant, sendEmail } from '@/lib/email-provider';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { emailProviderConnectSchema, emailProviderTestSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export const GET = handleRoute(async (request) => {
  const { tenantId } = await requireTeamMember(request, ['owner', 'manager']);
  const admin = createAdminSupabase();
  return jsonOk({ email: await emailStatusForTenant(admin, tenantId) });
});

export const PUT = handleRoute(async (request) => {
  const { tenantId } = await requireTeamMember(request, ['owner']);
  const input = await parseJson(request, emailProviderConnectSchema);
  const admin = createAdminSupabase();

  const { error } = await admin.from('tenant_email_credentials').upsert(
    {
      tenant_id: tenantId,
      provider: 'resend',
      api_key_enc: encryptSecret(input.apiKey),
      from_email: input.fromEmail,
      from_name: input.fromName || null,
      connected_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id' },
  );
  if (error) throw ApiError.unprocessable(error.message);

  return jsonOk({ email: await emailStatusForTenant(admin, tenantId) });
});

export const POST = handleRoute(async (request) => {
  const { tenantId } = await requireTeamMember(request, ['owner']);
  const input = await parseJson(request, emailProviderTestSchema);
  const admin = createAdminSupabase();
  const [{ data: tenant }, config] = await Promise.all([
    admin.from('tenants').select('name').eq('id', tenantId).maybeSingle(),
    emailConfigForTenant(admin, tenantId),
  ]);

  const result = await sendEmail(config, {
    recipient: input.recipient,
    subject: `Test email from ${tenant?.name ?? 'Fitness Creator OS'}`,
    body: 'Your automation email connection is working. You can now enable email messages from the Automations page.',
  });
  if (!result.ok) throw ApiError.unprocessable(result.error);

  return jsonOk({ sent: true, providerId: result.providerId ?? null });
});

export const DELETE = handleRoute(async (request) => {
  const { tenantId } = await requireTeamMember(request, ['owner']);
  const admin = createAdminSupabase();

  const { error } = await admin
    .from('tenant_email_credentials')
    .delete()
    .eq('tenant_id', tenantId);
  if (error) throw ApiError.unprocessable(error.message);

  const status = await emailStatusForTenant(admin, tenantId);
  if (!status.configured) {
    const { error: rulesError } = await admin
      .from('automation_rules')
      .update({ enabled: false })
      .eq('tenant_id', tenantId)
      .eq('channel', 'email');
    if (rulesError) throw ApiError.unprocessable(rulesError.message);
  }

  return jsonOk({ email: status });
});
