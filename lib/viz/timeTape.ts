import type { ApiSealedDay } from '@/lib/api/types';
import { addDays, diffDays } from '@/lib/domain/day';
import type { DayKey } from '@/lib/domain/types';

/**
 * Symmetric fisheye warp for TimeTape ticks around cursor delta `d` (in days).
 * `x(d) = sign(d) * k * log1p(|d| / s)`
 */
export function tapeOffset(d: number, k: number = 110, s: number = 3.5): number {
  if (d === 0) return 0;
  const sign = d < 0 ? -1 : 1;
  return sign * k * Math.log1p(Math.abs(d) / s);
}

export function inverseTapeOffset(x: number, k: number = 110, s: number = 3.5): number {
  if (x === 0) return 0;
  const sign = x < 0 ? -1 : 1;
  return sign * s * Math.expm1(Math.abs(x) / k);
}

/**
 * Continuous emergence factor in [0, 1] for ring `ringIndex` when scrubbing at `cursorIndex`.
 * Rings with `ringIndex >= cursorIndex` are emerged (1); older rings behind the cursor
 * smoothly re-absorb into the singularity (`0`).
 */
export function ringEmergence(ringIndex: number, cursorIndex: number, feather: number = 0.85): number {
  const delta = ringIndex - cursorIndex + feather;
  if (delta <= 0) return 0;
  if (delta >= feather) return 1;
  const t = delta / feather;
  return t * t * (3 - 2 * t);
}

/**
 * Pure deterministic orbital phase as a function of `(cursorOffsetDays, elapsedSec, slotIndex)`.
 * Guarantees palindrome scrub symmetry: scrubbing forward `+N` days and backward `-N` days
 * at a given clock instant yields the exact identical phase.
 */
export function deterministicScrubState(
  cursorOffsetDays: number,
  elapsedSec: number,
  ringCount: number,
): { phases: Float64Array; emergences: Float64Array } {
  const phases = new Float64Array(16);
  for (let i = 0; i < 16; i++) {
    const omega0 = 0.28 + (i % 3) * 0.08;
    phases[i] = (elapsedSec + cursorOffsetDays * 0.65) * omega0;
  }

  const emergences = new Float64Array(ringCount);
  for (let r = 0; r < ringCount; r++) {
    emergences[r] = ringEmergence(r, cursorOffsetDays);
  }
  return { phases, emergences };
}

export type VisibleTapeTick = {
  day: DayKey;
  delta: number;
  xPx: number;
  score: number | null;
  isVoid: boolean;
};

export function formatAriaDay(
  day: DayKey,
  today: DayKey,
  score: number | null | undefined,
): string {
  const [y, m, d] = day.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const month = utc.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toLowerCase();
  const ago = Math.max(0, diffDays(today, day));
  const scorePart = score === null || score === undefined ? 'void' : `score ${score}`;
  return `${d} ${month}, ${scorePart}, ${ago} nights ago`;
}

export function buildVisibleTapeTicks(
  cursor: DayKey,
  from: DayKey,
  to: DayKey,
  sealedByDay: ReadonlyMap<DayKey, ApiSealedDay>,
): VisibleTapeTick[] {
  const out: VisibleTapeTick[] = [];
  for (let offset = -36; offset <= 36; offset++) {
    const day = addDays(cursor, offset);
    if (day < from || day > to) continue;
    const sealed = sealedByDay.get(day);
    out.push({
      day,
      delta: offset,
      xPx: tapeOffset(offset, 92, 3.5),
      score: sealed ? sealed.score : null,
      isVoid: !sealed,
    });
  }
  return out;
}
