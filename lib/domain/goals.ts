import { addDays, dayNumber, diffDays } from './day';
import { linearFit } from './stats';
import type { DayKey } from './types';

export type PaceStatus = 'achieved' | 'on_track' | 'behind' | 'stalled' | 'no_data';

export type PaceInput = {
  /** One value per logged day (e.g. bodyweight, bench PR, rank score). */
  series: { day: DayKey; value: number }[];
  target: number;
  direction: 'up' | 'down';
  deadline?: DayKey;
  /** Only the most recent N days of data shape the trend. */
  windowDays?: number;
};

export type PaceResult = {
  status: PaceStatus;
  /** Projected day the target is reached at the current pace. */
  etaDay?: DayKey;
  /** Trend, in value units per day. */
  slopePerDay?: number;
};

/** Where am I vs a measurable target, and when will I get there at this pace? */
export function projectPace(input: PaceInput): PaceResult {
  const { target, direction, deadline, windowDays = 28 } = input;
  const sorted = [...input.series].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  if (sorted.length === 0) return { status: 'no_data' };

  const last = sorted[sorted.length - 1];
  const sign = direction === 'up' ? 1 : -1;
  if ((last.value - target) * sign >= 0) return { status: 'achieved' };

  const windowed = sorted.filter((p) => diffDays(last.day, p.day) <= windowDays);
  const fit = linearFit(windowed.map((p) => ({ x: dayNumber(p.day), y: p.value })));
  if (!fit) return { status: 'no_data' };

  const progress = fit.slope * sign;
  if (progress <= 1e-9) return { status: 'stalled', slopePerDay: fit.slope };

  const fittedNow = fit.intercept + fit.slope * dayNumber(last.day);
  const remaining = (target - fittedNow) * sign;
  const days = Math.max(0, Math.ceil(remaining / progress));
  const etaDay = addDays(last.day, days);
  const status: PaceStatus = deadline && etaDay > deadline ? 'behind' : 'on_track';
  return { status, etaDay, slopePerDay: fit.slope };
}
