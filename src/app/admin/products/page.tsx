import { PageHeading } from '@/components/ui';
import { SectionPlaceholder } from '@/components/section-placeholder';

export default function ProductsPage() {
  return (
    <div>
      <PageHeading title="Products" subtitle="Courses, plans and services" />
      <SectionPlaceholder note="Product CRUD wires to /api/products in the next phase." />
    </div>
  );
}
