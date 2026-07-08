import { redirect } from 'next/navigation';
import { PageHeading } from '@/components/ui';
import { ProductsManager } from '@/components/admin/products-manager';
import { getTeamMembership } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const membership = await getTeamMembership();
  if (!membership) redirect('/login');

  const canWrite = membership.role === 'owner' || membership.role === 'manager';

  return (
    <div>
      <PageHeading
        title="Products"
        subtitle={
          canWrite
            ? 'Create and manage your courses, plans and services'
            : 'Your catalogue of courses, plans and services'
        }
      />
      <ProductsManager viewerRole={membership.role} />
    </div>
  );
}
