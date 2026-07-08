import { redirect } from 'next/navigation';
import { PageHeading } from '@/components/ui';
import { TeamManager } from '@/components/admin/team-manager';
import { getTeamMembership } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const membership = await getTeamMembership();
  if (!membership) redirect('/login');

  return (
    <div>
      <PageHeading
        title="Team"
        subtitle={
          membership.role === 'owner'
            ? 'Invite staff and manage their roles'
            : 'Your team roster'
        }
      />
      <TeamManager viewerRole={membership.role} />
    </div>
  );
}
