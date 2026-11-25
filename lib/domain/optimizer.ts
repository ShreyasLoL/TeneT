// Pure optimization & pace helpers. Zero React, Next, DB, or I/O imports.

import { addDays, isoWeekday, weekStart } from './day';
import {
  MAX_EXACT_CANDIDATES,
  cheapestPathToTarget,
  clampEffort,
  prepareCandidateState,
  satisfyingValue,
  streakRisk,
  type StreakRisk,
  type SubsetPlan,
} from './optimizerCore';
import { dueStatus } from './schedule';
import { evaluateDay } from './score';
import type { DayKey, DueStatus, SatisfiedOn, Trackable } from './types';

export {
  cheapestPathToTarget,
  clampEffort,
  satisfyingValue,
  streakRisk,
  type StreakRisk,
  type SubsetPlan,
};

export type MarginalItem = {
  key: string;
  label: string;
  weight: number;
  status: DueStatus;
  delta: number;
  nextScore: number | null;
};

export type FrontierPoint = {
  effort: number;
  score: number;
  keys: string[];
};

export type WeeklyPressureItem = {
  key: string;
  label: string;
  quota: number;
  done: number;
  needed: number;
  daysLeft: number;
  slack: number;
  urgent: boolean;
  satisfiedToday: boolean;
};

export type SelfMatchDelta = {
  trailingMean: number | null;
  delta: number | null;
  sampleSize: number;
};

/** Per-item score lift if satisfied right now. */
export function marginalValues(
  day: DayKey,
  active: Trackable[],
  entries: Record<string, unknown>,
  satisfiedOn: SatisfiedOn,
): MarginalItem[] {
  const { baseNum, baseDen, baseScore, candidates } = prepareCandidateState(
    day,
    active,
    entries,
    satisfiedOn,
  );

  const items: MarginalItem[] = candidates.map((c) => {
    const nextDen = baseDen + c.denAdd;
    const nextScore = nextDen === 0 ? null : Math.round((100 * (baseNum + c.weight)) / nextDen);
    const delta = nextScore === null ? 0 : baseScore === null ? nextScore : nextScore - baseScore;
    return {
      key: c.trackable.key,
      label: c.trackable.label,
      weight: c.weight,
      status: c.status,
      delta,
      nextScore,
    };
  });

  items.sort((a, b) => {
    if (b.delta !== a.delta) return b.delta - a.delta;
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.key.localeCompare(b.key);
  });

  return items;
}

/** Strictly non-dominated `(effort, score)` frontier across unsatisfied scored items. */
export function paretoFrontier(
  day: DayKey,
  active: Trackable[],
  entries: Record<string, unknown>,
  satisfiedOn: SatisfiedOn,
  effortMap: Readonly<Record<string, number>>,
): FrontierPoint[] {
  const { baseNum, baseDen, baseScore, candidates } = prepareCandidateState(
    day,
    active,
    entries,
    satisfiedOn,
    effortMap,
  );
  const bounded = candidates.slice(0, MAX_EXACT_CANDIDATES);
  const n = bounded.length;
  const limit = 1 << n;

  const bestByEffort = new Map<number, FrontierPoint>();
  if (baseScore !== null) {
    bestByEffort.set(0, { effort: 0, score: baseScore, keys: [] });
  }

  for (let mask = 1; mask < limit; mask++) {
    let effort = 0;
    let num = baseNum;
    let den = baseDen;
    let count = 0;

    for (let i = 0; i < n; i++) {
      if ((mask & (1 << i)) === 0) continue;
      const cand = bounded[i];
      effort += cand.effort;
      num += cand.weight;
      den += cand.denAdd;
      count++;
    }

    if (den === 0) continue;
    const score = Math.round((100 * num) / den);
    const prev = bestByEffort.get(effort);
    if (prev && score < prev.score) continue;
    if (prev && score === prev.score && count > prev.keys.length) continue;

    const keys: string[] = [];
    for (let i = 0; i < n; i++) {
      if ((mask & (1 << i)) !== 0) keys.push(bounded[i].trackable.key);
    }
    keys.sort();

    if (
      !prev ||
      score > prev.score ||
      (score === prev.score &&
        (keys.length < prev.keys.length ||
          (keys.length === prev.keys.length &&
            keys.join(',').localeCompare(prev.keys.join(',')) < 0)))
    ) {
      bestByEffort.set(effort, { effort, score, keys });
    }
  }

  const sortedEfforts = [...bestByEffort.keys()].sort((a, b) => a - b);
  const frontier: FrontierPoint[] = [];
  let maxScoreSeen = -1;

  for (const effort of sortedEfforts) {
    const pt = bestByEffort.get(effort)!;
    if (pt.score > maxScoreSeen) {
      frontier.push(pt);
      maxScoreSeen = pt.score;
    }
  }

  return frontier;
}

/** Weekly quota pressure for `n_per_week` active trackables. */
export function weeklyPressure(
  day: DayKey,
  active: Trackable[],
  satisfiedOn: SatisfiedOn,
  entries: Record<string, unknown> = {},
): WeeklyPressureItem[] {
  const start = weekStart(day);
  const daysLeft = 8 - isoWeekday(day);
  const baseResults = evaluateDay(day, active, entries, satisfiedOn);
  const resultByKey = new Map(baseResults.map((r) => [r.key, r] as const));

  const items: WeeklyPressureItem[] = [];
  for (const t of active) {
    if (t.schedule.type !== 'n_per_week') continue;
    const quota = Math.min(7, Math.max(1, Math.floor(t.schedule.n)));
    let doneEarlier = 0;
    for (let d = start; d < day; d = addDays(d, 1)) {
      if (satisfiedOn(t.key, d)) doneEarlier++;
    }

    const res = resultByKey.get(t.key);
    const satisfiedToday = res?.satisfied ?? false;
    const done = doneEarlier + (satisfiedToday ? 1 : 0);
    const needed = Math.max(0, quota - done);
    const slack = Math.max(0, daysLeft - Math.max(0, quota - doneEarlier));
    const urgent = !satisfiedToday && dueStatus(t, day, satisfiedOn) === 'required';

    items.push({
      key: t.key,
      label: t.label,
      quota,
      done,
      needed,
      daysLeft,
      slack,
      urgent,
      satisfiedToday,
    });
  }

  items.sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    if (a.slack !== b.slack) return a.slack - b.slack;
    if (b.needed !== a.needed) return b.needed - a.needed;
    return a.key.localeCompare(b.key);
  });

  return items;
}

/** Delta vs trailing 14-night scored mean before today. */
export function selfMatchDelta(
  liveScore: number | null,
  sealedDays: ReadonlyArray<{ day: DayKey; score: number | null }>,
  today: DayKey,
): SelfMatchDelta {
  const recent = sealedDays
    .filter((d) => d.day < today && d.score !== null)
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, 14);

  if (recent.length === 0) {
    return { trailingMean: null, delta: null, sampleSize: 0 };
  }

  const sum = recent.reduce((acc, d) => acc + (d.score as number), 0);
  const trailingMean = Math.round(sum / recent.length);
  const delta = liveScore === null ? null : liveScore - trailingMean;

  return { trailingMean, delta, sampleSize: recent.length };
}
