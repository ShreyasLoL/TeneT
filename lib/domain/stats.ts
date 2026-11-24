import { addDays, diffDays } from './day';
import type { DayKey } from './types';

/**
 * Consecutive sealed nights ending today. If tonight isn't sealed yet the
 * streak is still alive and counts back from yesterday.
 */
export function currentStreak(sealedDays: Iterable<DayKey>, today: DayKey): number {
  const set = new Set(sealedDays);
  let cursor = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export function longestStreak(sealedDays: Iterable<DayKey>): number {
  const sorted = [...new Set(sealedDays)].sort();
  let best = 0;
  let run = 0;
  let prev: DayKey | null = null;
  for (const d of sorted) {
    run = prev !== null && diffDays(d, prev) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/** Share (0-1) of days in [from, to] inclusive that were sealed. */
export function sealRate(sealedDays: Iterable<DayKey>, from: DayKey, to: DayKey): number {
  const total = diffDays(to, from) + 1;
  if (total <= 0) return 0;
  let n = 0;
  for (const d of new Set(sealedDays)) if (d >= from && d <= to) n++;
  return n / total;
}

/** Least-squares line through points. Null if fewer than 2 distinct x. */
export function linearFit(
  points: { x: number; y: number }[],
): { slope: number; intercept: number } | null {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}
