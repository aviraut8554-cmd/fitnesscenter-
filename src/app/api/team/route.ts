import { requireTeamMember } from '@/lib/auth';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { teamInviteSchema } from '@/lib/validation';
import { dispatch } from '@/lib/notifier';

export const dynamic = 'force-dynamic';

/** Origin the member returns to after setting their password. */
function appOrigin(request: Request): string {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https';
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return new URL(request.url).origin;
}

/**
 * List team members of the caller's tenant, enriched with each member's email
 * (resolved via the service role — the `team_members` row only stores `user_id`),
 * a derived status badge, and how many classes they instruct.
 */
export const GET = handleRoute(async (request) => {
  const { supabase, tenantId, user } = await requireTeamMember(request);

  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  if (error) throw ApiError.unprocessable(error.message);

  const admin = createAdminSupabase();

  // Active classes per instructor, tallied once for the whole tenant.
  const { data: classRows } = await admin
    .from('classes')
    .select('instructor_id')
    .eq('tenant_id', tenantId);
  const classCounts = new Map<string, number>();
  for (const row of classRows ?? []) {
    if (row.instructor_id) {
      classCounts.set(row.instructor_id, (classCounts.get(row.instructor_id) ?? 0) + 1);
    }
  }

  const enriched = await Promise.all(
    (data ?? []).map(async (member) => {
      const { data: authUser } = await admin.auth.admin.getUserById(member.user_id);
      const hasSignedIn = Boolean(authUser.user?.last_sign_in_at);
      const status: 'active' | 'invited' | 'inactive' = !member.is_active
        ? 'inactive'
        : hasSignedIn
          ? 'active'
          : 'invited';
      return {
        ...member,
        email: authUser.user?.email ?? null,
        name: (authUser.user?.user_metadata?.name as string | undefined) ?? null,
        isSelf: member.user_id === user.id,
        status,
        classCount: classCounts.get(member.id) ?? 0,
      };
    }),
  );

  return jsonOk({ teamMembers: enriched });
});

/**
 * Invite a team member (owner only). Instead of setting a temporary password,
 * we generate a Supabase invite link and email it so the member sets their own
 * password. The link is also returned so the owner can share it manually when
 * no email provider is configured. Seat limits per plan are enforced
 * here, server-side.
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
    .select('name, plan_id, plans(max_team_members)')
    .eq('id', tenantId)
    .maybeSingle();
  const maxMembers = tenant?.plans?.max_team_members ?? null;
  if (maxMembers !== null && count !== null && count >= maxMembers) {
    throw ApiError.forbidden(`Plan limit reached: max ${maxMembers} team members`);
  }

  const redirectTo = `${appOrigin(request)}/set-password`;
  const link = await admin.auth.admin.generateLink({
    type: 'invite',
    email: input.email,
    options: { data: { name: input.name, role: input.role }, redirectTo },
  });
  if (link.error || !link.data.user) {
    if (link.error?.message?.toLowerCase().includes('already')) {
      throw ApiError.conflict('An account with this email already exists');
    }
    throw ApiError.badRequest(link.error?.message ?? 'Could not create invite');
  }
  const newUserId = link.data.user.id;
  const inviteLink = link.data.properties?.action_link ?? null;

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

  const brand = tenant?.name ?? 'the team';
  let emailSent = false;
  if (inviteLink) {
    try {
      const result = await dispatch(
        admin,
        tenantId,
        {
          channel: 'email',
          recipient: input.email,
          subject: `You've been invited to join ${brand}`,
          body:
            `Hi ${input.name},\n\nYou've been added to ${brand} as a ${input.role}. ` +
            `Set your password to get started:\n\n${inviteLink}\n\nThis link expires for security.`,
        },
        { allowLogFallback: false },
      );
      emailSent = result.ok;
    } catch (error) {
      console.error('team invite email failed:', error);
    }
  }

  await admin.from('audit_log').insert({
    tenant_id: tenantId,
    actor_user_id: user.id,
    action: 'team_member.invited',
    target_table: 'team_members',
    target_id: member.data.id,
    changes: { role: input.role, email: input.email },
  });

  return jsonOk(
    {
      teamMember: member.data,
      inviteLink,
      emailSent,
    },
    201,
  );
});
