import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendEmail, type EmailProviderConfig } from '@/lib/email-provider';

const config: EmailProviderConfig = {
  apiKey: 're_test_key',
  fromEmail: 'hello@example.com',
  fromName: 'Peak Performance',
  source: 'tenant',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sendEmail', () => {
  it('reports an unconfigured provider without making a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendEmail(null, {
      recipient: 'client@example.com',
      subject: 'Hello',
      body: 'Welcome',
    });

    expect(result).toEqual({
      ok: false,
      reason: 'not_configured',
      error: 'Email delivery is not configured',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the tenant sender identity through Resend', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'email_123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendEmail(config, {
      recipient: 'client@example.com',
      subject: 'Class reminder',
      body: 'Your class starts soon.',
    });

    expect(result).toEqual({ ok: true, providerId: 'email_123' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: {
          authorization: 'Bearer re_test_key',
          'content-type': 'application/json',
        },
      }),
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      from: 'Peak Performance <hello@example.com>',
      to: 'client@example.com',
      subject: 'Class reminder',
      text: 'Your class starts soon.',
    });
  });

  it('returns the provider error without exposing the API key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('domain is not verified', { status: 403 })));

    const result = await sendEmail(config, {
      recipient: 'client@example.com',
      subject: null,
      body: 'Test',
    });

    expect(result).toEqual({
      ok: false,
      reason: 'provider_error',
      error: 'Resend 403: domain is not verified',
    });
    if (!result.ok) expect(result.error).not.toContain(config.apiKey);
  });
});
