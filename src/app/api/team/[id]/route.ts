import { requireTeamMember } from '@/lib/auth';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { teamMemberUpdateSchema } from '@/lib/validation';
import type { Database, Json } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
type TeamMemberUpdate = Database['public']['Tables']['team_members']['Update'];

/**
 * Team member detail (any team member of the tenant can read), enriched with
 * the member's email/name, a derived status, and the classes they instruct.
 */
export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id } = await ctx.params;
    const { tenantId, user } = await requireTeamMember(request);
    const admin = createAdminSupabase();

    const { data: member, error } = await admin
      .from('team_members')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw ApiError.unprocessable(error.message);
    if (!member) throw ApiError.notFound('Team member not found');

    const { data: authUser } = await admin.auth.admin.getUserById(member.user_id);
    const hasSignedIn = Boolean(authUser.user?.last_sign_in_at);
    const status: 'active' | 'invited' | 'inactive' = !member.is_active
      ? 'inactive'
      : hasSignedIn
        ? 'active'
        : 'invited';

    const { data: classes } = await admin
      .from('classes')
      .select('id, title, is_recorded, created_at')
      .eq('tenant_id', tenantId)
      .eq('instructor_id', id)
      .order('created_at', { ascending: false });

    return jsonOk({
      teamMember: {
        ...member,
        email: authUser.user?.email ?? null,
        name: (authUser.user?.user_metadata?.name as string | undefined) ?? null,
        isSelf: member.user_id === user.id,
        status,
      },
      classes: classes ?? [],
    });
  })(request, {});
}

/**
 * Update a team member (owner only): role, active flag, and display-only
 * profile fields (photo, specialty tags, bio). The owner's own membership and
 * the owner role itself are immutable here — ownership transfer is out of scope.
 */
export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { id } = await ctx.params;
    const { tenantId, user } = await requireTeamMember(request, ['owner']);
    const input = await parseJson(request, teamMemberUpdateSchema);
    const admin = createAdminSupabase();

    const { data: target } = await admin
      .from('team_members')
      .select('id, user_id, role')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (!target) throw ApiError.notFound('Team member not found');
    if (target.role === 'owner' && (input.role !== undefined || input.isActive !== undefined)) {
      throw ApiError.badRequest('Cannot change the owner role or status');
    }

    const patch: TeamMemberUpdate = {};
    if (input.role !== undefined) patch.role = input.role;
    if (input.isActive !== undefined) patch.is_active = input.isActive;
    if (input.profilePhotoUrl !== undefined) patch.profile_photo_url = input.profilePhotoUrl;
    if (input.specialtyTags !== undefined) patch.specialty_tags = input.specialtyTags;
    if (input.bio !== undefined) patch.bio = input.bio;

    const { data, error } = await admin
      .from('team_members')
      .update(patch)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select()
      .single();
    if (error) throw ApiError.unprocessable(error.message);

    await admin.from('audit_log').insert({
      tenant_id: tenantId,
      actor_user_id: user.id,
      action: 'team_member.updated',
      target_table: 'team_members',
      target_id: id,
      changes: input as unknown as Json,
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
