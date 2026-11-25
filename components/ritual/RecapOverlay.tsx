'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Mirror } from '@/components/chrome/Mirror';
import { SatorGlyph } from '@/components/chrome/SatorGlyph';
import { useTenetState } from '@/lib/api/hooks';
import type { ApiSealedDay, StateResponse } from '@/lib/api/types';
import { COPY } from '@/lib/copy';
import { useTenetStore, type RecapState } from '@/lib/store';
import { rig, subscribeRecapRig } from '@/lib/store/rig';
import { loadLocalGoals } from '@/lib/viz/localGoals';
import { buildReviewForDay } from '@/lib/viz/review';
import { labelFor } from '@/lib/viz/ringLayout';

type RecapRigSnapshot = {
  beat: number;
  itemIndex: number;
  visibleLines: number;
  canSkip: boolean;
};

let lastSnap: RecapRigSnapshot = {
  beat: 1,
  itemIndex: -1,
  visibleLines: 0,
  canSkip: false,
};

function getRecapRigSnapshot(): RecapRigSnapshot {
  const beat = rig.recapBeat > 0 ? rig.recapBeat : 1;
  const itemIndex = rig.recapItemIndex;
  const visibleLines = rig.recapVisibleLines;
  const canSkip = rig.recapCanSkip;
  if (
    lastSnap.beat === beat &&
    lastSnap.itemIndex === itemIndex &&
    lastSnap.visibleLines === visibleLines &&
    lastSnap.canSkip === canSkip
  ) {
    return lastSnap;
  }
  lastSnap = { beat, itemIndex, visibleLines, canSkip };
  return lastSnap;
}

function getRecapRigServerSnapshot(): RecapRigSnapshot {
  return lastSnap;
}

function RecapDialog({
  recap,
  sealed,
  state,
  isInstant,
  skipRecap,
  endRecap,
}: {
  recap: NonNullable<RecapState>;
  sealed: ApiSealedDay;
  state: StateResponse;
  isInstant: boolean;
  skipRecap: () => void;
  endRecap: () => void;
}) {
  const rigState = useSyncExternalStore(
    subscribeRecapRig,
    getRecapRigSnapshot,
    getRecapRigServerSnapshot,
  );

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

  const results = sealed.results;
  const lines = review?.lines ?? [];

  const [canSkipFallback, setCanSkipFallback] = useState(false);

  const effectiveBeat = isInstant ? 5 : rigState.beat;
  const effectiveJudgedIndex = isInstant ? results.length : rigState.itemIndex;
  const effectiveVisibleLines = isInstant ? lines.length : rigState.visibleLines;
  const effectiveCanSkip = isInstant || rigState.canSkip || canSkipFallback;

  useEffect(() => {
    regionRef.current?.focus();
  }, []);

  useEffect(() => {
    if (isInstant) return;
    const id = window.setTimeout(() => setCanSkipFallback(true), 1500);
    return () => window.clearTimeout(id);
  }, [isInstant]);

  useEffect(() => {
    if (effectiveBeat >= 5) {
      const id = window.setTimeout(() => doneLinkRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [effectiveBeat]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') return;
      if (effectiveBeat >= 5 && e.key === 'Escape') {
        e.preventDefault();
        endRecap();
        return;
      }
      if (!isInstant && effectiveCanSkip && effectiveBeat < 5) {
        if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          skipRecap();
        }
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (isInstant || !effectiveCanSkip || effectiveBeat >= 5) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('a, button')) return;
      skipRecap();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [effectiveBeat, effectiveCanSkip, endRecap, isInstant, skipRecap]);

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
            {effectiveBeat < 5 && effectiveCanSkip
              ? 'press space or esc to finish'
              : COPY.ritual.recapEnd}
          </span>
        </div>

        <div className="flex h-36 flex-col items-center justify-center">
          {effectiveBeat === 2 && activeJudge ? (
            <div className="space-y-1">
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
          )}
        </div>

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

        <div
          aria-hidden={effectiveBeat < 5}
          className={`flex flex-col items-center gap-5 border-t border-line pt-6 transition-opacity duration-[var(--duration-ui)] ease-[var(--ease-out)] ${
            effectiveBeat >= 5 ? 'opacity-100' : 'pointer-events-none invisible opacity-0'
          }`}
        >
          <SatorGlyph compact caption={COPY.ritual.recapEnd} />
          <div className="flex items-center gap-3">
            <Link
              ref={doneLinkRef}
              tabIndex={effectiveBeat >= 5 ? 0 : -1}
              href="/dashboard"
              onClick={() => endRecap()}
              className="inline-flex min-h-11 items-center border border-accent/60 px-5 font-mono text-xs uppercase tracking-[0.14em] text-accent transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)] hover:bg-bg"
            >
              {COPY.doors.lookBack}
            </Link>
            <button
              type="button"
              tabIndex={effectiveBeat >= 5 ? 0 : -1}
              onClick={() => endRecap()}
              className="inline-flex min-h-11 items-center border border-line px-4 font-mono text-xs uppercase tracking-[0.14em] text-text-dim hover:text-text"
            >
              close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RecapOverlay() {
  const recap = useTenetStore((s) => s.recap);
  const skipRecap = useTenetStore((s) => s.skipRecap);
  const endRecap = useTenetStore((s) => s.endRecap);
  const quality = useTenetStore((s) => s.quality);
  const { data: state } = useTenetState();

  if (!recap || !state) return null;
  const sealed = state.days.find((d) => d.day === recap.day);
  if (!sealed) return null;

  const stagePaused =
    quality.reducedMotion || quality.lowPower || quality.level >= 4 || quality.webgl !== 'ok';
  const isInstant = stagePaused || recap.skipped;

  return (
    <RecapDialog
      key={recap.startedAt}
      recap={recap}
      sealed={sealed}
      state={state}
      isInstant={isInstant}
      skipRecap={skipRecap}
      endRecap={endRecap}
    />
  );
}
