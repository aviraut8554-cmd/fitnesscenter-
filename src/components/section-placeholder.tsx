import { Card } from '@/components/ui';

/**
 * Placeholder for sections whose backend exists (Phase 1/2) but whose UI is
 * wired in the next frontend phase. Distinct from `ComingSoon`, which is for
 * modules with no backend yet.
 */
export function SectionPlaceholder({ note }: { note: string }) {
  return (
    <Card className="border-dashed">
      <p className="text-sm text-ink-500">{note}</p>
    </Card>
  );
}
