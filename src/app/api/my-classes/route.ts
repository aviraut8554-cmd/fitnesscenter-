import type { ClientClass, ClientSession } from '@/lib/admin-types';
import { requireTenantActor } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk } from '@/lib/http';
import { isSessionLive, resolveInstructorNames } from '@/lib/class-service';

export const dynamic = 'force-dynamic';

/**
 * Classes the calling client is enrolled in, each with its sessions. Live links
 * are TIME-GATED: `liveLink` is only returned while a session is live (see
 * `isSessionLive`); otherwise it is null and the client sees a countdown.
 * Recording URLs are always available to enrolled clients.
 */
export const GET = handleRoute(async (request) => {
  const actor = await requireTenantActor(request);
  if (actor.kind !== 'client') throw ApiError.forbidden('Clients only');
  const { supabase, tenantId } = actor;

  const enr = await supabase
    .from('enrollments')
    .select('class_id, status')
    .eq('tenant_id', tenantId)
    .neq('status', 'cancelled');
  if (enr.error) throw ApiError.unprocessable(enr.error.message);

  const enrollments = enr.data ?? [];
  if (enrollments.length === 0) return jsonOk({ classes: [] });

  const classIds = enrollments.map((e) => e.class_id);
  const statusByClass = new Map(enrollments.map((e) => [e.class_id, e.status]));

  const { data: classes, error } = await supabase
    .from('classes')
    .select('*, sessions:class_sessions(*)')
    .eq('tenant_id', tenantId)
    .in('id', classIds);
  if (error) throw ApiError.unprocessable(error.message);

  const rows = classes ?? [];
  const names = await resolveInstructorNames(
    tenantId,
    rows.map((c) => c.instructor_id).filter((id): id is string => Boolean(id)),
  );

  const now = new Date();
  const result: ClientClass[] = rows.map((c) => {
    const sessions: ClientSession[] = [...(c.sessions ?? [])]
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .map((s) => {
        const live = isSessionLive(s.starts_at, s.ends_at, now);
        return {
          id: s.id,
          startsAt: s.starts_at,
          endsAt: s.ends_at,
          isLive: live,
          liveLink: live ? s.live_link : null,
          recordingUrl: s.recording_url,
        };
      });
    return {
      id: c.id,
      title: c.title,
      description: c.description,
      isRecorded: c.is_recorded,
      instructorName: c.instructor_id ? (names.get(c.instructor_id) ?? 'Coach') : null,
      enrollmentStatus: statusByClass.get(c.id) ?? 'active',
      sessions,
    };
  });

  return jsonOk({ classes: result });
});
