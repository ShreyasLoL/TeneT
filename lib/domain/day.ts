import type { DayKey } from './types';

export const DEFAULT_TZ = 'Asia/Kolkata';
/** Logging before this local hour still counts for the previous day. */
export const DEFAULT_CUTOFF_HOUR = 4;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

export function isDayKey(s: string): boolean {
  if (!DAY_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  return new Date(t).toISOString().slice(0, 10) === s;
}

/** Days since 1970-01-01 (UTC calendar days, no timezone involved). */
export function dayNumber(day: DayKey): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

export function fromDayNumber(n: number): DayKey {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(day: DayKey, n: number): DayKey {
  return fromDayNumber(dayNumber(day) + n);
}

/** a - b in whole days. */
export function diffDays(a: DayKey, b: DayKey): number {
  return dayNumber(a) - dayNumber(b);
}

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(day: DayKey): number {
  const dow = new Date(dayNumber(day) * MS_PER_DAY).getUTCDay(); // 0 = Sunday
  return ((dow + 6) % 7) + 1;
}

/** Monday of the ISO week containing `day`. */
export function weekStart(day: DayKey): DayKey {
  return addDays(day, -(isoWeekday(day) - 1));
}

/**
 * The logical day for an instant: the calendar date in `tz`, after shifting
 * back by `cutoffHour` so late-night activity belongs to the previous day.
 */
export function dayKey(
  now: Date,
  tz: string = DEFAULT_TZ,
  cutoffHour: number = DEFAULT_CUTOFF_HOUR,
): DayKey {
  const shifted = new Date(now.getTime() - cutoffHour * 3_600_000);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(shifted);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
