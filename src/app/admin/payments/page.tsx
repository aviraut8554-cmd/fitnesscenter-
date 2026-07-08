import { PageHeading } from '@/components/ui';
import { SectionPlaceholder } from '@/components/section-placeholder';

export default function PaymentsPage() {
  return (
    <div>
      <PageHeading title="Payments" subtitle="Orders, invoices and revenue" />
      <SectionPlaceholder note="Orders, invoices and the revenue summary wire to /api/orders and /api/revenue in the next phase." />
    </div>
  );
}
