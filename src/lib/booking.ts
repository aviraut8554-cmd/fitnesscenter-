/**
 * Pure booking helpers: timezone-aware slot generation and conflict detection.
 *
 * Availability is defined as recurring weekly windows in the tenant's timezone.
 * Concrete bookable slots are derived from those windows for a date range,
 * excluding slots that are in the past / inside the notice window or that clash
 * with existing bookings (respecting a configurable buffer between bookings).
 *
 * These functions are deterministic and dependency-free so they can be unit
 * tested without a database or a running clock.
 */

export interface BookingSettings {
  timezone: string;
  slotMinutes: number;
  bufferMinutes: number;
  minNoticeMinutes: number;
  cancelCutoffMinutes: number;
}

export interface AvailabilityRule {
  weekday: number; // 0=Sunday .. 6=Saturday
  startTime: string; // "HH:MM" or "HH:MM:SS" (tenant-local)
  endTime: string;
}

export interface BusyInterval {
  start: Date;
  end: Date;
}

export interface Slot {
  start: string; // ISO 8601 (UTC)
  end: string; // ISO 8601 (UTC)
}

/** Minutes since midnight for a "HH:MM[:SS]" time string. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':');
  const hours = Number(h);
  const minutes = Number(m);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    throw new Error(`Invalid time: ${time}`);
  }
  return hours * 60 + minutes;
}

/**
 * Offset (local − UTC) in minutes for `timeZone` at the given instant.
 * Positive east of UTC (e.g. +330 for Asia/Kolkata).
 */
export function tzOffsetMinutes(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(instant);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const hour = map.hour === '24' ? 0 : Number(map.hour);
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return (asUtc - instant.getTime()) / 60000;
}

/** Convert a tenant-local wall-clock time to the corresponding UTC instant. */
export function zonedWallTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  minutesOfDay: number,
  timeZone: string,
): Date {
  const hour = Math.floor(minutesOfDay / 60);
  const minute = minutesOfDay % 60;
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const offset = tzOffsetMinutes(new Date(guess), timeZone);
  let utc = guess - offset * 60000;
  // One refinement pass handles a DST boundary between the guess and result.
  const offset2 = tzOffsetMinutes(new Date(utc), timeZone);
  if (offset2 !== offset) utc = guess - offset2 * 60000;
  return new Date(utc);
}

/** Tenant-local calendar parts for an instant. */
function localParts(instant: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  weekday: number;
} {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) map[p.type] = p.value;
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: weekdays.indexOf(map.weekday),
  };
}

/**
 * True when [start, end) clashes with any busy interval once each busy interval
 * is padded by `bufferMinutes` on both sides.
 */
export function hasConflict(
  start: Date,
  end: Date,
  busy: BusyInterval[],
  bufferMinutes: number,
): boolean {
  const buffer = bufferMinutes * 60000;
  const s = start.getTime();
  const e = end.getTime();
  return busy.some((b) => s < b.end.getTime() + buffer && e > b.start.getTime() - buffer);
}

export interface GenerateSlotsInput {
  rules: AvailabilityRule[];
  settings: BookingSettings;
  from: Date; // range start (inclusive), any instant
  to: Date; // range end (exclusive)
  busy?: BusyInterval[];
  now?: Date; // defaults to new Date()
}

/**
 * Generate bookable slots in [from, to) from a coach's weekly availability,
 * excluding slots before `now + minNotice` and slots clashing with `busy`.
 * Overlapping availability windows never produce duplicate slots (deduped).
 */
export function generateSlots(input: GenerateSlotsInput): Slot[] {
  const { rules, settings, from, to } = input;
  const busy = input.busy ?? [];
  const now = input.now ?? new Date();
  const { timezone, slotMinutes, bufferMinutes, minNoticeMinutes } = settings;
  const earliest = now.getTime() + minNoticeMinutes * 60000;

  const startLocal = localParts(from, timezone);
  const endLocal = localParts(to, timezone);
  // Iterate calendar dates in the tenant tz via a UTC date cursor (y/m/d only).
  let cursor = Date.UTC(startLocal.year, startLocal.month - 1, startLocal.day);
  const last = Date.UTC(endLocal.year, endLocal.month - 1, endLocal.day);

  const seen = new Set<number>();
  const slots: Slot[] = [];

  while (cursor <= last) {
    const d = new Date(cursor);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const weekday = d.getUTCDay();

    for (const rule of rules) {
      if (rule.weekday !== weekday) continue;
      const windowStart = timeToMinutes(rule.startTime);
      const windowEnd = timeToMinutes(rule.endTime);
      for (let m = windowStart; m + slotMinutes <= windowEnd; m += slotMinutes) {
        const slotStart = zonedWallTimeToUtc(year, month, day, m, timezone);
        const ts = slotStart.getTime();
        if (ts < from.getTime() || ts >= to.getTime()) continue;
        if (ts < earliest) continue;
        if (seen.has(ts)) continue;
        const slotEnd = new Date(ts + slotMinutes * 60000);
        if (hasConflict(slotStart, slotEnd, busy, bufferMinutes)) continue;
        seen.add(ts);
        slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString() });
      }
    }
    cursor += 86400000;
  }

  slots.sort((a, b) => a.start.localeCompare(b.start));
  return slots;
}

/**
 * Whether a booking starting at `slotStart` can still be cancelled/rescheduled
 * given the tenant's cancel cutoff (minutes before the slot).
 */
export function withinCancelWindow(
  slotStart: Date,
  cancelCutoffMinutes: number,
  now: Date = new Date(),
): boolean {
  return slotStart.getTime() - now.getTime() >= cancelCutoffMinutes * 60000;
}

/** Whether a requested slot start satisfies the minimum-notice policy. */
export function satisfiesMinNotice(
  slotStart: Date,
  minNoticeMinutes: number,
  now: Date = new Date(),
): boolean {
  return slotStart.getTime() - now.getTime() >= minNoticeMinutes * 60000;
}
