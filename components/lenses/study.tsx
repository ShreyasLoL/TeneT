'use client';

import { DurationDial } from '@/components/ritual/controls/DurationDial';
import { ChoiceSet } from '@/components/ritual/controls/ChoiceSet';
import { NoteField } from '@/components/ritual/controls/NoteField';
import { RatingPips } from '@/components/ritual/controls/RatingPips';
import { effectiveRule } from '@/lib/domain/rules';
import type { Trackable } from '@/lib/domain/types';

type StudySibling = {
  trackable: Trackable;
  value: unknown;
  onChange: (next: unknown) => void;
};

type StudyLensProps = {
  trackable: Trackable;
  value: number | undefined;
  disabled?: boolean;
  onChange: (minutes: number) => void;
  siblings?: ReadonlyArray<StudySibling>;
};

export function StudyLens({
  trackable,
  value,
  disabled = false,
  onChange,
  siblings = [],
}: StudyLensProps) {
  const rule = effectiveRule(trackable);

  return (
    <div className="space-y-4">
      <DurationDial
        value={value}
        rule={rule}
        disabled={disabled}
        label={trackable.label}
        onChange={onChange}
      />

      {siblings.length > 0 ? (
        <div className="space-y-3 border-t border-line pt-3">
          {siblings.map((sib) => (
            <div key={sib.trackable.key} className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-dim">
                {sib.trackable.label}
              </span>
              {sib.trackable.kind === 'rating' ? (
                <RatingPips
                  value={typeof sib.value === 'number' ? sib.value : undefined}
                  disabled={disabled}
                  label={sib.trackable.label}
                  onChange={sib.onChange}
                />
              ) : sib.trackable.kind === 'choice' ? (
                <ChoiceSet
                  value={typeof sib.value === 'string' ? sib.value : undefined}
                  options={sib.trackable.config.options ?? []}
                  disabled={disabled}
                  label={sib.trackable.label}
                  onChange={sib.onChange}
                />
              ) : sib.trackable.kind === 'note' ? (
                <NoteField
                  value={typeof sib.value === 'string' ? sib.value : undefined}
                  disabled={disabled}
                  label={sib.trackable.label}
                  onChange={sib.onChange}
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
