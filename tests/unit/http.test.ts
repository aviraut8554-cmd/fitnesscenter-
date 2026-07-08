import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiError, handleRoute, parseJson } from '@/lib/http';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('handleRoute', () => {
  it('maps ApiError to its status and code', async () => {
    const handler = handleRoute(async () => {
      throw ApiError.forbidden('nope');
    });
    const res = await handler(makeRequest({}), {});
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe('forbidden');
  });

  it('maps ZodError to a 400', async () => {
    const schema = z.object({ x: z.number() });
    const handler = handleRoute(async (req) => {
      await parseJson(req, schema);
      return new Response('ok');
    });
    const res = await handler(makeRequest({ x: 'not-a-number' }), {});
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('bad_request');
  });

  it('maps unexpected errors to a 500', async () => {
    const handler = handleRoute(async () => {
      throw new Error('boom');
    });
    const res = await handler(makeRequest({}), {});
    expect(res.status).toBe(500);
  });
});

describe('parseJson', () => {
  it('rejects malformed JSON with a 400 ApiError', async () => {
    const req = new Request('http://localhost/api/test', {
      method: 'POST',
      body: '{not json',
      headers: { 'content-type': 'application/json' },
    });
    await expect(parseJson(req, z.object({}))).rejects.toMatchObject({ status: 400 });
  });
});
