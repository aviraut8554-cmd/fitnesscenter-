import { createAdminSupabase } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { ApiError, handleRoute, jsonOk } from '@/lib/http';
import { runReminders } from '@/lib/reminder-service';
import { autoAssignDueSelections } from '@/lib/batch-selection';

export const dynamic = 'force-dynamic';

/**
 * Daily reminder job. Scans all tenants for upcoming class sessions, bookings
 * and renewals and queues + sends the configured notifications. Meant to be
 * called by a scheduler (Vercel Cron — see `vercel.json`). When `CRON_SECRET`
 * is set the caller must present it as a bearer token; Vercel Cron sends it
 * automatically. Idempotent, so accidental double-invocation is safe.
 */
async function run(request: Request): Promise<Response> {
  if (env.CRON_SECRET) {
    const header = request.headers.get('authorization');
    if (header !== `Bearer ${env.CRON_SECRET}`) {
      throw ApiError.unauthorized('Invalid or missing cron secret');
    }
  }
  const admin = createAdminSupabase();
  const summary = await runReminders(admin);
  const batchAssignment = await autoAssignDueSelections(admin);
  return jsonOk({ ok: true, ...summary, batchAssignment });
}

export const GET = handleRoute(run);
export const POST = handleRoute(run);
