import { redirect } from 'next/navigation';
import { PageHeading } from '@/components/ui';
import { AutomationsManager } from '@/components/admin/automations-manager';
import { getTeamMembership } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AutomationsPage() {
  const membership = await getTeamMembership();
  if (!membership) redirect('/login');
  if (membership.role !== 'owner' && membership.role !== 'manager') redirect('/admin');

  return (
    <div>
      <PageHeading
        title="Automations"
        subtitle="Welcome messages, payment receipts, and daily class/booking/renewal reminders"
      />
      <AutomationsManager canManageEmail={membership.role === 'owner'} />
    </div>
  );
}
