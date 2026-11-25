'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { LoadingFallback } from '@/components/chrome/LoadingFallback';
import { SatorGlyph } from '@/components/chrome/SatorGlyph';
import { Scrim } from '@/components/chrome/Scrim';
import { Button } from '@/components/ui/button';
import { useTenetState, useToday } from '@/lib/api/hooks';
import { COPY } from '@/lib/copy';
import { addDays } from '@/lib/domain/day';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { resolveAreaLook } from '@/lib/viz/areaLook';
import { lensFor } from '@/lib/viz/lens';
import {
  evaluateLocalGoal,
  loadLocalGoals,
  removeLocalGoal,
  saveLocalGoal,
  type LocalGoal,
} from '@/lib/viz/localGoals';
import { useSmoothScroll } from '@/lib/viz/useSmoothScroll';
import { Sparkline } from './Sparkline';

const EMPTY_GOALS: LocalGoal[] = [];
const GOALS_EVENT = 'tenet-local-goals-change';
let cachedGoals: LocalGoal[] | null = null;

function getGoalsSnapshot(): LocalGoal[] {
  if (typeof window === 'undefined') return EMPTY_GOALS;
  if (cachedGoals === null) {
    cachedGoals = loadLocalGoals();
  }
  return cachedGoals;
}

function getGoalsServerSnapshot(): LocalGoal[] {
  return EMPTY_GOALS;
}

function subscribeGoals(cb: () => void) {
  if (typeof window === 'undefined') return () => {};
  const invalidateAndNotify = () => {
    cachedGoals = null;
    cb();
  };
  window.addEventListener('storage', invalidateAndNotify);
  window.addEventListener(GOALS_EVENT, invalidateAndNotify);
  return () => {
    window.removeEventListener('storage', invalidateAndNotify);
    window.removeEventListener(GOALS_EVENT, invalidateAndNotify);
  };
}

function updateCachedGoals(next: LocalGoal[]) {
  cachedGoals = next;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(GOALS_EVENT));
  }
}

export function AreaView() {
  useSmoothScroll();
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';
  const today = useToday();
  const { data, isLoading, isError } = useTenetState();
  const setDensity = useTenetStore((s) => s.setDensity);

  const localGoals = useSyncExternalStore(
    subscribeGoals,
    getGoalsSnapshot,
    getGoalsServerSnapshot,
  );
  const [targetInput, setTargetInput] = useState('');

  const area = data?.definitions.areas.find((a) => a.slug === slug) ?? null;

  useEffect(() => {
    setDensity(0.5);
    rig.focusAreaIndex = area ? area.position % 3 : -1;
    return () => {
      rig.focusAreaIndex = -1;
    };
  }, [area, setDensity]);

  const areaTrackables = useMemo(
    () => (data && area ? data.definitions.trackables.filter((t) => t.areaSlug === area.slug) : []),
    [area, data],
  );

  const primaryNumeric = useMemo(
    () =>
      areaTrackables.find((t) => t.kind === 'measure') ??
      areaTrackables.find((t) => t.kind === 'count' || t.kind === 'duration') ??
      null,
    [areaTrackables],
  );

  const areaGoal = useMemo(
    () =>
      primaryNumeric
        ? localGoals.find((g) => g.trackableKey === primaryNumeric.key) ?? null
        : null,
    [localGoals, primaryNumeric],
  );

  const goalEvaluation = useMemo(() => {
    if (!areaGoal || !data) return null;
    return evaluateLocalGoal(areaGoal, data.entries, data.definitions.trackables);
  }, [areaGoal, data]);

  if (isLoading) return <LoadingFallback variant="wide" />;
  if (isError || !data) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <SatorGlyph caption={COPY.status.networkError} />
      </main>
    );
  }
  if (!area) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
        <SatorGlyph caption={COPY.status.unknownArea} />
        <Link
          href="/dashboard"
          className="inline-flex min-h-10 items-center border border-line px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)] hover:text-text"
        >
          {COPY.doors.lookBack}
        </Link>
      </main>
    );
  }

  const look = resolveAreaLook(area);
  const sealedByDay = new Map(data.days.map((d) => [d.day, d]));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <Scrim className="flex flex-wrap items-baseline justify-between gap-4 rounded-xl border border-line p-6">
        <div>
          <h1 className="text-2xl font-normal tracking-tight text-text">{area.name}</h1>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
            orbit {look.archetype} · {areaTrackables.length} trackables
          </p>
        </div>
        <span className="font-mono text-xs text-text-dim">{area.slug}</span>
      </Scrim>

      {/* 60-night area strip */}
      <section
        aria-label="60-night area strip"
        className="rounded-xl border border-line bg-surface p-5"
      >
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-text-faint">
          60-night strip
        </p>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: 60 }, (_, idx) => {
            const d = addDays(today, idx - 59);
            const sealed = sealedByDay.get(d);
            const areaKeys = new Set(areaTrackables.map((t) => t.key));
            const areaRes = sealed?.results.filter((r) => areaKeys.has(r.key) && r.scored && r.status !== 'off') ?? [];
            const ratio =
              areaRes.length === 0
                ? null
                : areaRes.filter((r) => r.satisfied).length / areaRes.length;
            return (
              <span
                key={d}
                title={`${d}${ratio === null ? '' : `: ${Math.round(ratio * 100)}%`}`}
                className={`h-5 w-1.5 rounded-xs ${
                  !sealed
                    ? 'border border-line/50 bg-transparent'
                    : ratio === null
                      ? 'bg-line'
                      : ratio >= 0.8
                        ? 'bg-accent'
                        : ratio > 0
                          ? 'bg-accent-dim'
                          : 'bg-bg ring-1 ring-line'
                }`}
              />
            );
          })}
        </div>
      </section>

      {/* Per-trackable 28-night sparklines */}
      <section aria-label="Area trackables" className="space-y-3">
        {areaTrackables.map((t) => {
          const lens = lensFor(t);
          const series28 = Array.from({ length: 28 }, (_, idx) => {
            const day = addDays(today, idx - 27);
            const entry = data.entries.find((e) => e.day === day && e.key === t.key);
            if (entry && typeof entry.value === 'number' && Number.isFinite(entry.value)) {
              return entry.value;
            }
            const sealed = sealedByDay.get(day);
            const res = sealed?.results.find((r) => r.key === t.key);
            if (!res) return null;
            return res.satisfied ? 1 : 0;
          });

          return (
            <div
              key={t.key}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface p-5"
            >
              <div>
                <p className="text-base text-text">{t.label}</p>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-text-faint">
                  {t.kind} · {lens} lens
                </p>
              </div>

              <Sparkline values={series28} />
            </div>
          );
        })}
      </section>

      {/* Optional local goal */}
      <section
        aria-label="Goal projection"
        className="rounded-xl border border-line bg-surface p-6"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-line pb-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-faint">
            target pace
          </h2>
          <span className="font-mono text-[11px] text-text-faint">
            {COPY.status.localNotSynced}
          </span>
        </div>

        {!primaryNumeric ? (
          <p className="mt-4 text-sm text-text-dim">{COPY.status.noGoals}</p>
        ) : (
          <div className="mt-4 space-y-4">
            {goalEvaluation ? (
              <div className="flex flex-wrap items-baseline justify-between gap-4">
                <div>
                  <p className="text-sm text-text">
                    {goalEvaluation.label} → {areaGoal?.target}{' '}
                    {primaryNumeric.config.unit ?? ''}
                  </p>
                  <p className="mt-1 font-mono text-xs text-accent">
                    {COPY.pace[goalEvaluation.pace.status]}
                    {goalEvaluation.pace.etaDay ? ` · ${goalEvaluation.pace.etaDay}` : ''}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => updateCachedGoals(removeLocalGoal(primaryNumeric.key))}
                  className="font-mono text-[11px] uppercase tracking-[0.12em]"
                >
                  clear
                </Button>
              </div>
            ) : (
              <p className="text-sm text-text-dim">{COPY.status.noGoals}</p>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const parsed = Number(targetInput);
                if (!Number.isFinite(parsed)) return;
                const dir = primaryNumeric.rule?.op === 'lte' ? 'down' : 'up';
                const next = saveLocalGoal({
                  trackableKey: primaryNumeric.key,
                  target: parsed,
                  direction: dir,
                });
                updateCachedGoals(next);
                setTargetInput('');
              }}
              className="flex flex-wrap items-center gap-3"
            >
              <input
                type="number"
                step="0.1"
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                placeholder={`set ${primaryNumeric.label.toLowerCase()} target`}
                className="h-11 w-56 rounded-md border border-line bg-bg px-3 font-mono text-sm text-text outline-none focus:border-accent"
              />
              <Button
                type="submit"
                variant="outline"
                className="min-h-11 font-mono text-xs uppercase tracking-[0.12em]"
              >
                save target
              </Button>
            </form>
          </div>
        )}
      </section>
    </main>
  );
}
