import { PageHeading } from '@/components/ui';
import { SectionPlaceholder } from '@/components/section-placeholder';

export default function ClientShopPage() {
  return (
    <div>
      <PageHeading title="Shop" subtitle="Programs and plans from your coach" />
      <SectionPlaceholder note="Active products + Razorpay checkout wire to /api/products and /api/orders in the next phase." />
    </div>
  );
}
