// Lightweight core optimizer helpers used on collapsed /log shell.
// Pure TypeScript: zero React, Next, DB, or I/O imports.

import { addDays } from './day';
import { effectiveRule } from './rules';
import { evaluateDay } from './score';
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

export type SubsetPlan = {
  keys: string[];
  effort: number;
  score: number;
  delta: number;
};

export type StreakRisk = {
  current: number;
  sealedToday: boolean;
  atRisk: boolean;
  ifSealedTonight: number;
  rate30Now: number;
  rate30IfSealed: number;
};

export type PreparedCandidate = {
  trackable: Trackable;
  status: DueStatus;
  effort: number;
  weight: number;
  denAdd: number;
  marginalDelta: number;
};

export const MAX_EXACT_CANDIDATES = 12;

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

export function prepareCandidateState(
  day: DayKey,
  active: Trackable[],
  entries: Record<string, unknown>,
  satisfiedOn: SatisfiedOn,
  effortMap: Readonly<Record<string, number>> = {},
): {
  baseNum: number;
  baseDen: number;
  baseScore: number | null;
  candidates: PreparedCandidate[];
} {
  const baseResults = evaluateDay(day, active, entries, satisfiedOn);
  let baseNum = 0;
  let baseDen = 0;
  for (const r of baseResults) {
    if (!r.scored || r.status === 'off') continue;
    if (r.status === 'optional' && !r.satisfied) continue;
    baseDen += r.weight;
    if (r.satisfied) baseNum += r.weight;
  }
  const baseScore = baseDen === 0 ? null : Math.round((100 * baseNum) / baseDen);
  const resultByKey = new Map(baseResults.map((r) => [r.key, r] as const));

  const candidates: PreparedCandidate[] = [];
  for (const t of active) {
    const res = resultByKey.get(t.key);
    if (!res || !res.scored || res.status === 'off' || res.satisfied) continue;

    const denAdd = res.status === 'optional' ? t.weight : 0;
    const nextDen = baseDen + denAdd;
    const nextScore = nextDen === 0 ? null : Math.round((100 * (baseNum + t.weight)) / nextDen);
    const marginalDelta =
      nextScore === null ? 0 : baseScore === null ? nextScore : nextScore - baseScore;

    candidates.push({
      trackable: t,
      status: res.status,
      effort: clampEffort(effortMap[t.key]),
      weight: t.weight,
      denAdd,
      marginalDelta,
    });
  }

  // Keep `effectiveRule` touch for parity in case future callers inspect rules
  void effectiveRule;

  candidates.sort((a, b) => {
    const ratioDiff = b.marginalDelta / b.effort - a.marginalDelta / a.effort;
    if (ratioDiff !== 0) return ratioDiff;
    if (b.marginalDelta !== a.marginalDelta) return b.marginalDelta - a.marginalDelta;
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.trackable.key.localeCompare(b.trackable.key);
  });

  return { baseNum, baseDen, baseScore, candidates };
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

/** Minimum-effort subset reaching `targetScore` (exact search bounded at n <= 12, zero allocations in inner loop). */
export function cheapestPathToTarget(
  day: DayKey,
  active: Trackable[],
  entries: Record<string, unknown>,
  satisfiedOn: SatisfiedOn,
  effortMap: Readonly<Record<string, number>>,
  targetScore: number,
): SubsetPlan | null {
  const { baseNum, baseDen, baseScore, candidates } = prepareCandidateState(
    day,
    active,
    entries,
    satisfiedOn,
    effortMap,
  );

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

    if (best !== null && effort > best.effort) continue;
    if (den === 0) continue;

    const score = Math.round((100 * num) / den);
    if (score < targetScore) continue;
    if (best !== null && effort === best.effort && count > best.keys.length) continue;

    const keys: string[] = [];
    for (let i = 0; i < n; i++) {
      if ((mask & (1 << i)) !== 0) keys.push(bounded[i].trackable.key);
    }
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
