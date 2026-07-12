import { decryptSecret, encryptionConfigured } from '@/lib/crypto';
import { env } from '@/lib/env';
import type { EmailProviderStatus } from '@/lib/admin-types';
import type { AdminSupabase } from '@/lib/supabase/admin';

export type EmailProviderConfig = {
  apiKey: string;
  fromEmail: string;
  fromName: string | null;
  source: 'tenant' | 'env';
};

export type EmailSendResult =
  | { ok: true; providerId?: string }
  | { ok: false; error: string; reason: 'not_configured' | 'provider_error' };

function parseEnvFrom(value: string): { fromEmail: string; fromName: string | null } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value);
  if (match) return { fromName: match[1] || null, fromEmail: match[2] };
  return { fromEmail: value.trim(), fromName: null };
}

function fromHeader(config: Pick<EmailProviderConfig, 'fromEmail' | 'fromName'>): string {
  return config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail;
}

/** Resolve a tenant-specific Resend connection, then deployment fallback. */
export async function emailConfigForTenant(
  admin: AdminSupabase,
  tenantId: string,
): Promise<EmailProviderConfig | null> {
  const { data, error } = await admin
    .from('tenant_email_credentials')
    .select('api_key_enc, from_email, from_name')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw new Error(`email provider: failed to load credentials: ${error.message}`);

  if (data) {
    return {
      apiKey: decryptSecret(data.api_key_enc),
      fromEmail: data.from_email,
      fromName: data.from_name,
      source: 'tenant',
    };
  }

  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    const from = parseEnvFrom(env.EMAIL_FROM);
    return { apiKey: env.RESEND_API_KEY, ...from, source: 'env' };
  }
  return null;
}

/** Return secret-free provider status for the Automations page. */
export async function emailStatusForTenant(
  admin: AdminSupabase,
  tenantId: string,
): Promise<EmailProviderStatus> {
  const encryptionReady = encryptionConfigured();
  const { data, error } = await admin
    .from('tenant_email_credentials')
    .select('from_email, from_name')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw new Error(`email provider: failed to load status: ${error.message}`);

  if (data) {
    return {
      configured: true,
      source: 'tenant',
      provider: 'resend',
      fromEmail: data.from_email,
      fromName: data.from_name,
      encryptionReady,
    };
  }
  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    const from = parseEnvFrom(env.EMAIL_FROM);
    return {
      configured: true,
      source: 'env',
      provider: 'resend',
      ...from,
      encryptionReady,
    };
  }
  return {
    configured: false,
    source: null,
    provider: 'resend',
    fromEmail: null,
    fromName: null,
    encryptionReady,
  };
}

/** Send one plain-text email through Resend. */
export async function sendEmail(
  config: EmailProviderConfig | null,
  message: { recipient: string; subject: string | null; body: string },
): Promise<EmailSendResult> {
  if (!config) {
    return { ok: false, reason: 'not_configured', error: 'Email delivery is not configured' };
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: fromHeader(config),
        to: message.recipient,
        subject: message.subject ?? 'Notification',
        text: message.body,
      }),
    });
    if (!response.ok) {
      return {
        ok: false,
        reason: 'provider_error',
        error: `Resend ${response.status}: ${await response.text()}`,
      };
    }
    const payload = (await response.json()) as { id?: string };
    return { ok: true, providerId: payload.id };
  } catch (error) {
    return {
      ok: false,
      reason: 'provider_error',
      error: error instanceof Error ? error.message : 'Email send failed',
    };
  }
}
