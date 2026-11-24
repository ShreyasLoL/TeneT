import type { DomainEvent } from '@/lib/domain/events';
import type { TrackableConfig } from '@/lib/domain/types';
import type { TrackableResult } from '@/lib/domain/score';
import type { Rule, Schedule } from '@/lib/domain/types';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  bigserial,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const areas = pgTable(
  'areas',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    look: jsonb('look').$type<Record<string, unknown>>().notNull().default({}),
    position: integer('position').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [unique('areas_user_slug_unique').on(table.userId, table.slug)],
);

export const goals = pgTable('goals', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  areaId: uuid('area_id').notNull().references(() => areas.id),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  deadline: date('deadline', { mode: 'string' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const trackables = pgTable(
  'trackables',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id),
    key: text('key').notNull(),
    version: integer('version').notNull(),
    areaId: uuid('area_id').notNull().references(() => areas.id),
    goalId: uuid('goal_id').references(() => goals.id),
    kind: text('kind').notNull(),
    label: text('label').notNull(),
    config: jsonb('config').$type<TrackableConfig>().notNull().default({}),
    schedule: jsonb('schedule').$type<Schedule>().notNull(),
    rule: jsonb('rule').$type<Rule | null>(),
    weight: numeric('weight', { mode: 'number' }).notNull(),
    scored: boolean('scored').notNull().default(true),
    effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
    archivedFrom: date('archived_from', { mode: 'string' }),
  },
  (table) => [unique('trackables_user_key_version_unique').on(table.userId, table.key, table.version)],
);

export const events = pgTable(
  'events',
  {
    seq: bigserial('seq', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id),
    day: date('day', { mode: 'string' }).notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<DomainEvent>().notNull(),
    at: timestamp('at', { withTimezone: true }).notNull(),
  },
  (table) => [index('events_user_day_idx').on(table.userId, table.day)],
);

export const entries = pgTable(
  'entries',
  {
    userId: uuid('user_id').notNull().references(() => users.id),
    day: date('day', { mode: 'string' }).notNull(),
    trackableKey: text('trackable_key').notNull(),
    trackableVersion: integer('trackable_version').notNull(),
    value: jsonb('value').$type<unknown>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.day, table.trackableKey] }),
    index('entries_user_day_idx').on(table.userId, table.day),
  ],
);

export const days = pgTable(
  'days',
  {
    userId: uuid('user_id').notNull().references(() => users.id),
    day: date('day', { mode: 'string' }).notNull(),
    sealedAt: timestamp('sealed_at', { withTimezone: true }).notNull(),
    score: integer('score'),
    results: jsonb('results').$type<TrackableResult[]>().notNull(),
    reflection: text('reflection'),
    streak: integer('streak').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.day] })],
);
