import { PageHeading } from '@/components/ui';
import { SectionPlaceholder } from '@/components/section-placeholder';

export default function ClientHealthPage() {
  return (
    <div>
      <PageHeading title="Health form" subtitle="Your intake and progress details" />
      <SectionPlaceholder note="Versioned health-form submission wires to /api/clients/[id]/health-forms in the next phase." />
    </div>
  );
}
