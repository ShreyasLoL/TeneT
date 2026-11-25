import type { FieldDef, Trackable } from './types';

export type ValueValidationResult =
  | { ok: true; data: unknown }
  | { ok: false; message: string };

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function isValidFieldValue(f: FieldDef, val: unknown): ValueValidationResult {
  if (val === undefined) {
    return f.optional ? { ok: true, data: undefined } : { ok: false, message: `${f.key} is required` };
  }
  switch (f.type) {
    case 'number':
      return typeof val === 'number' && Number.isFinite(val)
        ? { ok: true, data: val }
        : { ok: false, message: 'must be a finite number' };
    case 'bool':
      return typeof val === 'boolean'
        ? { ok: true, data: val }
        : { ok: false, message: 'expected boolean' };
    case 'text':
      return typeof val === 'string' && val.length <= 500
        ? { ok: true, data: val }
        : { ok: false, message: 'expected text up to 500 characters' };
  }
}

function validateLogRows(t: Trackable, v: unknown): ValueValidationResult {
  if (!Array.isArray(v)) return { ok: false, message: 'expected list of rows' };
  if (v.length > 200) return { ok: false, message: 'at most 200 rows allowed' };

  const fields = t.config.fields;
  if (fields && fields.length > 0) {
    const fieldByKey = new Map(fields.map((f) => [f.key, f] as const));
    for (const row of v) {
      if (!isPlainRecord(row)) return { ok: false, message: 'invalid row' };
      for (const key of Object.keys(row)) {
        if (!fieldByKey.has(key)) {
          return { ok: false, message: `unrecognized field: ${key}` };
        }
      }
      for (const f of fields) {
        const res = isValidFieldValue(f, row[f.key]);
        if (!res.ok) return res;
      }
    }
    return { ok: true, data: v };
  }

  for (const row of v) {
    if (!isPlainRecord(row)) return { ok: false, message: 'invalid row' };
    for (const val of Object.values(row)) {
      const valid =
        (typeof val === 'number' && Number.isFinite(val)) ||
        (typeof val === 'string' && val.length <= 500) ||
        typeof val === 'boolean';
      if (!valid) return { ok: false, message: 'invalid cell value' };
    }
  }
  return { ok: true, data: v };
}

/**
 * Zero-dependency runtime validator matching `valueSchema(t).safeParse(v)` in `primitives.ts`.
 * Used in client UI bundles so Zod (~30 KB gz) stays server-only.
 */
export function validateTrackableValue(t: Trackable, v: unknown): ValueValidationResult {
  switch (t.kind) {
    case 'check':
      return typeof v === 'boolean'
        ? { ok: true, data: v }
        : { ok: false, message: 'expected boolean' };
    case 'count':
    case 'queue':
      return typeof v === 'number' && Number.isInteger(v) && v >= 0
        ? { ok: true, data: v }
        : { ok: false, message: 'expected non-negative integer' };
    case 'measure':
      return typeof v === 'number' && Number.isFinite(v)
        ? { ok: true, data: v }
        : { ok: false, message: 'must be a finite number' };
    case 'duration':
      return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1440
        ? { ok: true, data: v }
        : { ok: false, message: 'expected integer minutes between 0 and 1440' };
    case 'rating':
      return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5
        ? { ok: true, data: v }
        : { ok: false, message: 'expected integer rating from 1 to 5' };
    case 'choice': {
      if (typeof v !== 'string') return { ok: false, message: 'expected string option' };
      const options = t.config.options;
      if (options && options.length > 0) {
        return options.includes(v)
          ? { ok: true, data: v }
          : { ok: false, message: 'not an allowed option' };
      }
      return v.length <= 200
        ? { ok: true, data: v }
        : { ok: false, message: 'option exceeds 200 characters' };
    }
    case 'note':
      return typeof v === 'string' && v.length <= 2000
        ? { ok: true, data: v }
        : { ok: false, message: 'note exceeds 2000 characters' };
    case 'log':
      return validateLogRows(t, v);
    default: {
      const _exhaustive: never = t.kind;
      return { ok: false, message: String(_exhaustive) };
    }
  }
}
