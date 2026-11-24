import type { Kind, Rule, Trackable } from './types';

export function defaultRule(kind: Kind): Rule {
  switch (kind) {
    case 'check':
      return { op: 'eq', value: true };
    case 'count':
    case 'duration':
    case 'queue':
      return { op: 'gte', value: 1 };
    default:
      return { op: 'present' };
  }
}

export function effectiveRule(t: Trackable): Rule {
  return t.rule ?? defaultRule(t.kind);
}

function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** Does `value` satisfy `rule`? Type mismatches are simply "not satisfied". */
export function evaluate(rule: Rule, value: unknown): boolean {
  switch (rule.op) {
    case 'present':
      return isPresent(value);
    case 'eq':
      return value === rule.value;
    case 'gte':
      return typeof value === 'number' && Number.isFinite(value) && value >= rule.value;
    case 'lte':
      return typeof value === 'number' && Number.isFinite(value) && value <= rule.value;
    case 'between':
      return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= rule.min &&
        value <= rule.max
      );
  }
}
