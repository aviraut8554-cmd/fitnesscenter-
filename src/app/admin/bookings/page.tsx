import { redirect } from 'next/navigation';
import { PageHeading } from '@/components/ui';
import { AvailabilityManager } from '@/components/admin/availability-manager';
import { BookingsManager } from '@/components/admin/bookings-manager';
import { getTeamMembership } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function BookingsPage() {
  const membership = await getTeamMembership();
  if (!membership) redirect('/login');

  const canManage = membership.role === 'owner' || membership.role === 'manager';

  return (
    <div className="space-y-10">
      <div>
        <PageHeading
          title="Bookings"
          subtitle="Consultations booked by you and your clients"
        />
        <BookingsManager viewerRole={membership.role} />
      </div>

      {canManage ? (
        <div>
          <PageHeading
            title="Availability"
            subtitle="Set each coach’s weekly windows and your booking policy"
          />
          <AvailabilityManager />
        </div>
      ) : null}
    </div>
  );
}
