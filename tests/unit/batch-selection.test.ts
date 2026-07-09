import { describe, expect, it } from 'vitest';
import { chooseAutoBatch } from '@/lib/batch-selection';

type Batch = Parameters<typeof chooseAutoBatch>[0][number];

function batch(over: Partial<Batch>): Batch {
  return {
    id: over.id ?? crypto.randomUUID(),
    title: over.title ?? 'Batch',
    isRecorded: over.isRecorded ?? false,
    schedule: over.schedule ?? null,
    capacity: over.capacity ?? null,
    enrolledCount: over.enrolledCount ?? 0,
    seatsLeft: over.seatsLeft ?? null,
    instructorName: over.instructorName ?? null,
    isDefault: over.isDefault ?? false,
  };
}

describe('chooseAutoBatch', () => {
  it('prefers the default batch when it has room', () => {
    const def = batch({ isDefault: true, seatsLeft: 3 });
    const other = batch({ seatsLeft: 10 });
    expect(chooseAutoBatch([other, def])?.id).toBe(def.id);
  });

  it('treats unlimited capacity (null) as having room', () => {
    const def = batch({ isDefault: true, seatsLeft: null });
    expect(chooseAutoBatch([def])?.id).toBe(def.id);
  });

  it('falls back to the batch with the most open seats when the default is full', () => {
    const def = batch({ isDefault: true, seatsLeft: 0 });
    const small = batch({ seatsLeft: 1 });
    const big = batch({ seatsLeft: 5 });
    expect(chooseAutoBatch([def, small, big])?.id).toBe(big.id);
  });

  it('returns null when every batch is full', () => {
    expect(
      chooseAutoBatch([batch({ seatsLeft: 0 }), batch({ isDefault: true, seatsLeft: 0 })]),
    ).toBeNull();
  });
});
