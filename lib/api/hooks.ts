'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, dayKey } from '@/lib/domain/day';
import { satisfiedOnFromDays } from '@/lib/domain/satisfiedOnFromDays';
import { activeTrackables } from '@/lib/domain/schedule';
import { evaluateDay, nightScore } from '@/lib/domain/score';
import { currentStreak, longestStreak, sealRate } from '@/lib/domain/stats';
import type { DayKey } from '@/lib/domain/types';
import { useTenetStore } from '@/lib/store';
import { getDefinitions, getState, postCommand, postSeal } from './client';
import { tenetKeys } from './keys';
import type { StateResponse } from './types';

let currentLogicalDay: DayKey = dayKey(new Date());
const listeners = new Set<() => void>();
let tickerStarted = false;

function notifyIfDayChanged() {
  const next = dayKey(new Date());
  if (next !== currentLogicalDay) {
    currentLogicalDay = next;
    for (const cb of listeners) cb();
  }
}

function subscribeToday(cb: () => void) {
  listeners.add(cb);

  if (typeof window !== 'undefined' && !tickerStarted) {
    tickerStarted = true;
    window.setInterval(() => {
      if (document.visibilityState === 'visible') notifyIfDayChanged();
    }, 15_000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') notifyIfDayChanged();
    });
    window.addEventListener('focus', notifyIfDayChanged);
  }

  return () => {
    listeners.delete(cb);
  };
}

function getTodaySnapshot(): DayKey {
  return currentLogicalDay;
}

function getTodayServerSnapshot(): DayKey {
  return currentLogicalDay;
}

export function useToday(): DayKey {
  return useSyncExternalStore(subscribeToday, getTodaySnapshot, getTodayServerSnapshot);
}

export function useDefinitions() {
  return useQuery({
    queryKey: tenetKeys.definitions(),
    queryFn: getDefinitions,
    staleTime: 5 * 60_000,
  });
}

export function useTenetState(from?: DayKey, to?: DayKey) {
  const today = useToday();
  const rangeFrom = from ?? addDays(today, -399);
  const rangeTo = to ?? today;

  return useQuery({
    queryKey: tenetKeys.state(rangeFrom, rangeTo),
    queryFn: () => getState({ from: rangeFrom, to: rangeTo }),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useLogEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { day: DayKey; key: string; version: number; value: unknown }) =>
      postCommand({ type: 'log_entry', day: input.day, key: input.key, value: input.value }),

    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['tenet', 'state'] });
      const previous = queryClient.getQueriesData<StateResponse>({ queryKey: ['tenet', 'state'] });

      for (const [queryKey, data] of previous) {
        if (!data) continue;
        const filtered = data.entries.filter(
          (entry) => !(entry.day === input.day && entry.key === input.key),
        );
        filtered.push({
          day: input.day,
          key: input.key,
          version: input.version,
          value: input.value,
        });
        queryClient.setQueryData<StateResponse>(queryKey, {
          ...data,
          entries: filtered,
        });
      }

      return { previous };
    },

    onError: (_err, _input, context) => {
      if (!context) return;
      for (const [queryKey, data] of context.previous) {
        queryClient.setQueryData(queryKey, data);
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['tenet', 'state'] });
    },
  });
}

export function useSeal() {
  const queryClient = useQueryClient();
  const startRecap = useTenetStore((s) => s.startRecap);

  return useMutation({
    mutationFn: (input: { day: DayKey; reflection?: string }) => postSeal(input),
    onSuccess: async (_res, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tenet', 'state'] }),
        queryClient.invalidateQueries({ queryKey: tenetKeys.definitions() }),
      ]);
      startRecap(input.day);
    },
  });
}

export function useLivePreview(day: DayKey) {
  const { data: state } = useTenetState();
  const setLivePreview = useTenetStore((s) => s.setLivePreview);

  const preview = useMemo(() => {
    if (!state) {
      return {
        results: [],
        score: null as number | null,
        met: [] as string[],
        unmet: [] as string[],
        entriesMap: {} as Record<string, unknown>,
      };
    }

    const active = activeTrackables(state.definitions.trackables, day);
    const entriesMap: Record<string, unknown> = {};
    for (const entry of state.entries) {
      if (entry.day === day) entriesMap[entry.key] = entry.value;
    }
    const satisfiedOn = satisfiedOnFromDays(state.days);
    const results = evaluateDay(day, active, entriesMap, satisfiedOn);
    const score = nightScore(results);
    const met = results.filter((r) => r.satisfied).map((r) => r.key);
    const unmet = results
      .filter((r) => r.status === 'required' && !r.satisfied)
      .map((r) => r.key);

    return { results, score, met, unmet, entriesMap };
  }, [day, state]);

  useEffect(() => {
    setLivePreview({
      score: preview.score,
      met: preview.met,
      unmet: preview.unmet,
    });
  }, [preview.met, preview.score, preview.unmet, setLivePreview]);

  return preview;
}

export function useStreaks() {
  const today = useToday();
  const { data: state } = useTenetState();

  return useMemo(() => {
    if (!state) {
      return { current: 0, longest: 0, rate30: 0, sealedCount: 0 };
    }
    const sealedDays = state.days.map((d) => d.day);
    return {
      current: currentStreak(sealedDays, today),
      longest: longestStreak(sealedDays),
      rate30: sealRate(sealedDays, addDays(today, -29), today),
      sealedCount: sealedDays.length,
    };
  }, [state, today]);
}
