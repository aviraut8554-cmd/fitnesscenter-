import { PageHeading } from '@/components/ui';
import { ClientsList } from '@/components/admin/clients-list';

export const dynamic = 'force-dynamic';

export default function ClientsPage() {
  return (
    <div>
      <PageHeading title="Clients" subtitle="Your client roster and health forms" />
      <ClientsList />
    </div>
  );
}
