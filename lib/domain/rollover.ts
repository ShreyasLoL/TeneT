import { DEFAULT_CUTOFF_HOUR, DEFAULT_TZ, dayKey } from './day';
import type { DayKey } from './types';

export function didRollOver(
  previousDay: DayKey,
  now: Date,
  tz: string = DEFAULT_TZ,
  cutoffHour: number = DEFAULT_CUTOFF_HOUR,
): { rolled: boolean; nextDay: DayKey } {
  const nextDay = dayKey(now, tz, cutoffHour);
  return { rolled: nextDay !== previousDay, nextDay };
}

/**
 * Milliseconds until the next logical day boundary (e.g. 04:00 IST),
 * evaluated strictly by probing `dayKey()` so DST/offset shifts stay exact.
 */
export function msUntilNextLogicalDay(
  now: Date,
  tz: string = DEFAULT_TZ,
  cutoffHour: number = DEFAULT_CUTOFF_HOUR,
): number {
  const startDay = dayKey(now, tz, cutoffHour);
  let lo = 1_000;
  let hi = 25 * 3_600_000;
  while (dayKey(new Date(now.getTime() + hi), tz, cutoffHour) === startDay) {
    hi += 3_600_000;
  }
  while (hi - lo > 1_000) {
    const mid = Math.floor((lo + hi) / 2);
    if (dayKey(new Date(now.getTime() + mid), tz, cutoffHour) === startDay) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return hi;
}
