import type { DayKey, SatisfiedOn } from './types';

export type DayResultRecord = {
  day: DayKey;
  results: ReadonlyArray<{ key: string; satisfied: boolean }>;
};

/**
 * Build a `SatisfiedOn` lookup from sealed day records (`days[].results`),
 * matching server-side `decide()` semantics in `commands.ts`.
 */
export function satisfiedOnFromDays(days: ReadonlyArray<DayResultRecord>): SatisfiedOn {
  const byDay = new Map<DayKey, Map<string, boolean>>();
  for (const d of days) {
    const map = new Map<string, boolean>();
    for (const r of d.results) {
      map.set(r.key, r.satisfied);
    }
    byDay.set(d.day, map);
  }
  return (key: string, day: DayKey) => byDay.get(day)?.get(key) ?? false;
}
