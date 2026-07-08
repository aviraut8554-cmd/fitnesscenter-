import { PageHeading } from '@/components/ui';
import { SectionPlaceholder } from '@/components/section-placeholder';

export default function ClientsPage() {
  return (
    <div>
      <PageHeading title="Clients" subtitle="Your client roster and health forms" />
      <SectionPlaceholder note="Client list, detail and health-form views wire to /api/clients in the next phase." />
    </div>
  );
}
