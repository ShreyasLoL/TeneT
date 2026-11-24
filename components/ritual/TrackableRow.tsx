'use client';

import { useMemo, useState } from 'react';
import type { ApiTrackable } from '@/lib/api/types';
import { COPY } from '@/lib/copy';
import { addDays, isoWeekday, weekStart } from '@/lib/domain/day';
import { valueSchema } from '@/lib/domain/primitives';
import { effectiveRule } from '@/lib/domain/rules';
import type { DayKey, DueStatus, SatisfiedOn } from '@/lib/domain/types';
import { ruleLabel } from '@/lib/viz/ruleLabel';
import { ChoiceSet } from './controls/ChoiceSet';
import { DurationDial } from './controls/DurationDial';
import { EclipseCheck } from './controls/EclipseCheck';
import { MeasureField } from './controls/MeasureField';
import { NoteField } from './controls/NoteField';
import { RatingPips } from './controls/RatingPips';
import { Stepper } from './controls/Stepper';

export type RowSaveState = 'idle' | 'saving' | 'saved' | 'error';

type TrackableRowProps = {
  trackable: ApiTrackable;
  day: DayKey;
  status: DueStatus;
  satisfied: boolean;
  satisfiedOn: SatisfiedOn;
  value: unknown;
  disabled?: boolean;
  saveState?: RowSaveState;
  errorMessage?: string | null;
  onChange: (trackable: ApiTrackable, value: unknown) => void;
};

export function TrackableRow({
  trackable,
  day,
  status,
  satisfied,
  satisfiedOn,
  value,
  disabled = false,
  saveState = 'idle',
  errorMessage = null,
  onChange,
}: TrackableRowProps) {
  const [validationError, setValidationError] = useState<string | null>(null);
  const rule = useMemo(() => effectiveRule(trackable), [trackable]);
  const ruleText = useMemo(() => ruleLabel(trackable), [trackable]);

  const weeklyMeta = useMemo(() => {
    if (trackable.schedule.type !== 'n_per_week') return null;
    const n = Math.min(7, Math.max(1, Math.floor(trackable.schedule.n)));
    let done = 0;
    for (let d = weekStart(day); d < day; d = addDays(d, 1)) {
      if (satisfiedOn(trackable.key, d)) done++;
    }
    if (satisfied) done++;
    const daysLeft = 8 - isoWeekday(day);
    return `${done} of ${n} · ${daysLeft} nights left`;
  }, [day, satisfied, satisfiedOn, trackable.key, trackable.schedule]);

  const handleUpdate = (nextValue: unknown) => {
    const parsed = valueSchema(trackable).safeParse(nextValue);
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? COPY.status.invalidValue);
      return;
    }
    setValidationError(null);
    onChange(trackable, parsed.data);
  };

  const onRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      document.querySelector<HTMLElement>('[data-seal-trigger]')?.focus();
      return;
    }

    const target = e.target as HTMLElement;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const rows = [...document.querySelectorAll<HTMLElement>('[data-ritual-row]')];
      const idx = rows.indexOf(e.currentTarget);
      if (idx === -1) return;
      const next = rows[idx + (e.key === 'ArrowDown' ? 1 : -1)];
      if (next) {
        e.preventDefault();
        const focusable = next.querySelector<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        );
        (focusable ?? next).focus();
      }
    }
  };

  const isOff = status === 'off';
  const unloggedRequired = value === undefined && status === 'required';

  const renderControl = () => {
    switch (trackable.kind) {
      case 'check':
        return (
          <EclipseCheck
            checked={value === true}
            disabled={disabled}
            label={trackable.label}
            onChange={(next) => handleUpdate(next)}
          />
        );
      case 'count':
      case 'queue':
        return (
          <Stepper
            value={typeof value === 'number' ? value : undefined}
            disabled={disabled}
            label={trackable.label}
            onChange={(next) => handleUpdate(next)}
          />
        );
      case 'duration':
        return (
          <DurationDial
            value={typeof value === 'number' ? value : undefined}
            rule={rule}
            disabled={disabled}
            label={trackable.label}
            onChange={(next) => handleUpdate(next)}
          />
        );
      case 'measure':
        return (
          <MeasureField
            value={typeof value === 'number' ? value : undefined}
            unit={trackable.config.unit}
            disabled={disabled}
            label={trackable.label}
            onChange={(next) => handleUpdate(next)}
          />
        );
      case 'rating':
        return (
          <RatingPips
            value={typeof value === 'number' ? value : undefined}
            disabled={disabled}
            label={trackable.label}
            onChange={(next) => handleUpdate(next)}
          />
        );
      case 'choice':
        return (
          <ChoiceSet
            value={typeof value === 'string' ? value : undefined}
            options={trackable.config.options ?? []}
            disabled={disabled}
            label={trackable.label}
            onChange={(next) => handleUpdate(next)}
          />
        );
      case 'note':
        return (
          <NoteField
            value={typeof value === 'string' ? value : undefined}
            disabled={disabled}
            label={trackable.label}
            onChange={(next) => handleUpdate(next)}
          />
        );
      case 'log':
        return (
          <p className="font-mono text-xs text-text-dim tabular-nums">
            {Array.isArray(value) ? `${value.length} rows` : '0 rows'}
          </p>
        );
    }
  };

  return (
    <div
      data-ritual-row=""
      onKeyDown={onRowKeyDown}
      className={`flex flex-col gap-3 border-b border-line py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between ${
        isOff ? 'opacity-65' : ''
      }`}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[15px] font-normal text-text">{trackable.label}</span>
          <span className="font-mono text-[11px] text-text-faint">{ruleText}</span>
          <span
            className={`font-mono text-[11px] uppercase tracking-[0.12em] ${
              satisfied
                ? 'text-accent'
                : status === 'required'
                  ? 'text-text-dim'
                  : 'text-text-faint'
            }`}
          >
            {isOff ? COPY.ritual.restDay : satisfied ? 'met' : status}
          </span>
          {saveState === 'saved' ? (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
              <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
              {COPY.ritual.savedDot}
            </span>
          ) : saveState === 'saving' ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint">
              saving
            </span>
          ) : null}
        </div>

        {weeklyMeta ? (
          <p className="font-mono text-[11px] text-text-dim tabular-nums">{weeklyMeta}</p>
        ) : null}

        {unloggedRequired ? (
          <p className="font-mono text-[11px] text-text-faint">{COPY.ritual.unlogged}</p>
        ) : null}

        {validationError || errorMessage ? (
          <p role="alert" className="font-mono text-xs text-status-danger">
            {validationError ?? errorMessage}
          </p>
        ) : null}
      </div>

      <div className="shrink-0">{renderControl()}</div>
    </div>
  );
}
