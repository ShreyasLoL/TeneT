// Pure optimization & pace helpers. Zero React, Next, DB, or I/O imports.

import { addDays, isoWeekday, weekStart } from './day';
import { effectiveRule } from './rules';
import { dueStatus } from './schedule';
import { evaluateDay, nightScore } from './score';
import { currentStreak, sealRate } from './stats';
import type {
  DayKey,
  DueStatus,
  Kind,
  Rule,
  SatisfiedOn,
  Trackable,
  TrackableConfig,
} from './types';

export type MarginalItem = {
  key: string;
  label: string;
  weight: number;
  status: DueStatus;
  delta: number;
  nextScore: number | null;
};

export type SubsetPlan = {
  keys: string[];
  effort: number;
  score: number;
  delta: number;
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

export type StreakRisk = {
  current: number;
  sealedToday: boolean;
  atRisk: boolean;
  ifSealedTonight: number;
  rate30Now: number;
  rate30IfSealed: number;
};

export type SelfMatchDelta = {
  trailingMean: number | null;
  delta: number | null;
  sampleSize: number;
};

const MAX_EXACT_CANDIDATES = 12;

export function clampEffort(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw)) return 3;
  return Math.min(5, Math.max(1, Math.round(raw)));
}

/** Minimal deterministic value that satisfies `rule` for `kind`. */
export function satisfyingValue(rule: Rule, kind: Kind, config: TrackableConfig): unknown {
  switch (rule.op) {
    case 'eq':
      return rule.value;
    case 'gte':
      return rule.value;
    case 'lte':
      return rule.value;
    case 'between':
      return rule.min;
    case 'present':
      switch (kind) {
        case 'check':
          return true;
        case 'count':
        case 'duration':
        case 'queue':
        case 'rating':
          return 1;
        case 'measure':
          return 0;
        case 'choice':
          return config.options && config.options.length > 0 ? config.options[0] : 'selected';
        case 'note':
          return 'logged';
        case 'log':
          return [{ logged: true }];
      }
  }
}

type Candidate = {
  trackable: Trackable;
  status: DueStatus;
  effort: number;
  marginalDelta: number;
  sampleValue: unknown;
};

function gatherCandidates(
  day: DayKey,
  active: Trackable[],
  entries: Record<string, unknown>,
  satisfiedOn: SatisfiedOn,
  effortMap: Readonly<Record<string, number>> = {},
): { baseScore: number | null; candidates: Candidate[] } {
  const baseResults = evaluateDay(day, active, entries, satisfiedOn);
  const baseScore = nightScore(baseResults);
  const resultByKey = new Map(baseResults.map((r) => [r.key, r] as const));

  const candidates: Candidate[] = [];
  for (const t of active) {
    const res = resultByKey.get(t.key);
    if (!res || !res.scored || res.status === 'off' || res.satisfied) continue;

    const sampleValue = satisfyingValue(effectiveRule(t), t.kind, t.config);
    const nextResults = evaluateDay(day, active, { ...entries, [t.key]: sampleValue }, satisfiedOn);
    const nextScore = nightScore(nextResults);
    const marginalDelta =
      nextScore === null ? 0 : baseScore === null ? nextScore : nextScore - baseScore;

    candidates.push({
      trackable: t,
      status: res.status,
      effort: clampEffort(effortMap[t.key]),
      marginalDelta,
      sampleValue,
    });
  }

  candidates.sort((a, b) => {
    const ratioDiff = b.marginalDelta / b.effort - a.marginalDelta / a.effort;
    if (ratioDiff !== 0) return ratioDiff;
    if (b.marginalDelta !== a.marginalDelta) return b.marginalDelta - a.marginalDelta;
    if (b.trackable.weight !== a.trackable.weight) return b.trackable.weight - a.trackable.weight;
    return a.trackable.key.localeCompare(b.trackable.key);
  });

  return { baseScore, candidates };
}

/** Per-item score lift if satisfied right now. */
export function marginalValues(
  day: DayKey,
  active: Trackable[],
  entries: Record<string, unknown>,
  satisfiedOn: SatisfiedOn,
): MarginalItem[] {
  const { baseScore } = gatherCandidates(day, active, entries, satisfiedOn);
  const baseResults = evaluateDay(day, active, entries, satisfiedOn);
  const resultByKey = new Map(baseResults.map((r) => [r.key, r] as const));

  const items: MarginalItem[] = [];
  for (const t of active) {
    const res = resultByKey.get(t.key);
    if (!res || !res.scored || res.status === 'off' || res.satisfied) continue;
    const sampleValue = satisfyingValue(effectiveRule(t), t.kind, t.config);
    const nextScore = nightScore(
      evaluateDay(day, active, { ...entries, [t.key]: sampleValue }, satisfiedOn),
    );
    const delta = nextScore === null ? 0 : baseScore === null ? nextScore : nextScore - baseScore;

    items.push({
      key: t.key,
      label: t.label,
      weight: t.weight,
      status: res.status,
      delta,
      nextScore,
    });
  }

  items.sort((a, b) => {
    if (b.delta !== a.delta) return b.delta - a.delta;
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.key.localeCompare(b.key);
  });

  return items;
}

function comparePlanPreference(
  aEffort: number,
  aKeys: string[],
  aScore: number,
  bEffort: number,
  bKeys: string[],
  bScore: number,
): number {
  if (aEffort !== bEffort) return aEffort - bEffort;
  if (aKeys.length !== bKeys.length) return aKeys.length - bKeys.length;
  if (bScore !== aScore) return bScore - aScore;
  return aKeys.join(',').localeCompare(bKeys.join(','));
}

/** Minimum-effort subset reaching `targetScore` (exact search bounded at n <= 12). */
export function cheapestPathToTarget(
  day: DayKey,
  active: Trackable[],
  entries: Record<string, unknown>,
  satisfiedOn: SatisfiedOn,
  effortMap: Readonly<Record<string, number>>,
  targetScore: number,
): SubsetPlan | null {
  const { baseScore, candidates } = gatherCandidates(day, active, entries, satisfiedOn, effortMap);

  if (baseScore !== null && baseScore >= targetScore) {
    return { keys: [], effort: 0, score: baseScore, delta: 0 };
  }

  const bounded = candidates.slice(0, MAX_EXACT_CANDIDATES);
  const n = bounded.length;
  if (n === 0) return null;

  const limit = 1 << n;
  let best: SubsetPlan | null = null;

  for (let mask = 1; mask < limit; mask++) {
    let effort = 0;
    const keys: string[] = [];
    const simulated: Record<string, unknown> = { ...entries };

    for (let i = 0; i < n; i++) {
      if ((mask & (1 << i)) === 0) continue;
      const cand = bounded[i];
      effort += cand.effort;
      keys.push(cand.trackable.key);
      simulated[cand.trackable.key] = cand.sampleValue;
    }

    if (best !== null && effort > best.effort) continue;

    const score = nightScore(evaluateDay(day, active, simulated, satisfiedOn));
    if (score === null || score < targetScore) continue;

    keys.sort();
    const delta = baseScore === null ? score : score - baseScore;

    if (
      best === null ||
      comparePlanPreference(effort, keys, score, best.effort, best.keys, best.score) < 0
    ) {
      best = { keys, effort, score, delta };
    }
  }

  return best;
}

/** Strictly non-dominated `(effort, score)` frontier across unsatisfied scored items. */
export function paretoFrontier(
  day: DayKey,
  active: Trackable[],
  entries: Record<string, unknown>,
  satisfiedOn: SatisfiedOn,
  effortMap: Readonly<Record<string, number>>,
): FrontierPoint[] {
  const { baseScore, candidates } = gatherCandidates(day, active, entries, satisfiedOn, effortMap);
  const bounded = candidates.slice(0, MAX_EXACT_CANDIDATES);
  const n = bounded.length;
  const limit = 1 << n;

  const bestByEffort = new Map<number, FrontierPoint>();
  if (baseScore !== null) {
    bestByEffort.set(0, { effort: 0, score: baseScore, keys: [] });
  }

  for (let mask = 1; mask < limit; mask++) {
    let effort = 0;
    const keys: string[] = [];
    const simulated: Record<string, unknown> = { ...entries };

    for (let i = 0; i < n; i++) {
      if ((mask & (1 << i)) === 0) continue;
      const cand = bounded[i];
      effort += cand.effort;
      keys.push(cand.trackable.key);
      simulated[cand.trackable.key] = cand.sampleValue;
    }

    const score = nightScore(evaluateDay(day, active, simulated, satisfiedOn));
    if (score === null) continue;
    keys.sort();

    const prev = bestByEffort.get(effort);
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

/** Streak continuity and 30-day seal-rate impact if sealed tonight. */
export function streakRisk(sealedDays: Iterable<DayKey>, today: DayKey): StreakRisk {
  const set = new Set(sealedDays);
  const sealedToday = set.has(today);
  const current = currentStreak(set, today);

  const from = addDays(today, -29);
  const rate30Now = sealRate(set, from, today);

  if (sealedToday) {
    return {
      current,
      sealedToday: true,
      atRisk: false,
      ifSealedTonight: current,
      rate30Now,
      rate30IfSealed: rate30Now,
    };
  }

  const withToday = new Set(set);
  withToday.add(today);
  const ifSealedTonight = currentStreak(withToday, today);
  const rate30IfSealed = sealRate(withToday, from, today);

  return {
    current,
    sealedToday: false,
    atRisk: current > 0,
    ifSealedTonight,
    rate30Now,
    rate30IfSealed,
  };
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
