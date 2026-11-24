import { z } from 'zod';
import type { FieldDef, Trackable } from './types';

const finite = z.number().refine(Number.isFinite, 'must be a finite number');

function fieldSchema(f: FieldDef) {
  const base =
    f.type === 'number' ? finite : f.type === 'bool' ? z.boolean() : z.string().max(500);
  return f.optional ? base.optional() : base;
}

function logSchema(t: Trackable) {
  const fields = t.config.fields;
  const row =
    fields && fields.length > 0
      ? z.object(Object.fromEntries(fields.map((f) => [f.key, fieldSchema(f)]))).strict()
      : z.record(z.string(), z.union([finite, z.string().max(500), z.boolean()]));
  return z.array(row).max(200);
}

/**
 * Build the Zod schema for a trackable's entry value from its definition.
 * Definitions are data, so this runs at runtime, never per hardcoded habit.
 */
export function valueSchema(t: Trackable) {
  switch (t.kind) {
    case 'check':
      return z.boolean();
    case 'count':
    case 'queue':
      return z.number().int().min(0);
    case 'measure':
      return finite;
    case 'duration':
      return z.number().int().min(0).max(1440);
    case 'rating':
      return z.number().int().min(1).max(5);
    case 'choice': {
      const options = t.config.options;
      return options && options.length > 0
        ? z.string().refine((v) => options.includes(v), 'not an allowed option')
        : z.string().max(200);
    }
    case 'note':
      return z.string().max(2000);
    case 'log':
      return logSchema(t);
  }
}
