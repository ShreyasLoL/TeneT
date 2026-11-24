import { z } from 'zod';
import type { ApiEntry, ApiTrackable } from '@/lib/api/types';
import { projectPace, type PaceResult } from '@/lib/domain/goals';
import type { DayKey } from '@/lib/domain/types';

export const localGoalSchema = z.object({
  trackableKey: z.string().min(1),
  target: z.number().refine(Number.isFinite),
  direction: z.enum(['up', 'down']),
  deadline: z.string().optional(),
});

export type LocalGoal = z.infer<typeof localGoalSchema>;

const LOCAL_GOALS_KEY = 'tenet.localGoals.v1';

export function loadLocalGoals(storage?: Storage): LocalGoal[] {
  const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!store) return [];
  try {
    const raw = store.getItem(LOCAL_GOALS_KEY);
    if (!raw) return [];
    const parsed = z.array(localGoalSchema).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function saveLocalGoal(goal: LocalGoal, storage?: Storage): LocalGoal[] {
  const existing = loadLocalGoals(storage).filter((g) => g.trackableKey !== goal.trackableKey);
  const next = [...existing, goal];
  const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (store) {
    try {
      store.setItem(LOCAL_GOALS_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }
  return next;
}

export function removeLocalGoal(trackableKey: string, storage?: Storage): LocalGoal[] {
  const next = loadLocalGoals(storage).filter((g) => g.trackableKey !== trackableKey);
  const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (store) {
    try {
      store.setItem(LOCAL_GOALS_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }
  return next;
}

export function extractNumericSeries(
  entries: ReadonlyArray<ApiEntry>,
  trackableKey: string,
): { day: DayKey; value: number }[] {
  return entries
    .filter((e) => e.key === trackableKey && typeof e.value === 'number' && Number.isFinite(e.value))
    .map((e) => ({ day: e.day, value: e.value as number }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export function evaluateLocalGoal(
  goal: LocalGoal,
  entries: ReadonlyArray<ApiEntry>,
  trackables: ReadonlyArray<Pick<ApiTrackable, 'key' | 'label'>>,
): { label: string; pace: PaceResult; latest?: number } {
  const series = extractNumericSeries(entries, goal.trackableKey);
  const label = trackables.find((t) => t.key === goal.trackableKey)?.label ?? goal.trackableKey;
  const pace = projectPace({
    series,
    target: goal.target,
    direction: goal.direction,
    deadline: goal.deadline,
    windowDays: 28,
  });
  return {
    label,
    pace,
    latest: series.length > 0 ? series[series.length - 1].value : undefined,
  };
}
