import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { env } from '@/lib/env';

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Supabase client bound to the current request's auth. All queries run as the
 * signed-in user, so Row-Level Security is fully enforced.
 *
 * Auth is resolved from either an `Authorization: Bearer <jwt>` header (used by
 * standalone frontend/mobile clients) or the request cookies (used by the
 * browser during SSR). When a bearer token is supplied it takes precedence and
 * is forwarded to PostgREST so row access matches the token's user.
 */
export async function createServerSupabase(
  accessToken?: string,
): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: accessToken
        ? { headers: { Authorization: `Bearer ${accessToken}` } }
        : undefined,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // `setAll` is called from Server Components where mutating cookies
            // is disallowed; session refresh is handled in proxy/middleware.
          }
        },
      },
    },
  );
}
