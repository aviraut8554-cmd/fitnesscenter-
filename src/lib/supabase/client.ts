import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

/**
 * Supabase client for the browser. Reads the public env vars directly from
 * `process.env` (inlined by Next at build time for `NEXT_PUBLIC_*`) rather than
 * importing `@/lib/env`, which validates the service-role key and must never be
 * bundled into client code.
 */
export function createBrowserSupabase(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY',
    );
  }
  return createBrowserClient<Database>(url, anonKey);
}
