'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Pull } from './Pull';
import { Reflection } from './Reflection';
import { SealControl } from './SealControl';
import { TrackableRow, type RowSaveState } from './TrackableRow';

const IMMEDIATE_KINDS = new Set(['check', 'rating', 'choice']);

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
  const [reflection, setReflection] = useState('');
  const [sealError, setSealError] = useState<string | null>(null);
  const [reflectionError, setReflectionError] = useState<string | null>(null);

  const timersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const id of timers.values()) window.clearTimeout(id);
      timers.clear();
    };
  }, []);

  const sealedToday = useMemo(
    () => data?.days.find((d) => d.day === today) ?? null,
    [data?.days, today],
  );

  const active = useMemo(
    () => (data ? activeTrackables(data.definitions.trackables, today) : []),
    [data, today],
  );

  const activeApi = useMemo(() => {
    if (!data) return [];
    const byKeyVersion = new Map(
      data.definitions.trackables.map((t) => [`${t.key}@${t.version}`, t] as const),
    );
    return active
      .map((t) => byKeyVersion.get(`${t.key}@${t.version}`))
      .filter((t): t is ApiTrackable => t !== undefined);
  }, [active, data]);

  const mergedEntries = useMemo(() => {
    return { ...preview.entriesMap, ...draftValues };
  }, [draftValues, preview.entriesMap]);

  const satisfiedOn = useMemo(
    () => satisfiedOnFromDays(data?.days ?? []),
    [data?.days],
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
    if (!data) return [];
    return data.definitions.areas
      .map((area) => ({
        area,
        items: activeApi.filter((t) => t.areaSlug === area.slug),
      }))
      .filter((g) => g.items.length > 0);
  }, [activeApi, data]);

  const commitEntry = async (trackable: ApiTrackable, value: unknown) => {
    setRowStates((prev) => ({ ...prev, [trackable.key]: 'saving' }));
    setRowErrors((prev) => ({ ...prev, [trackable.key]: null }));

    try {
      await logMutation.mutateAsync({
        day: today,
        key: trackable.key,
        version: trackable.version,
        value,
      });
      setRowStates((prev) => ({ ...prev, [trackable.key]: 'saved' }));
    } catch (error) {
      setRowStates((prev) => ({ ...prev, [trackable.key]: 'error' }));
      setRowErrors((prev) => ({ ...prev, [trackable.key]: mapApiErrorCopy(error) }));
      if (error instanceof ApiError && error.code === 'day_sealed') {
        void refetch();
      }
    }
  };

  const handleTrackableChange = (trackable: ApiTrackable, value: unknown) => {
    if (sealedToday) return;
    setDraftValues((prev) => ({ ...prev, [trackable.key]: value }));

    const existingTimer = timersRef.current.get(trackable.key);
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
      timersRef.current.delete(trackable.key);
    }

    if (IMMEDIATE_KINDS.has(trackable.kind)) {
      void commitEntry(trackable, value);
      return;
    }

    setRowStates((prev) => ({ ...prev, [trackable.key]: 'saving' }));
    const timer = window.setTimeout(() => {
      timersRef.current.delete(trackable.key);
      void commitEntry(trackable, value);
    }, 350);
    timersRef.current.set(trackable.key, timer);
  };

  const handleSeal = async () => {
    setSealError(null);
    setReflectionError(null);

    // Flush any pending debounced writes before sealing
    for (const [key, timerId] of timersRef.current.entries()) {
      window.clearTimeout(timerId);
      timersRef.current.delete(key);
      const t = activeApi.find((item) => item.key === key);
      if (t && key in draftValues) {
        await commitEntry(t, draftValues[key]);
      }
    }

    try {
      await sealMutation.mutateAsync({
        day: today,
        reflection: reflection.trim() || undefined,
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
  };

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
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-normal tracking-tight text-text">{COPY.ritual.header}</h1>
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-text-dim tabular-nums">
            {today}
          </span>
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

        {sealedToday ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent">
              {recap ? COPY.ritual.recapEnd : COPY.doors.sealed}
            </p>
            <Link
              href="/dashboard"
              className="inline-flex min-h-10 items-center border border-line px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim hover:text-text"
            >
              {COPY.doors.lookBack}
            </Link>
          </div>
        ) : null}
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
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <Pull
        day={today}
        active={activeApi}
        entries={mergedEntries}
        days={data.days}
        liveScore={sealedToday ? sealedToday.score : liveScore}
        isSealed={Boolean(sealedToday)}
        defaultExpanded={false}
      />

      <Reflection
        value={sealedToday ? (sealedToday.reflection ?? '') : reflection}
        disabled={Boolean(sealedToday) || sealMutation.isPending}
        error={reflectionError}
        onChange={(next) => {
          setReflection(next);
          if (reflectionError) setReflectionError(null);
        }}
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
