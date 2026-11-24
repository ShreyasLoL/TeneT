import { effectiveRule, evaluate } from './rules';
import { dueStatus } from './schedule';
import type { DayKey, DueStatus, SatisfiedOn, Trackable } from './types';

export type TrackableResult = {
  key: string;
  version: number;
  status: DueStatus;
  satisfied: boolean;
  weight: number;
  scored: boolean;
};

/** Evaluate every active trackable for one night. `entries` maps key -> value. */
export function evaluateDay(
  day: DayKey,
  active: Trackable[],
  entries: Record<string, unknown>,
  satisfiedOn: SatisfiedOn,
): TrackableResult[] {
  return active.map((t) => {
    const value = entries[t.key];
    return {
      key: t.key,
      version: t.version,
      status: dueStatus(t, day, satisfiedOn),
      satisfied: value !== undefined && evaluate(effectiveRule(t), value),
      weight: t.weight,
      scored: t.scored,
    };
  });
}

/**
 * 0-100: weighted share of counted trackables that were satisfied.
 * Counted = scored AND (required, or optional-and-done). Null when nothing counted.
 */
export function nightScore(results: TrackableResult[]): number | null {
  let num = 0;
  let den = 0;
  for (const r of results) {
    if (!r.scored || r.status === 'off') continue;
    if (r.status === 'optional' && !r.satisfied) continue;
    den += r.weight;
    if (r.satisfied) num += r.weight;
  }
  return den === 0 ? null : Math.round((100 * num) / den);
}
