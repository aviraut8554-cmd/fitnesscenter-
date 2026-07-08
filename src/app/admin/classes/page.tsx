import { redirect } from 'next/navigation';
import { PageHeading } from '@/components/ui';
import { ClassesManager } from '@/components/admin/classes-manager';
import { getTeamMembership } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function ClassesPage() {
  const membership = await getTeamMembership();
  if (!membership) redirect('/login');

  return (
    <div>
      <PageHeading
        title="Classes"
        subtitle="Schedule batches, manage rosters and take attendance"
      />
      <ClassesManager viewerRole={membership.role} />
    </div>
  );
}
