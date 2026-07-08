import { PageHeading } from '@/components/ui';
import { MyClasses } from '@/components/client/my-classes';

export const dynamic = 'force-dynamic';

export default function ClientClassesPage() {
  return (
    <div>
      <PageHeading title="Classes" subtitle="Your live sessions and recorded courses" />
      <MyClasses />
    </div>
  );
}
