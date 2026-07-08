import { redirect } from 'next/navigation';
import { PageHeading } from '@/components/ui';
import { ClientHealth } from '@/components/client/health';
import { getClientMembership } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function ClientHealthPage() {
  const membership = await getClientMembership();
  if (!membership) redirect('/client-login');

  return (
    <div>
      <PageHeading title="Health & progress" subtitle="Share updates so your coach can track you" />
      <ClientHealth clientId={membership.clientId} />
    </div>
  );
}
