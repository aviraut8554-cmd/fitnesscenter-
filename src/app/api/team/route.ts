import { requireTeamMember } from '@/lib/auth';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { teamInviteSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** List team members of the caller's tenant. */
export const GET = handleRoute(async (request) => {
  const { supabase, tenantId } = await requireTeamMember(request);

  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  if (error) throw ApiError.unprocessable(error.message);
  return jsonOk({ teamMembers: data });
});

/**
 * Add a team member (owner only). Creates the auth user then the membership
 * row via the service role. Seat limits per plan tier are enforced here,
 * server-side.
 */
export const POST = handleRoute(async (request) => {
  const { tenantId, user } = await requireTeamMember(request, ['owner']);
  const input = await parseJson(request, teamInviteSchema);
  const admin = createAdminSupabase();

  const { count, error: countError } = await admin
    .from('team_members')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  if (countError) throw ApiError.unprocessable(countError.message);

  const { data: tenant } = await admin
    .from('tenants')
    .select('plan_id, plans(max_team_members)')
    .eq('id', tenantId)
    .maybeSingle();
  const maxMembers = tenant?.plans?.max_team_members ?? null;
  if (maxMembers !== null && count !== null && count >= maxMembers) {
    throw ApiError.forbidden(`Plan limit reached: max ${maxMembers} team members`);
  }

  const created = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name ?? input.email, role: input.role },
  });
  if (created.error || !created.data.user) {
    if (created.error?.message?.toLowerCase().includes('already')) {
      throw ApiError.conflict('An account with this email already exists');
    }
    throw ApiError.badRequest(created.error?.message ?? 'Could not create user');
  }
  const newUserId = created.data.user.id;

  const member = await admin
    .from('team_members')
    .insert({ tenant_id: tenantId, user_id: newUserId, role: input.role })
    .select()
    .single();

  if (member.error) {
    await admin.auth.admin.deleteUser(newUserId);
    if (member.error.code === '23505') {
      throw ApiError.conflict('This user is already a team member');
    }
    throw ApiError.unprocessable(member.error.message);
  }

  await admin.from('audit_log').insert({
    tenant_id: tenantId,
    actor_user_id: user.id,
    action: 'team_member.added',
    target_table: 'team_members',
    target_id: member.data.id,
    changes: { role: input.role, email: input.email },
  });

  return jsonOk({ teamMember: member.data }, 201);
});
