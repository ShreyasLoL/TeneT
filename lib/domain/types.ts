// Shared domain types. Pure TypeScript: no React, Next, DB or I/O in lib/domain.

/** A calendar day in the user's logical timezone, formatted YYYY-MM-DD. */
export type DayKey = string;

export const KINDS = [
  'check',
  'count',
  'measure',
  'duration',
  'rating',
  'choice',
  'note',
  'log',
  'queue',
] as const;
export type Kind = (typeof KINDS)[number];

export type FieldDef = {
  key: string;
  type: 'number' | 'text' | 'bool';
  optional?: boolean;
};

export type TrackableConfig = {
  unit?: string;
  /** For kind 'choice': allowed values. */
  options?: string[];
  /** For kind 'log': row field definitions. */
  fields?: FieldDef[];
};

/** ISO weekdays: 1 = Monday ... 7 = Sunday. */
export type Schedule =
  | { type: 'daily' }
  | { type: 'n_per_week'; n: number }
  | { type: 'weekdays'; days: number[] };

export type Rule =
  | { op: 'eq'; value: boolean | number | string }
  | { op: 'gte'; value: number }
  | { op: 'lte'; value: number }
  | { op: 'between'; min: number; max: number }
  | { op: 'present' };

export type Trackable = {
  key: string;
  version: number;
  kind: Kind;
  label: string;
  config: TrackableConfig;
  schedule: Schedule;
  /** Omit to use the kind's default rule. */
  rule?: Rule;
  weight: number;
  /** false = track it, never judge it. */
  scored: boolean;
  /** First day this version applies (edits take effect from the next day). */
  effectiveFrom: DayKey;
  /** From this day on, the trackable no longer applies. */
  archivedFrom?: DayKey;
};

/** Whether a trackable counts on a given night. */
export type DueStatus = 'required' | 'optional' | 'off';

/** Did the given trackable satisfy its rule on the given (earlier) day? */
export type SatisfiedOn = (key: string, day: DayKey) => boolean;
