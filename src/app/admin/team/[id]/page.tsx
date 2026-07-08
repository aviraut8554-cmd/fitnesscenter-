import { redirect } from 'next/navigation';
import { TeamMemberProfile } from '@/components/admin/team-member-profile';
import { getTeamMembership } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function TeamMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const membership = await getTeamMembership();
  if (!membership) redirect('/login');
  const { id } = await params;
  return <TeamMemberProfile memberId={id} viewerRole={membership.role} />;
}
