import { PageHeading } from '@/components/ui';
import { ClientProfileForm } from '@/components/client/profile';

export const dynamic = 'force-dynamic';

export default function ClientProfilePage() {
  return (
    <div>
      <PageHeading title="Profile" subtitle="Your account details" />
      <ClientProfileForm />
    </div>
  );
}
