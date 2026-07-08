import { redirect } from 'next/navigation';
import { EmptyState, PageHeading } from '@/components/ui';
import { PaymentsView } from '@/components/admin/payments-view';
import { getTeamMembership } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function PaymentsPage() {
  const membership = await getTeamMembership();
  if (!membership) redirect('/login');

  return (
    <div>
      <PageHeading title="Payments" subtitle="Orders, invoices and revenue" />
      {membership.role === 'owner' ? (
        <PaymentsView />
      ) : (
        <EmptyState
          title="Owner access only"
          hint="Payment and revenue data is visible to the account owner only."
        />
      )}
    </div>
  );
}
