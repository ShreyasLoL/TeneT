'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LoadingFallback } from '@/components/chrome/LoadingFallback';
import { SatorGlyph } from '@/components/chrome/SatorGlyph';
import { Scrim } from '@/components/chrome/Scrim';
import { ApiError } from '@/lib/api/client';
import { useLivePreview, useLogEntry, useSeal, useTenetState, useToday } from '@/lib/api/hooks';
import type { ApiTrackable } from '@/lib/api/types';
import { COPY } from '@/lib/copy';
import { satisfiedOnFromDays } from '@/lib/domain/satisfiedOnFromDays';
import { activeTrackables } from '@/lib/domain/schedule';
import { evaluateDay, nightScore } from '@/lib/domain/score';
import type { DayKey } from '@/lib/domain/types';
import { useTenetStore } from '@/lib/store';
import { LiveScore } from './LiveScore';
import { Reflection } from './Reflection';
import { SealControl } from './SealControl';
import { TrackableRow, type RowSaveState } from './TrackableRow';

const LazyPull = dynamic(() => import('./Pull').then((m) => m.Pull), {
  loading: () => (
    <div className="min-h-[62px] rounded-xl border border-line bg-surface px-5 py-3" />
  ),
});

const IMMEDIATE_KINDS = new Set(['check', 'rating', 'choice']);
const COALESCE_MS = 150;

type PendingWrite = {
  trackable: ApiTrackable;
  value: unknown;
  timerId: number;
};

function mapApiErrorCopy(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'day_sealed':
        return COPY.status.daySealed;
      case 'day_not_open':
        return COPY.status.dayNotOpen;
      case 'invalid_value':
        return COPY.status.invalidValue;
      case 'network_error':
        return COPY.status.networkError;
      case 'invalid_reflection':
        return error.message;
      default:
        return COPY.status.databaseError;
    }
  }
  return COPY.status.databaseError;
}

function CheckInForm({ today }: { today: DayKey }) {
  const { data, isLoading, isError, refetch } = useTenetState();
  const preview = useLivePreview(today);
  const logMutation = useLogEntry();
  const sealMutation = useSeal();
  const recap = useTenetStore((s) => s.recap);

  const [draftValues, setDraftValues] = useState<Record<string, unknown>>({});
  const [rowStates, setRowStates] = useState<Record<string, RowSaveState>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string | null>>({});
  const [sealError, setSealError] = useState<string | null>(null);
  const [reflectionError, setReflectionError] = useState<string | null>(null);

  const reflectionDraftRef = useRef('');
  const pendingTimersRef = useRef<Map<string, PendingWrite>>(new Map());
  const inFlightByKeyRef = useRef<Map<string, Promise<boolean>>>(new Map());
  const mountedRef = useRef(true);

  const sealedToday = useMemo(
    () => data?.days.find((d) => d.day === today) ?? null,
    [data?.days, today],
  );
  const sealedRef = useRef(false);
  useEffect(() => {
    sealedRef.current = Boolean(sealedToday);
  }, [sealedToday]);

  const mutateEntryRef = useRef(logMutation.mutateAsync);
  useEffect(() => {
    mutateEntryRef.current = logMutation.mutateAsync;
  }, [logMutation.mutateAsync]);

  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  const dispatchWrite = useCallback(
    (trackable: ApiTrackable, value: unknown): Promise<boolean> => {
      if (mountedRef.current) {
        setRowStates((prev) => ({ ...prev, [trackable.key]: 'saving' }));
        setRowErrors((prev) => ({ ...prev, [trackable.key]: null }));
      }

      const prevChain = inFlightByKeyRef.current.get(trackable.key) ?? Promise.resolve(true);
      const nextPromise = prevChain
        .catch(() => true)
        .then(async () => {
          try {
            await mutateEntryRef.current({
              day: today,
              key: trackable.key,
              version: trackable.version,
              value,
            });
            if (mountedRef.current) {
              setRowStates((prev) => ({ ...prev, [trackable.key]: 'saved' }));
            }
            return true;
          } catch (error) {
            if (error instanceof ApiError && error.code === 'network_error') {
              if (mountedRef.current) {
                setRowStates((prev) => ({ ...prev, [trackable.key]: 'saved' }));
              }
              return false;
            }
            if (mountedRef.current) {
              setRowStates((prev) => ({ ...prev, [trackable.key]: 'error' }));
              setRowErrors((prev) => ({ ...prev, [trackable.key]: mapApiErrorCopy(error) }));
            }
            if (error instanceof ApiError && error.code === 'day_sealed') {
              void refetchRef.current();
            }
            return false;
          }
        });

      const tracked = nextPromise.finally(() => {
        if (inFlightByKeyRef.current.get(trackable.key) === tracked) {
          inFlightByKeyRef.current.delete(trackable.key);
        }
      });
      inFlightByKeyRef.current.set(trackable.key, tracked);
      return tracked;
    },
    [today],
  );

  const flushKey = useCallback(
    (key: string) => {
      const pending = pendingTimersRef.current.get(key);
      if (!pending) return;
      window.clearTimeout(pending.timerId);
      pendingTimersRef.current.delete(key);
      void dispatchWrite(pending.trackable, pending.value);
    },
    [dispatchWrite],
  );

  const flushAllPending = useCallback(() => {
    for (const key of [...pendingTimersRef.current.keys()]) {
      flushKey(key);
    }
  }, [flushKey]);

  useEffect(() => {
    mountedRef.current = true;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushAllPending();
    };
    const onPageHide = () => flushAllPending();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      flushAllPending();
    };
  }, [flushAllPending]);

  const trackablesDef = data?.definitions.trackables;
  const areasDef = data?.definitions.areas;
  const sealedDays = data?.days;

  const active = useMemo(
    () => (trackablesDef ? activeTrackables(trackablesDef, today) : []),
    [trackablesDef, today],
  );

  const activeApi = useMemo(() => {
    if (!trackablesDef) return [];
    const byKeyVersion = new Map(
      trackablesDef.map((t) => [`${t.key}@${t.version}`, t] as const),
    );
    return active
      .map((t) => byKeyVersion.get(`${t.key}@${t.version}`))
      .filter((t): t is ApiTrackable => t !== undefined);
  }, [active, trackablesDef]);

  const mergedEntries = useMemo(() => {
    return { ...preview.entriesMap, ...draftValues };
  }, [draftValues, preview.entriesMap]);

  const satisfiedOn = useMemo(
    () => satisfiedOnFromDays(sealedDays ?? []),
    [sealedDays],
  );

  const liveResults = useMemo(
    () => evaluateDay(today, active, mergedEntries, satisfiedOn),
    [active, mergedEntries, satisfiedOn, today],
  );

  const liveScore = useMemo(() => nightScore(liveResults), [liveResults]);

  const resultByKey = useMemo(
    () => new Map(liveResults.map((r) => [r.key, r])),
    [liveResults],
  );

  const groupedByArea = useMemo(() => {
    if (!areasDef) return [];
    return areasDef
      .map((area) => ({
        area,
        items: activeApi.filter((t) => t.areaSlug === area.slug),
      }))
      .filter((g) => g.items.length > 0);
  }, [activeApi, areasDef]);

  const handleTrackableChange = useCallback(
    (trackable: ApiTrackable, value: unknown) => {
      if (sealedRef.current) return;
      setDraftValues((prev) => ({ ...prev, [trackable.key]: value }));

      const existing = pendingTimersRef.current.get(trackable.key);
      if (existing) {
        window.clearTimeout(existing.timerId);
        pendingTimersRef.current.delete(trackable.key);
      }

      if (IMMEDIATE_KINDS.has(trackable.kind)) {
        void dispatchWrite(trackable, value);
        return;
      }

      setRowStates((prev) => ({ ...prev, [trackable.key]: 'saving' }));
      const timerId = window.setTimeout(() => {
        pendingTimersRef.current.delete(trackable.key);
        void dispatchWrite(trackable, value);
      }, COALESCE_MS);
      pendingTimersRef.current.set(trackable.key, { trackable, value, timerId });
    },
    [dispatchWrite],
  );

  const handleReflectionDraft = useCallback((next: string) => {
    reflectionDraftRef.current = next;
  }, []);

  const clearReflectionError = useCallback(() => {
    setReflectionError(null);
  }, []);

  const handleSeal = useCallback(async () => {
    setSealError(null);
    setReflectionError(null);

    // 1. Flush any coalesced timers and await ALL in-flight entry mutations before sealing
    flushAllPending();
    const activeWrites = [...inFlightByKeyRef.current.values()];
    if (activeWrites.length > 0) {
      const outcomes = await Promise.all(activeWrites);
      if (outcomes.some((ok) => !ok)) {
        setSealError(COPY.status.networkError);
        return;
      }
    }

    // 2. Pessimistic seal round-trip: Recap only begins once server confirms seal
    try {
      await sealMutation.mutateAsync({
        day: today,
        reflection: reflectionDraftRef.current.trim() || undefined,
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'day_sealed') {
        setSealError(COPY.status.daySealed);
        void refetch();
        return;
      }
      if (error instanceof ApiError && error.code === 'invalid_reflection') {
        setReflectionError(error.message);
        return;
      }
      setSealError(mapApiErrorCopy(error));
    }
  }, [flushAllPending, refetch, sealMutation, today]);

  if (isLoading) return <LoadingFallback />;

  if (isError || !data) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        <SatorGlyph caption={COPY.status.networkError} />
        <button
          type="button"
          onClick={() => void refetch()}
          className="min-h-11 border border-line px-4 font-mono text-xs uppercase tracking-[0.14em] text-text-dim hover:text-text"
        >
          try again
        </button>
      </main>
    );
  }

  const requiredResults = liveResults.filter((r) => r.status === 'required' && r.scored);
  const metCount = requiredResults.filter((r) => r.satisfied).length;
  const unloggedRequiredCount = requiredResults.filter(
    (r) => mergedEntries[r.key] === undefined,
  ).length;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <Scrim className="rounded-xl border border-line p-6">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="text-2xl font-normal tracking-tight text-text">{COPY.ritual.header}</h1>
          <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.14em] tabular-nums">
            {sealedToday ? (
              <Link href="/dashboard" className="text-accent hover:underline">
                {recap ? COPY.ritual.recapEnd : COPY.doors.sealed} · {COPY.doors.lookBack}
              </Link>
            ) : null}
            <span className="text-text-dim">{today}</span>
          </div>
        </div>

        <LiveScore
          score={sealedToday ? sealedToday.score : liveScore}
          metCount={
            sealedToday
              ? sealedToday.results.filter((r) => r.status === 'required' && r.satisfied).length
              : metCount
          }
          requiredCount={
            sealedToday
              ? sealedToday.results.filter((r) => r.status === 'required' && r.scored).length
              : requiredResults.length
          }
        />
      </Scrim>

      <div className="space-y-6">
        {groupedByArea.map(({ area, items }) => (
          <section
            key={area.id}
            aria-label={area.name}
            className="rounded-xl border border-line bg-surface px-5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          >
            <header className="border-b border-line py-3">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
                {area.name}
              </h2>
            </header>

            <div>
              {items.map((trackable) => {
                const res = resultByKey.get(trackable.key);
                return (
                  <TrackableRow
                    key={`${trackable.key}-${trackable.version}`}
                    trackable={trackable}
                    day={today}
                    status={res?.status ?? 'required'}
                    satisfied={res?.satisfied ?? false}
                    satisfiedOn={satisfiedOn}
                    value={mergedEntries[trackable.key]}
                    disabled={Boolean(sealedToday) || sealMutation.isPending}
                    saveState={rowStates[trackable.key] ?? 'idle'}
                    errorMessage={rowErrors[trackable.key] ?? null}
                    onChange={handleTrackableChange}
                    onRowBlur={flushKey}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <LazyPull
        day={today}
        active={activeApi}
        entries={mergedEntries}
        days={data.days}
        liveScore={sealedToday ? sealedToday.score : liveScore}
        isSealed={Boolean(sealedToday)}
        defaultExpanded={false}
      />

      <Reflection
        sealedValue={sealedToday ? (sealedToday.reflection ?? '') : null}
        disabled={Boolean(sealedToday) || sealMutation.isPending}
        error={reflectionError}
        onDraftChange={handleReflectionDraft}
        onClearError={clearReflectionError}
      />

      <SealControl
        unloggedRequiredCount={unloggedRequiredCount}
        isSealed={Boolean(sealedToday)}
        isPending={sealMutation.isPending}
        errorMessage={sealError}
        onSeal={() => void handleSeal()}
      />
    </main>
  );
}

export function CheckIn() {
  const today = useToday();
  return <CheckInForm key={today} today={today} />;
}
