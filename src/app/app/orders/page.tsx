import { PageHeading } from '@/components/ui';
import { SectionPlaceholder } from '@/components/section-placeholder';

export default function ClientOrdersPage() {
  return (
    <div>
      <PageHeading title="My orders" subtitle="Payments and invoices" />
      <SectionPlaceholder note="Order history and invoices wire to /api/orders in the next phase." />
    </div>
  );
}
