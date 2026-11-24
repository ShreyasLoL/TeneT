import { z } from 'zod';
import { KINDS } from '@/lib/domain/types';

export const areaSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  look: z.record(z.string(), z.unknown()),
  position: z.number(),
  archivedAt: z.string().nullable(),
});

export const goalSchema = z.object({
  id: z.string(),
  areaId: z.string(),
  kind: z.string(),
  title: z.string(),
  config: z.record(z.string(), z.unknown()),
  deadline: z.string().nullable(),
  createdAt: z.string(),
});

const fieldDefSchema = z.object({
  key: z.string(),
  type: z.enum(['number', 'text', 'bool']),
  optional: z.boolean().optional(),
});

const scheduleSchema = z.union([
  z.object({ type: z.literal('daily') }),
  z.object({ type: z.literal('n_per_week'), n: z.number() }),
  z.object({ type: z.literal('weekdays'), days: z.array(z.number()) }),
]);

const ruleSchema = z.union([
  z.object({ op: z.literal('eq'), value: z.union([z.boolean(), z.number(), z.string()]) }),
  z.object({ op: z.literal('gte'), value: z.number() }),
  z.object({ op: z.literal('lte'), value: z.number() }),
  z.object({ op: z.literal('between'), min: z.number(), max: z.number() }),
  z.object({ op: z.literal('present') }),
]);

export const apiTrackableSchema = z.object({
  key: z.string(),
  version: z.number(),
  kind: z.enum(KINDS),
  label: z.string(),
  config: z.object({
    unit: z.string().optional(),
    options: z.array(z.string()).optional(),
    fields: z.array(fieldDefSchema).optional(),
  }),
  schedule: scheduleSchema,
  rule: ruleSchema.optional(),
  weight: z.number(),
  scored: z.boolean(),
  effectiveFrom: z.string(),
  archivedFrom: z.string().optional(),
  areaId: z.string(),
  areaSlug: z.string(),
  goalId: z.string().nullable(),
});

export const entrySchema = z.object({
  day: z.string(),
  key: z.string(),
  version: z.number(),
  value: z.unknown(),
});

export const trackableResultSchema = z.object({
  key: z.string(),
  version: z.number(),
  status: z.enum(['required', 'optional', 'off']),
  satisfied: z.boolean(),
  weight: z.number(),
  scored: z.boolean(),
});

export const sealedDaySchema = z.object({
  day: z.string(),
  sealedAt: z.string(),
  score: z.number().nullable(),
  results: z.array(trackableResultSchema),
  reflection: z.string().nullable(),
  streak: z.number(),
});

export const definitionsResponseSchema = z.object({
  ok: z.literal(true),
  areas: z.array(areaSchema),
  goals: z.array(goalSchema),
  trackables: z.array(apiTrackableSchema),
});

export const stateResponseSchema = z.object({
  ok: z.literal(true),
  range: z.object({ from: z.string(), to: z.string() }),
  definitions: z.object({
    areas: z.array(areaSchema),
    goals: z.array(goalSchema),
    trackables: z.array(apiTrackableSchema),
  }),
  entries: z.array(entrySchema),
  days: z.array(sealedDaySchema),
});

const domainEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('entry_logged'),
    at: z.string(),
    day: z.string(),
    key: z.string(),
    version: z.number(),
    value: z.unknown(),
  }),
  z.object({
    type: z.literal('day_sealed'),
    at: z.string(),
    day: z.string(),
    score: z.number().nullable(),
    results: z.array(trackableResultSchema),
    reflection: z.string().optional(),
    streak: z.number(),
  }),
]);

export const commandSuccessResponseSchema = z.object({
  ok: z.literal(true),
  events: z.array(domainEventSchema),
});

export const apiErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.enum([
      'invalid_day',
      'future_day',
      'day_not_open',
      'day_sealed',
      'unknown_trackable',
      'invalid_value',
      'invalid_reflection',
      'invalid_request',
      'invalid_json',
      'invalid_range',
      'database_error',
    ]),
    message: z.string(),
    issues: z
      .array(
        z.object({
          path: z.array(z.union([z.string(), z.number()])),
          message: z.string(),
        }),
      )
      .optional(),
  }),
});
