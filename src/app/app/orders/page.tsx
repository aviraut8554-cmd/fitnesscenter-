import { PageHeading } from '@/components/ui';
import { ClientOrders } from '@/components/client/orders';

export const dynamic = 'force-dynamic';

export default function ClientOrdersPage() {
  return (
    <div>
      <PageHeading title="My orders" subtitle="Payments and invoices" />
      <ClientOrders />
    </div>
  );
}
