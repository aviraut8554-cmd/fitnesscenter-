import { env } from '@/lib/env';
import { emailConfigForTenant, sendEmail } from '@/lib/email-provider';
import type { AdminSupabase } from '@/lib/supabase/admin';

export type Channel = 'email' | 'whatsapp';

export interface DispatchMessage {
  channel: Channel;
  recipient: string;
  subject: string | null;
  body: string;
}

export type DispatchResult =
  | { ok: true; mode: 'log' | 'live'; providerId?: string }
  | { ok: false; error: string; reason: 'not_configured' | 'provider_error' };

async function sendWhatsApp(
  msg: DispatchMessage,
  allowLogFallback: boolean,
): Promise<DispatchResult> {
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_ID) {
    if (allowLogFallback) {
      console.info('[notifier:whatsapp:dry-run]', { to: msg.recipient });
      return { ok: true, mode: 'log' };
    }
    return {
      ok: false,
      reason: 'not_configured',
      error: 'WhatsApp delivery is not configured',
    };
  }
  try {
    const response = await fetch(
      `https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: msg.recipient,
          type: 'text',
          text: { body: msg.body },
        }),
      },
    );
    if (!response.ok) {
      return {
        ok: false,
        reason: 'provider_error',
        error: `WhatsApp provider ${response.status}: ${await response.text()}`,
      };
    }
    const data = (await response.json()) as { messages?: { id?: string }[] };
    return { ok: true, mode: 'live', providerId: data.messages?.[0]?.id };
  } catch (error) {
    return {
      ok: false,
      reason: 'provider_error',
      error: error instanceof Error ? error.message : 'WhatsApp send failed',
    };
  }
}

/** Deliver one message using tenant credentials, with optional local/CI log mode. */
export async function dispatch(
  admin: AdminSupabase,
  tenantId: string,
  msg: DispatchMessage,
  options: { allowLogFallback?: boolean } = {},
): Promise<DispatchResult> {
  const allowLogFallback = options.allowLogFallback ?? true;
  if (msg.channel === 'whatsapp') return sendWhatsApp(msg, allowLogFallback);

  const config = await emailConfigForTenant(admin, tenantId);
  if (!config && allowLogFallback) {
    console.info('[notifier:email:dry-run]', { to: msg.recipient, subject: msg.subject });
    return { ok: true, mode: 'log' };
  }
  const result = await sendEmail(config, msg);
  return result.ok
    ? { ok: true, mode: 'live', providerId: result.providerId }
    : result;
}
