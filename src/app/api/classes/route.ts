import { requireTeamMember } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { classCreateSchema } from '@/lib/validation';
import { resolveInstructorNames } from '@/lib/class-service';

export const dynamic = 'force-dynamic';

/**
 * List the tenant's classes for the admin view. Any team member may read;
 * each class is enriched with its instructor name (resolved via the service
 * role), linked product, sessions and a live enrollment count.
 */
export const GET = handleRoute(async (request) => {
  const { supabase, tenantId } = await requireTeamMember(request);

  const { data, error } = await supabase
    .from('classes')
    .select(
      '*, product:products_services(name, type), sessions:class_sessions(*), enrollments(count)',
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) throw ApiError.unprocessable(error.message);

  const rows = data ?? [];
  const names = await resolveInstructorNames(
    tenantId,
    rows.map((c) => c.instructor_id).filter((id): id is string => Boolean(id)),
  );

  const classes = rows.map((c) => {
    const { enrollments, sessions, ...rest } = c;
    const enrollmentCount = Array.isArray(enrollments) ? (enrollments[0]?.count ?? 0) : 0;
    const sorted = [...(sessions ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return {
      ...rest,
      instructor: c.instructor_id
        ? { id: c.instructor_id, name: names.get(c.instructor_id) ?? 'Coach' }
        : null,
      sessions: sorted,
      enrollmentCount,
    };
  });

  return jsonOk({ classes });
});

/** Create a class (owner/manager). */
export const POST = handleRoute(async (request) => {
  const { supabase, tenantId } = await requireTeamMember(request, ['owner', 'manager']);
  const input = await parseJson(request, classCreateSchema);

  const { data, error } = await supabase
    .from('classes')
    .insert({
      tenant_id: tenantId,
      title: input.title,
      description: input.description ?? null,
      instructor_id: input.instructorId ?? null,
      product_id: input.productId ?? null,
      capacity: input.capacity ?? null,
      is_recorded: input.isRecorded,
    })
    .select()
    .single();
  if (error) throw ApiError.unprocessable(error.message);

  return jsonOk({ class: data }, 201);
});
