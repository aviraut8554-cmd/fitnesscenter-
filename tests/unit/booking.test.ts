import { describe, expect, it } from 'vitest';
import {
  generateSlots,
  hasConflict,
  satisfiesMinNotice,
  timeToMinutes,
  tzOffsetMinutes,
  withinCancelWindow,
  zonedWallTimeToUtc,
  type AvailabilityRule,
  type BookingSettings,
} from '@/lib/booking';

const IST = 'Asia/Kolkata';
const NY = 'America/New_York';

const settings = (over: Partial<BookingSettings> = {}): BookingSettings => ({
  timezone: IST,
  slotMinutes: 60,
  bufferMinutes: 0,
  minNoticeMinutes: 0,
  cancelCutoffMinutes: 720,
  ...over,
});

// 2026-01-05 is a Monday (weekday 1); 2026-07-06 is also a Monday.
const mondayRule = (over: Partial<AvailabilityRule> = {}): AvailabilityRule => ({
  weekday: 1,
  startTime: '09:00',
  endTime: '12:00',
  ...over,
});

describe('timeToMinutes', () => {
  it('parses HH:MM and HH:MM:SS', () => {
    expect(timeToMinutes('09:00')).toBe(540);
    expect(timeToMinutes('12:30:00')).toBe(750);
    expect(timeToMinutes('00:00')).toBe(0);
  });
});

describe('tzOffsetMinutes', () => {
  it('is +330 for Asia/Kolkata (no DST)', () => {
    expect(tzOffsetMinutes(new Date('2026-01-05T00:00:00Z'), IST)).toBe(330);
    expect(tzOffsetMinutes(new Date('2026-07-05T00:00:00Z'), IST)).toBe(330);
  });

  it('reflects DST for America/New_York', () => {
    expect(tzOffsetMinutes(new Date('2026-01-05T12:00:00Z'), NY)).toBe(-300); // EST
    expect(tzOffsetMinutes(new Date('2026-07-05T12:00:00Z'), NY)).toBe(-240); // EDT
  });
});

describe('zonedWallTimeToUtc', () => {
  it('converts IST wall time to UTC', () => {
    // 09:00 IST == 03:30 UTC
    expect(zonedWallTimeToUtc(2026, 1, 5, 540, IST).toISOString()).toBe('2026-01-05T03:30:00.000Z');
  });

  it('handles DST for New York across seasons', () => {
    // 09:00 EST (winter) -> 14:00 UTC; 09:00 EDT (summer) -> 13:00 UTC
    expect(zonedWallTimeToUtc(2026, 1, 5, 540, NY).toISOString()).toBe('2026-01-05T14:00:00.000Z');
    expect(zonedWallTimeToUtc(2026, 7, 6, 540, NY).toISOString()).toBe('2026-07-06T13:00:00.000Z');
  });
});

describe('hasConflict', () => {
  const busy = [
    { start: new Date('2026-01-05T04:00:00Z'), end: new Date('2026-01-05T05:00:00Z') },
  ];

  it('detects direct overlap', () => {
    const s = new Date('2026-01-05T04:30:00Z');
    const e = new Date('2026-01-05T05:30:00Z');
    expect(hasConflict(s, e, busy, 0)).toBe(true);
  });

  it('allows an adjacent slot with no buffer', () => {
    const s = new Date('2026-01-05T05:00:00Z');
    const e = new Date('2026-01-05T06:00:00Z');
    expect(hasConflict(s, e, busy, 0)).toBe(false);
  });

  it('rejects an adjacent slot when a buffer is required', () => {
    const s = new Date('2026-01-05T05:00:00Z');
    const e = new Date('2026-01-05T06:00:00Z');
    expect(hasConflict(s, e, busy, 15)).toBe(true);
  });
});

describe('generateSlots', () => {
  const from = new Date('2026-01-05T00:00:00Z');
  const to = new Date('2026-01-06T00:00:00Z');
  const past = new Date('2020-01-01T00:00:00Z');

  it('produces aligned slots within the availability window (IST)', () => {
    const slots = generateSlots({
      rules: [mondayRule()],
      settings: settings(),
      from,
      to,
      now: past,
    });
    expect(slots.map((s) => s.start)).toEqual([
      '2026-01-05T03:30:00.000Z', // 09:00 IST
      '2026-01-05T04:30:00.000Z', // 10:00 IST
      '2026-01-05T05:30:00.000Z', // 11:00 IST
    ]);
  });

  it('excludes slots that clash with existing bookings (+buffer)', () => {
    const busy = [
      { start: new Date('2026-01-05T04:30:00Z'), end: new Date('2026-01-05T05:30:00Z') },
    ];
    const slots = generateSlots({
      rules: [mondayRule()],
      settings: settings({ bufferMinutes: 15 }),
      from,
      to,
      busy,
      now: past,
    });
    // 10:00 IST (04:30Z) is taken; buffer knocks out the 09:00 and 11:00 neighbours too.
    expect(slots).toHaveLength(0);
  });

  it('excludes slots inside the minimum-notice window', () => {
    // now = 08:30 IST (03:00Z); 2h notice -> earliest 05:00Z, so only 11:00 IST
    // (05:30Z) survives (09:00 & 10:00 fall inside the notice window).
    const now = new Date('2026-01-05T03:00:00Z');
    const slots = generateSlots({
      rules: [mondayRule()],
      settings: settings({ minNoticeMinutes: 120 }),
      from,
      to,
      now,
    });
    expect(slots.map((s) => s.start)).toEqual(['2026-01-05T05:30:00.000Z']);
  });

  it('dedupes overlapping availability windows', () => {
    const slots = generateSlots({
      rules: [mondayRule(), mondayRule({ startTime: '10:00', endTime: '12:00' })],
      settings: settings(),
      from,
      to,
      now: past,
    });
    expect(slots).toHaveLength(3); // no duplicate 10:00/11:00 slots
  });

  it('returns nothing when no rule matches the weekday', () => {
    const slots = generateSlots({
      rules: [mondayRule({ weekday: 3 })], // Wednesday
      settings: settings(),
      from,
      to,
      now: past,
    });
    expect(slots).toHaveLength(0);
  });
});

describe('policy helpers', () => {
  const now = new Date('2026-01-05T00:00:00Z');

  it('withinCancelWindow is false once inside the cutoff', () => {
    expect(withinCancelWindow(new Date('2026-01-05T13:00:00Z'), 720, now)).toBe(true); // 13h out
    expect(withinCancelWindow(new Date('2026-01-05T06:00:00Z'), 720, now)).toBe(false); // 6h out
  });

  it('satisfiesMinNotice enforces lead time', () => {
    expect(satisfiesMinNotice(new Date('2026-01-05T03:00:00Z'), 120, now)).toBe(true);
    expect(satisfiesMinNotice(new Date('2026-01-05T01:00:00Z'), 120, now)).toBe(false);
  });
});
