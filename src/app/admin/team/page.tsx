import { PageHeading } from '@/components/ui';
import { SectionPlaceholder } from '@/components/section-placeholder';

export default function TeamPage() {
  return (
    <div>
      <PageHeading title="Team" subtitle="Invite and manage staff" />
      <SectionPlaceholder note="Team roster and invites wire to /api/team in the next phase." />
    </div>
  );
}
