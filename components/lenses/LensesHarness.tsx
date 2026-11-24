'use client';

import { useState } from 'react';
import { StudyLens, WorkoutLens } from '@/components/lenses';
import type { Trackable } from '@/lib/domain/types';

const STUDY_FIXTURE: Trackable = {
  key: 'deep-focus',
  version: 1,
  kind: 'duration',
  label: 'Deep study',
  config: { unit: 'min' },
  schedule: { type: 'daily' },
  rule: { op: 'gte', value: 30 },
  weight: 2,
  scored: true,
  effectiveFrom: '2026-01-01',
};

const SIBLING_RATING: Trackable = {
  key: 'clarity',
  version: 1,
  kind: 'rating',
  label: 'Clarity',
  config: {},
  schedule: { type: 'daily' },
  weight: 1,
  scored: true,
  effectiveFrom: '2026-01-01',
};

const SIBLING_NOTE: Trackable = {
  key: 'focus-note',
  version: 1,
  kind: 'note',
  label: 'Session note',
  config: {},
  schedule: { type: 'daily' },
  weight: 1,
  scored: false,
  effectiveFrom: '2026-01-01',
};

const WORKOUT_FIXTURE: Trackable = {
  key: 'sets',
  version: 1,
  kind: 'log',
  label: 'Compound sets',
  config: {
    fields: [
      { key: 'movement', type: 'text' },
      { key: 'load', type: 'number' },
      { key: 'reps', type: 'number' },
      { key: 'clean', type: 'bool', optional: true },
    ],
  },
  schedule: { type: 'daily' },
  rule: { op: 'present' },
  weight: 2,
  scored: true,
  effectiveFrom: '2026-01-01',
};

export function LensesHarness() {
  const [studyMins, setStudyMins] = useState<number>(45);
  const [rating, setRating] = useState<unknown>(4);
  const [note, setNote] = useState<unknown>('clean proof review.');
  const [rows, setRows] = useState<unknown>([
    { movement: 'press', load: 72.5, reps: 5, clean: true },
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-8 px-4 py-8 sm:px-8">
      <div className="border-b border-line pb-4">
        <h1 className="text-2xl font-normal text-text">dev lenses harness</h1>
        <p className="mt-1 font-mono text-xs text-text-faint">
          exercises study and workout lenses against fixture schemas
        </p>
      </div>

      <section className="rounded-xl border border-line bg-surface p-6">
        <h2 className="mb-4 font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
          study lens
        </h2>
        <StudyLens
          trackable={STUDY_FIXTURE}
          value={studyMins}
          onChange={setStudyMins}
          siblings={[
            { trackable: SIBLING_RATING, value: rating, onChange: setRating },
            { trackable: SIBLING_NOTE, value: note, onChange: setNote },
          ]}
        />
      </section>

      <section className="rounded-xl border border-line bg-surface p-6">
        <h2 className="mb-4 font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
          workout lens
        </h2>
        <WorkoutLens
          trackable={WORKOUT_FIXTURE}
          value={rows}
          onChange={(next) => setRows(next)}
        />
      </section>
    </main>
  );
}
