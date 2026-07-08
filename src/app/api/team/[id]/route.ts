import { requireTeamMember } from '@/lib/auth';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { teamRoleUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Change a team member's role (owner only). The owner's own membership and the
 * owner role itself are immutable here — ownership transfer is out of scope.
 */
export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id } = await ctx.params;
    const { tenantId, user } = await requireTeamMember(request, ['owner']);
    const input = await parseJson(request, teamRoleUpdateSchema);
    const admin = createAdminSupabase();

    const { data: target } = await admin
      .from('team_members')
      .select('id, user_id, role')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (!target) throw ApiError.notFound('Team member not found');
    if (target.role === 'owner') throw ApiError.badRequest('Cannot change the owner role');

    const { data, error } = await admin
      .from('team_members')
      .update({ role: input.role })
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select()
      .single();
    if (error) throw ApiError.unprocessable(error.message);

    await admin.from('audit_log').insert({
      tenant_id: tenantId,
      actor_user_id: user.id,
      action: 'team_member.role_changed',
      target_table: 'team_members',
      target_id: id,
      changes: { from: target.role, to: input.role },
    });

    return jsonOk({ teamMember: data });
  })(request, {});
}

/**
 * Remove a team member (owner only). Deletes the membership and the underlying
 * auth user. The owner cannot remove themselves.
 */
export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id } = await ctx.params;
    const { tenantId, user } = await requireTeamMember(request, ['owner']);
    const admin = createAdminSupabase();

    const { data: target } = await admin
      .from('team_members')
      .select('id, user_id, role')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (!target) throw ApiError.notFound('Team member not found');
    if (target.role === 'owner') throw ApiError.badRequest('Cannot remove the owner');
    if (target.user_id === user.id) throw ApiError.badRequest('You cannot remove yourself');

    const { error } = await admin
      .from('team_members')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', id);
    if (error) throw ApiError.unprocessable(error.message);

    await admin.auth.admin.deleteUser(target.user_id);

    await admin.from('audit_log').insert({
      tenant_id: tenantId,
      actor_user_id: user.id,
      action: 'team_member.removed',
      target_table: 'team_members',
      target_id: id,
      changes: { role: target.role },
    });

    return jsonOk({ removed: id });
  })(request, {});
}
