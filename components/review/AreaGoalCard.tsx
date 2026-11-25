'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import type { ApiEntry, ApiTrackable } from '@/lib/api/types';
import { COPY } from '@/lib/copy';
import {
  evaluateLocalGoal,
  loadLocalGoals,
  removeLocalGoal,
  saveLocalGoal,
  type LocalGoal,
} from '@/lib/viz/localGoals';

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

export function AreaGoalCard({
  primaryNumeric,
  entries,
  trackables,
}: {
  primaryNumeric: ApiTrackable | null;
  entries: ReadonlyArray<ApiEntry>;
  trackables: ReadonlyArray<ApiTrackable>;
}) {
  const localGoals = useSyncExternalStore(
    subscribeGoals,
    getGoalsSnapshot,
    getGoalsServerSnapshot,
  );
  const [targetInput, setTargetInput] = useState('');

  const areaGoal = useMemo(
    () =>
      primaryNumeric
        ? localGoals.find((g) => g.trackableKey === primaryNumeric.key) ?? null
        : null,
    [localGoals, primaryNumeric],
  );

  const goalEvaluation = useMemo(() => {
    if (!areaGoal) return null;
    return evaluateLocalGoal(areaGoal, entries, trackables);
  }, [areaGoal, entries, trackables]);

  return (
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
              className="h-11 w-full rounded-md border border-line bg-bg px-3 font-mono text-base text-text outline-none focus:border-accent sm:w-72 sm:text-sm"
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
  );
}
