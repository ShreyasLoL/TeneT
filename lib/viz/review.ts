import type { ApiEntry, ApiSealedDay, ApiTrackable } from '@/lib/api/types';
import { addDays } from '@/lib/domain/day';
import { generateReview } from '@/lib/domain/review';
import type { DayKey } from '@/lib/domain/types';
import { evaluateLocalGoal, type LocalGoal } from './localGoals';
import { labelFor } from './ringLayout';

export type ComputedReview = {
  day: DayKey;
  score: number | null;
  streak: number;
  avgScoreLast7?: number;
  missed: string[];
  lines: string[];
};

/**
 * Build the `ReviewInput` client-side from `/api/state` using pure domain functions (Gap 6).
 */
export function buildReviewForDay(params: {
  day: DayKey;
  days: ReadonlyArray<ApiSealedDay>;
  trackables: ReadonlyArray<Pick<ApiTrackable, 'key' | 'label'>>;
  entries?: ReadonlyArray<ApiEntry>;
  localGoals?: ReadonlyArray<LocalGoal>;
}): ComputedReview | null {
  const { day, days, trackables, entries = [], localGoals = [] } = params;
  const sealed = days.find((d) => d.day === day);
  if (!sealed) return null;

  const sevenFrom = addDays(day, -7);
  const sevenTo = addDays(day, -1);
  const prior7 = days.filter(
    (d) => d.day >= sevenFrom && d.day <= sevenTo && d.score !== null,
  );
  const avgScoreLast7 =
    prior7.length > 0
      ? prior7.reduce((sum, d) => sum + (d.score ?? 0), 0) / prior7.length
      : undefined;

  const missed = sealed.results
    .filter((r) => r.status === 'required' && r.scored && !r.satisfied)
    .map((r) => labelFor(r.key, { trackables }));

  const goals = localGoals.map((goal) => {
    const evaluated = evaluateLocalGoal(goal, entries, trackables);
    return {
      label: evaluated.label,
      status: evaluated.pace.status,
      etaDay: evaluated.pace.etaDay,
    };
  });

  const lines = generateReview({
    score: sealed.score,
    streak: sealed.streak,
    avgScoreLast7,
    missed,
    goals,
  });

  return {
    day,
    score: sealed.score,
    streak: sealed.streak,
    avgScoreLast7,
    missed,
    lines,
  };
}
