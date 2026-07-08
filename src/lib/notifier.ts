import { env } from '@/lib/env';

/**
 * Channel dispatchers. Each channel (email, WhatsApp) has a provider that is
 * only used when its credentials are configured; otherwise the dispatcher runs
 * in **dry-run/log mode** — it logs the message and reports success without
 * calling any external API. This lets the whole automation engine be exercised
 * end-to-end (rules → outbox → "sent") in local/CI without live providers, and
 * flips to real delivery the moment the env vars are present.
 */

export type Channel = 'email' | 'whatsapp';

export interface DispatchMessage {
  channel: Channel;
  recipient: string;
  subject: string | null;
  body: string;
}

export type DispatchResult =
  | { ok: true; mode: 'log' | 'live'; providerId?: string }
  | { ok: false; error: string };

export function isChannelConfigured(channel: Channel): boolean {
  if (channel === 'email') return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
  return Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_ID);
}

async function sendEmail(msg: DispatchMessage): Promise<DispatchResult> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    console.info('[notifier:email:dry-run]', { to: msg.recipient, subject: msg.subject });
    return { ok: true, mode: 'log' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: msg.recipient,
        subject: msg.subject ?? 'Notification',
        text: msg.body,
      }),
    });
    if (!res.ok) return { ok: false, error: `email provider ${res.status}: ${await res.text()}` };
    const data = (await res.json()) as { id?: string };
    return { ok: true, mode: 'live', providerId: data.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'email send failed' };
  }
}

async function sendWhatsApp(msg: DispatchMessage): Promise<DispatchResult> {
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_ID) {
    console.info('[notifier:whatsapp:dry-run]', { to: msg.recipient });
    return { ok: true, mode: 'log' };
  }
  try {
    const res = await fetch(
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
    if (!res.ok) return { ok: false, error: `whatsapp provider ${res.status}: ${await res.text()}` };
    const data = (await res.json()) as { messages?: { id?: string }[] };
    return { ok: true, mode: 'live', providerId: data.messages?.[0]?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'whatsapp send failed' };
  }
}

/** Send one message on its channel, returning a structured result. */
export function dispatch(msg: DispatchMessage): Promise<DispatchResult> {
  return msg.channel === 'email' ? sendEmail(msg) : sendWhatsApp(msg);
}
