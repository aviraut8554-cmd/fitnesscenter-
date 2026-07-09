import { ApiClientError } from '@/lib/api';

/**
 * Turns an API error into copy that is safe and friendly to show a *client*
 * (PWA) user. Known leaky/internal errors are mapped to plain-language text;
 * server/internal failures collapse to a generic message; otherwise the
 * caller-supplied fallback (or the original message for clear 4xx errors) wins.
 */
const CODE_MESSAGES: Record<string, string> = {
  razorpay_not_configured: 'Payments aren’t set up yet — please reach out to your coach.',
  invalid_response: 'Something went wrong. Please try again.',
};

export function friendlyError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof ApiClientError) {
    if (CODE_MESSAGES[err.code]) return CODE_MESSAGES[err.code];
    // Internal / DB-level failures should never surface raw text to clients.
    if (err.status >= 500 || err.code === 'unprocessable' || err.code === 'error') {
      return fallback;
    }
    // Clear, user-actionable 4xx messages are safe to show as-is.
    return err.message || fallback;
  }
  return fallback;
}
