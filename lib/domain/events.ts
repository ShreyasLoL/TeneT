import type { TrackableResult } from './score';
import type { DayKey, Trackable } from './types';

export type DomainEvent =
  | {
      type: 'entry_logged';
      at: string;
      day: DayKey;
      key: string;
      version: number;
      value: unknown;
    }
  | {
      type: 'day_sealed';
      at: string;
      day: DayKey;
      score: number | null;
      results: TrackableResult[];
      reflection?: string;
      streak: number;
    };

export type Command =
  | { type: 'log_entry'; day: DayKey; key: string; value: unknown }
  | { type: 'seal_day'; day: DayKey; reflection?: string };

export type EntryRecord = { value: unknown; version: number };

export type SealedDay = {
  day: DayKey;
  sealedAt: string;
  score: number | null;
  results: TrackableResult[];
  reflection?: string;
  streak: number;
};

export type State = {
  entries: Record<DayKey, Record<string, EntryRecord>>;
  sealed: Record<DayKey, SealedDay>;
};

export type DecideContext = {
  /** Every version of every trackable. */
  trackables: Trackable[];
  now: Date;
  tz?: string;
  cutoffHour?: number;
  /**
   * How many past days may still be logged/sealed. Default 0: only the current
   * logical day is open, so a missed night stays a visible gap.
   */
  backfillDays?: number;
};

export type DomainErrorCode =
  | 'invalid_day'
  | 'future_day'
  | 'day_not_open'
  | 'day_sealed'
  | 'unknown_trackable'
  | 'invalid_value'
  | 'invalid_reflection';

export type DomainError = { code: DomainErrorCode; message: string };

export type Result<T> = { ok: true; value: T } | { ok: false; error: DomainError };
