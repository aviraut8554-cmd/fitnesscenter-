import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { env } from '@/lib/env';

export type AdminSupabase = ReturnType<typeof createClient<Database>>;

let cached: AdminSupabase | null = null;

/**
 * Service-role Supabase client. Bypasses Row-Level Security — use ONLY for
 * trusted, server-verified operations (signup provisioning, order creation,
 * webhook processing). Never expose this client or its key to the browser,
 * and always enforce authorization explicitly before using it.
 */
export function createAdminSupabase(): AdminSupabase {
  if (cached) return cached;

  cached = createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  return cached;
}
