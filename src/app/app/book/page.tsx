import { PageHeading } from '@/components/ui';
import { BookConsultation } from '@/components/client/book-consultation';

export const dynamic = 'force-dynamic';

export default function ClientBookPage() {
  return (
    <div>
      <PageHeading title="Book" subtitle="Reserve a consultation with your coach" />
      <BookConsultation />
    </div>
  );
}
