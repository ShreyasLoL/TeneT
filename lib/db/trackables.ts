import type { Trackable } from '@/lib/domain/types';
import type { trackables } from './schema';

type TrackableRow = typeof trackables.$inferSelect;

export function toTrackable(row: TrackableRow): Trackable {
  return {
    key: row.key,
    version: row.version,
    kind: row.kind as Trackable['kind'],
    label: row.label,
    config: row.config,
    schedule: row.schedule,
    rule: row.rule ?? undefined,
    weight: row.weight,
    scored: row.scored,
    effectiveFrom: row.effectiveFrom,
    archivedFrom: row.archivedFrom ?? undefined,
  };
}
