import type { AttendanceEntry } from '@/lib/admin-types';
import { requireTeamMember } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { attendanceMarkSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Attendance sheet for a session: one row per client enrolled in the parent
 * class, merged with any attendance already marked. Team members only.
 */
export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id: sessionId } = await ctx.params;
    const { supabase, tenantId } = await requireTeamMember(request);

    const session = await supabase
      .from('class_sessions')
      .select('id, class_id')
      .eq('tenant_id', tenantId)
      .eq('id', sessionId)
      .maybeSingle();
    if (session.error) throw ApiError.unprocessable(session.error.message);
    if (!session.data) throw ApiError.notFound('Session not found');

    const enrollments = await supabase
      .from('enrollments')
      .select('client_id, status, client:clients(full_name)')
      .eq('tenant_id', tenantId)
      .eq('class_id', session.data.class_id)
      .eq('status', 'active');
    if (enrollments.error) throw ApiError.unprocessable(enrollments.error.message);

    const marks = await supabase
      .from('attendance')
      .select('id, client_id, status, marked_at')
      .eq('tenant_id', tenantId)
      .eq('class_session_id', sessionId);
    if (marks.error) throw ApiError.unprocessable(marks.error.message);

    const byClient = new Map((marks.data ?? []).map((m) => [m.client_id, m]));
    const entries: AttendanceEntry[] = (enrollments.data ?? []).map((e) => {
      const mark = byClient.get(e.client_id);
      return {
        clientId: e.client_id,
        fullName: e.client?.full_name ?? 'Client',
        status: mark?.status ?? 'registered',
        attendanceId: mark?.id ?? null,
        markedAt: mark?.marked_at ?? null,
      };
    });

    return jsonOk({ attendance: entries });
  })(request, {});
}

/** Mark (upsert) a client's attendance for a session. Team members only. */
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id: sessionId } = await ctx.params;
    const { supabase, tenantId } = await requireTeamMember(request);
    const input = await parseJson(request, attendanceMarkSchema);

    const session = await supabase
      .from('class_sessions')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', sessionId)
      .maybeSingle();
    if (session.error) throw ApiError.unprocessable(session.error.message);
    if (!session.data) throw ApiError.notFound('Session not found');

    const { data, error } = await supabase
      .from('attendance')
      .upsert(
        {
          tenant_id: tenantId,
          class_session_id: sessionId,
          client_id: input.clientId,
          status: input.status,
          marked_at: new Date().toISOString(),
        },
        { onConflict: 'class_session_id,client_id' },
      )
      .select()
      .single();
    if (error) {
      if (error.code === '23503') throw ApiError.badRequest('Unknown session or client');
      throw ApiError.unprocessable(error.message);
    }

    return jsonOk({ attendance: data });
  })(request, {});
}
