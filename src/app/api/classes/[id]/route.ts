import type { Database } from '@/lib/database.types';
import { requireTeamMember } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { classUpdateSchema } from '@/lib/validation';
import { resolveInstructorNames } from '@/lib/class-service';

export const dynamic = 'force-dynamic';

type ClassUpdate = Database['public']['Tables']['classes']['Update'];
type Ctx = { params: Promise<{ id: string }> };

/** Fetch a single class with its sessions and instructor name. */
export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id } = await ctx.params;
    const { supabase, tenantId } = await requireTeamMember(request);

    const { data, error } = await supabase
      .from('classes')
      .select('*, product:products_services(name, type), sessions:class_sessions(*)')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw ApiError.unprocessable(error.message);
    if (!data) throw ApiError.notFound('Class not found');

    const names = data.instructor_id
      ? await resolveInstructorNames(tenantId, [data.instructor_id])
      : new Map<string, string>();
    const { sessions, ...rest } = data;

    return jsonOk({
      class: {
        ...rest,
        instructor: data.instructor_id
          ? { id: data.instructor_id, name: names.get(data.instructor_id) ?? 'Coach' }
          : null,
        sessions: [...(sessions ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
      },
    });
  })(request, {});
}

/** Update a class (owner/manager). */
export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id } = await ctx.params;
    const { supabase, tenantId } = await requireTeamMember(request, ['owner', 'manager']);
    const input = await parseJson(request, classUpdateSchema);

    const patch: ClassUpdate = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.instructorId !== undefined) patch.instructor_id = input.instructorId;
    if (input.productId !== undefined) patch.product_id = input.productId;
    if (input.capacity !== undefined) patch.capacity = input.capacity;
    if (input.isRecorded !== undefined) patch.is_recorded = input.isRecorded;

    const { data, error } = await supabase
      .from('classes')
      .update(patch)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw ApiError.unprocessable(error.message);
    if (!data) throw ApiError.notFound('Class not found');

    return jsonOk({ class: data });
  })(request, {});
}

/** Delete a class (owner/manager). Sessions/enrollments cascade. */
export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id } = await ctx.params;
    const { supabase, tenantId } = await requireTeamMember(request, ['owner', 'manager']);

    const { error } = await supabase
      .from('classes')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', id);
    if (error) throw ApiError.unprocessable(error.message);

    return jsonOk({ deleted: true });
  })(request, {});
}
