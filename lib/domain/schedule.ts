import { addDays, isoWeekday, weekStart } from './day';
import type { DayKey, DueStatus, SatisfiedOn, Trackable } from './types';

/**
 * Which version of each trackable applies on `day`: the highest version whose
 * effectiveFrom <= day, dropped if it has been archived by then.
 */
export function activeTrackables(all: Trackable[], day: DayKey): Trackable[] {
  const best = new Map<string, Trackable>();
  for (const t of all) {
    if (t.effectiveFrom > day) continue;
    const cur = best.get(t.key);
    if (!cur || t.version > cur.version) best.set(t.key, t);
  }
  return [...best.values()].filter((t) => !t.archivedFrom || t.archivedFrom > day);
}

/**
 * Is a trackable due on `day`?
 * - daily: always required.
 * - weekdays: required on those ISO weekdays, off otherwise (a rest day is not a miss).
 * - n_per_week: optional while there is slack in the week (doing it is a bonus,
 *   skipping it is free); required once the remaining days are only just enough
 *   to hit the weekly quota; optional again once the quota is met.
 */
export function dueStatus(t: Trackable, day: DayKey, satisfiedOn: SatisfiedOn): DueStatus {
  const s = t.schedule;
  switch (s.type) {
    case 'daily':
      return 'required';
    case 'weekdays':
      return s.days.includes(isoWeekday(day)) ? 'required' : 'off';
    case 'n_per_week': {
      const n = Math.min(7, Math.max(1, Math.floor(s.n)));
      let done = 0;
      for (let d = weekStart(day); d < day; d = addDays(d, 1)) {
        if (satisfiedOn(t.key, d)) done++;
      }
      const needed = n - done;
      const remaining = 8 - isoWeekday(day); // days left in the week, including today
      return needed > 0 && needed >= remaining ? 'required' : 'optional';
    }
  }
}
