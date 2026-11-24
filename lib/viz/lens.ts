import { effectiveRule } from '@/lib/domain/rules';
import type { Trackable } from '@/lib/domain/types';

export type LensKind = 'workout' | 'study' | 'generic';

/**
 * Determine rich display lens purely from trackable structure (never hardcoded habit names).
 */
export function lensFor(t: Pick<Trackable, 'kind' | 'config' | 'rule'>): LensKind {
  if (t.kind === 'log' && (t.config.fields?.length ?? 0) > 0) {
    return 'workout';
  }
  if (t.kind === 'duration' && effectiveRule(t as Trackable).op === 'gte') {
    return 'study';
  }
  return 'generic';
}
