import { redirect } from 'next/navigation';
import { EmptyState, PageHeading } from '@/components/ui';
import { SettingsManager } from '@/components/admin/settings-manager';
import { getTeamMembership } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const membership = await getTeamMembership();
  if (!membership) redirect('/login');

  return (
    <div>
      <PageHeading title="Settings" subtitle="Business profile, branding and plan" />
      {membership.role === 'owner' ? (
        <SettingsManager />
      ) : (
        <EmptyState
          title="Owner access only"
          hint="Business profile and branding are managed by the account owner."
        />
      )}
    </div>
  );
}
