import type { Trackable } from './types';

/** Test helper: build a trackable with neutral defaults. Not used in app code. */
export function makeTrackable(over: Partial<Trackable> & Pick<Trackable, 'key'>): Trackable {
  return {
    version: 1,
    kind: 'check',
    label: over.key,
    config: {},
    schedule: { type: 'daily' },
    weight: 1,
    scored: true,
    effectiveFrom: '2026-01-01',
    ...over,
  };
}
