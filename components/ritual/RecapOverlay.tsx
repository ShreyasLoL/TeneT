'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Mirror } from '@/components/chrome/Mirror';
import { SatorGlyph } from '@/components/chrome/SatorGlyph';
import { useTenetState } from '@/lib/api/hooks';
import type { ApiSealedDay, StateResponse } from '@/lib/api/types';
import { COPY } from '@/lib/copy';
import { useTenetStore, type RecapState } from '@/lib/store';
import { loadLocalGoals } from '@/lib/viz/localGoals';
import { buildReviewForDay } from '@/lib/viz/review';
import { labelFor } from '@/lib/viz/ringLayout';

function RecapDialog({
  recap,
  sealed,
  state,
  reducedMotion,
  skipRecap,
  endRecap,
}: {
  recap: NonNullable<RecapState>;
  sealed: ApiSealedDay;
  state: StateResponse;
  reducedMotion: boolean;
  skipRecap: () => void;
  endRecap: () => void;
}) {
  const [beat, setBeat] = useState<number>(1);
  const [visibleLines, setVisibleLines] = useState<number>(0);
  const [judgedIndex, setJudgedIndex] = useState<number>(-1);
  const [canSkip, setCanSkip] = useState<boolean>(false);

  const regionRef = useRef<HTMLDivElement>(null);
  const doneLinkRef = useRef<HTMLAnchorElement>(null);

  const review = useMemo(
    () =>
      buildReviewForDay({
        day: recap.day,
        days: state.days,
        trackables: state.definitions.trackables,
        entries: state.entries,
        localGoals: loadLocalGoals(),
      }),
    [recap.day, state.days, state.definitions.trackables, state.entries],
  );

  const results = useMemo(() => sealed.results, [sealed.results]);
  const lines = useMemo(() => review?.lines ?? [], [review]);
  const isInstant = reducedMotion || recap.skipped;

  useEffect(() => {
    regionRef.current?.focus();
    if (isInstant) return;

    const timers: number[] = [];
    timers.push(window.setTimeout(() => setCanSkip(true), 1500));

    const beat2Ms = Math.min(2600, Math.max(1200, results.length * 340));
    const beat3Ms = 1800;
    const beat4Ms = Math.min(2700, Math.max(900, lines.length * 900));

    timers.push(
      window.setTimeout(() => {
        setBeat(2);
        const perItem = beat2Ms / Math.max(1, results.length);
        for (let i = 0; i < results.length; i++) {
          timers.push(window.setTimeout(() => setJudgedIndex(i), Math.round(i * perItem)));
        }
      }, 900),
    );

    timers.push(window.setTimeout(() => setBeat(3), 900 + beat2Ms));

    timers.push(
      window.setTimeout(() => {
        setBeat(4);
        const perLine = beat4Ms / Math.max(1, lines.length);
        for (let i = 0; i < lines.length; i++) {
          timers.push(window.setTimeout(() => setVisibleLines(i + 1), Math.round(i * perLine)));
        }
      }, 900 + beat2Ms + beat3Ms),
    );

    timers.push(
      window.setTimeout(() => {
        setBeat(5);
        setVisibleLines(lines.length);
        doneLinkRef.current?.focus();
      }, 900 + beat2Ms + beat3Ms + beat4Ms),
    );

    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [isInstant, lines.length, results.length]);

  useEffect(() => {
    if (isInstant) return;
    const onSkip = (e: KeyboardEvent | PointerEvent) => {
      if (!canSkip) return;
      if (e instanceof KeyboardEvent && e.key === 'Tab') return;
      skipRecap();
    };
    window.addEventListener('keydown', onSkip);
    window.addEventListener('pointerdown', onSkip);
    return () => {
      window.removeEventListener('keydown', onSkip);
      window.removeEventListener('pointerdown', onSkip);
    };
  }, [canSkip, isInstant, skipRecap]);

  const effectiveBeat = isInstant ? 5 : beat;
  const effectiveJudgedIndex = isInstant ? results.length : judgedIndex;
  const effectiveVisibleLines = isInstant ? lines.length : visibleLines;
  const effectiveCanSkip = isInstant ? true : canSkip;

  const activeJudge =
    effectiveJudgedIndex >= 0 && effectiveJudgedIndex < results.length
      ? results[effectiveJudgedIndex]
      : null;
  const focusPullResolved = effectiveBeat >= 3;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nightly seal recap"
      className="fixed inset-0 z-40 flex items-center justify-center bg-bg/85 px-6 py-10 transition-opacity duration-[var(--duration-ui)] ease-[var(--ease-out)]"
    >
      <div
        ref={regionRef}
        tabIndex={-1}
        aria-live="polite"
        className="w-full max-w-xl space-y-8 rounded-xl border border-line bg-surface p-8 text-center outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      >
        <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
          <span>{sealed.day}</span>
          <span>
            {effectiveBeat < 5 && effectiveCanSkip ? 'press any key to finish' : COPY.ritual.recapEnd}
          </span>
        </div>

        {effectiveBeat === 2 && activeJudge ? (
          <div className="min-h-16 space-y-1">
            <p className="text-lg text-text">
              {labelFor(activeJudge.key, { trackables: state.definitions.trackables })}
            </p>
            <p
              className={`font-mono text-xs uppercase tracking-[0.14em] ${
                activeJudge.status === 'off'
                  ? 'text-text-faint'
                  : activeJudge.satisfied
                    ? 'text-accent'
                    : 'text-text-dim'
              }`}
            >
              {activeJudge.status === 'off'
                ? 'rest'
                : activeJudge.satisfied
                  ? 'locked'
                  : 'missed'}
            </p>
          </div>
        ) : (
          <div className="py-2">
            <Mirror>
              <span
                className={`inline-block font-mono text-[clamp(4rem,12vw,7rem)] font-light leading-none text-text tabular-nums transition-[filter,letter-spacing,opacity] duration-[var(--duration-scene)] ease-[var(--ease-out)] ${
                  focusPullResolved
                    ? 'blur-0 tracking-[-0.04em] opacity-100'
                    : 'blur-[12px] tracking-[0.12em] opacity-40'
                }`}
              >
                {sealed.score === null ? '—' : sealed.score}
              </span>
            </Mirror>
          </div>
        )}

        <div className="min-h-24 space-y-2 text-sm text-text-dim">
          {lines.slice(0, effectiveVisibleLines).map((line, idx) => (
            <p
              key={idx}
              className="transition-opacity duration-[var(--duration-ui)] ease-[var(--ease-out)]"
            >
              {line}
            </p>
          ))}
        </div>

        {effectiveBeat >= 5 ? (
          <div className="flex flex-col items-center gap-5 border-t border-line pt-6">
            <SatorGlyph compact caption={COPY.ritual.recapEnd} />
            <div className="flex items-center gap-3">
              <Link
                ref={doneLinkRef}
                href="/dashboard"
                onClick={() => endRecap()}
                className="inline-flex min-h-11 items-center border border-accent/60 px-5 font-mono text-xs uppercase tracking-[0.14em] text-accent transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)] hover:bg-bg"
              >
                {COPY.doors.lookBack}
              </Link>
              <button
                type="button"
                onClick={() => endRecap()}
                className="inline-flex min-h-11 items-center border border-line px-4 font-mono text-xs uppercase tracking-[0.14em] text-text-dim hover:text-text"
              >
                close
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function RecapOverlay() {
  const recap = useTenetStore((s) => s.recap);
  const skipRecap = useTenetStore((s) => s.skipRecap);
  const endRecap = useTenetStore((s) => s.endRecap);
  const reducedMotion = useTenetStore((s) => s.quality.reducedMotion);
  const { data: state } = useTenetState();

  if (!recap || !state) return null;
  const sealed = state.days.find((d) => d.day === recap.day);
  if (!sealed) return null;

  return (
    <RecapDialog
      key={recap.startedAt}
      recap={recap}
      sealed={sealed}
      state={state}
      reducedMotion={reducedMotion}
      skipRecap={skipRecap}
      endRecap={endRecap}
    />
  );
}
