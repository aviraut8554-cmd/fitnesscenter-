import { describe, expect, it } from 'vitest';
import {
  isSessionLive,
  LIVE_LINK_GRACE_MINUTES,
  LIVE_LINK_LEAD_MINUTES,
} from '@/lib/class-service';

describe('isSessionLive', () => {
  const start = '2026-06-01T10:00:00Z';
  const end = '2026-06-01T11:00:00Z';

  it('is false well before the lead window', () => {
    expect(isSessionLive(start, end, new Date('2026-06-01T09:00:00Z'))).toBe(false);
  });

  it('is true within the lead window before start', () => {
    const justInside = new Date(`2026-06-01T10:00:00Z`);
    justInside.setUTCMinutes(justInside.getUTCMinutes() - (LIVE_LINK_LEAD_MINUTES - 1));
    expect(isSessionLive(start, end, justInside)).toBe(true);
  });

  it('is true during the session', () => {
    expect(isSessionLive(start, end, new Date('2026-06-01T10:30:00Z'))).toBe(true);
  });

  it('is true within the grace window after end but false past it', () => {
    const inGrace = new Date('2026-06-01T11:00:00Z');
    inGrace.setUTCMinutes(inGrace.getUTCMinutes() + (LIVE_LINK_GRACE_MINUTES - 1));
    expect(isSessionLive(start, end, inGrace)).toBe(true);

    expect(isSessionLive(start, end, new Date('2026-06-01T12:00:00Z'))).toBe(false);
  });
});
