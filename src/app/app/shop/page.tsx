import { PageHeading } from '@/components/ui';
import { ClientShop } from '@/components/client/shop';

export const dynamic = 'force-dynamic';

export default function ClientShopPage() {
  return (
    <div>
      <PageHeading title="Shop" subtitle="Programs and plans from your coach" />
      <ClientShop />
    </div>
  );
}
