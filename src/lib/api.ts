/**
 * Browser-side client for the app's own `/api/*` routes. Auth rides on the
 * Supabase session cookie (same-origin), so callers never handle tokens. The
 * server wraps success as `{ data }` and errors as `{ error: { code, message } }`
 * (see `src/lib/http.ts`); this unwraps both and throws `ApiClientError` on failure.
 */
export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
  }
}

type ApiInit = Omit<RequestInit, 'body'> & { body?: unknown };

export async function apiFetch<T>(path: string, init: ApiInit = {}): Promise<T> {
  const { body, headers, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    credentials: 'same-origin',
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiClientError(res.status, 'invalid_response', 'Malformed server response');
    }
  }

  if (!res.ok) {
    const err = (payload as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiClientError(res.status, err?.code ?? 'error', err?.message ?? res.statusText);
  }

  return (payload as { data: T }).data;
}

export const api = {
  get: <T>(path: string, init?: ApiInit) => apiFetch<T>(path, { ...init, method: 'GET' }),
  post: <T>(path: string, body?: unknown, init?: ApiInit) =>
    apiFetch<T>(path, { ...init, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, init?: ApiInit) =>
    apiFetch<T>(path, { ...init, method: 'PATCH', body }),
  del: <T>(path: string, init?: ApiInit) => apiFetch<T>(path, { ...init, method: 'DELETE' }),
};
