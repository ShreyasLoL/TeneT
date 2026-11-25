import { effectiveRule } from '@/lib/domain/rules';
import type { Trackable } from '@/lib/domain/types';

export function ruleLabel(t: Pick<Trackable, 'kind' | 'config' | 'rule'>): string {
  const rule = effectiveRule(t as Trackable);
  const unit = t.config.unit ? ` ${t.config.unit}` : t.kind === 'duration' ? ' min' : '';

  switch (rule.op) {
    case 'eq':
      return rule.value === true ? 'yes' : String(rule.value);
    case 'gte':
      return `≥ ${rule.value}${unit}`;
    case 'lte':
      return `≤ ${rule.value}${unit}`;
    case 'between':
      return `${rule.min}–${rule.max}${unit}`;
    case 'present':
      return 'logged';
    default: {
      const _exhaustive: never = rule;
      return _exhaustive;
    }
  }
}
