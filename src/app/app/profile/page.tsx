import { PageHeading } from '@/components/ui';
import { SectionPlaceholder } from '@/components/section-placeholder';

export default function ClientProfilePage() {
  return (
    <div>
      <PageHeading title="Profile" subtitle="Your account details" />
      <SectionPlaceholder note="Editable profile and notification settings land in a later phase." />
    </div>
  );
}
