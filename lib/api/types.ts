import type { DayKey, Trackable } from '@/lib/domain/types';
import type { TrackableResult } from '@/lib/domain/score';
import type { DomainError, DomainEvent } from '@/lib/domain/events';

export type ApiArea = {
  id: string;
  slug: string;
  name: string;
  look: Record<string, unknown>;
  position: number;
  archivedAt: string | null;
};

export type ApiGoal = {
  id: string;
  areaId: string;
  kind: string;
  title: string;
  config: Record<string, unknown>;
  deadline: string | null;
  createdAt: string;
};

export type ApiTrackable = Trackable & {
  areaId: string;
  areaSlug: string;
  goalId: string | null;
};

export type ApiEntry = {
  day: DayKey;
  key: string;
  version: number;
  value: unknown;
};

export type ApiSealedDay = {
  day: DayKey;
  sealedAt: string;
  score: number | null;
  results: TrackableResult[];
  reflection: string | null;
  streak: number;
};

export type DefinitionsResponse = {
  ok: true;
  areas: ApiArea[];
  goals: ApiGoal[];
  trackables: ApiTrackable[];
};

export type StateResponse = {
  ok: true;
  range: { from: DayKey; to: DayKey };
  definitions: {
    areas: ApiArea[];
    goals: ApiGoal[];
    trackables: ApiTrackable[];
  };
  entries: ApiEntry[];
  days: ApiSealedDay[];
};

export type CommandSuccessResponse = {
  ok: true;
  events: DomainEvent[];
};

export type ApiIssue = {
  path: (string | number)[];
  message: string;
};

export type ApiErrorResponse = {
  ok: false;
  error: {
    code: DomainError['code'] | 'invalid_request' | 'invalid_json' | 'invalid_range' | 'database_error';
    message: string;
    issues?: ApiIssue[];
  };
};
