import type { DomainEvent, State } from './events';

export const emptyState: State = { entries: {}, sealed: {} };

/** Fold one event into state. Throws on a log that violates an invariant. */
export function apply(state: State, event: DomainEvent): State {
  switch (event.type) {
    case 'entry_logged': {
      if (state.sealed[event.day]) {
        throw new Error(`invariant violated: entry logged on sealed day ${event.day}`);
      }
      return {
        ...state,
        entries: {
          ...state.entries,
          [event.day]: {
            ...state.entries[event.day],
            [event.key]: { value: event.value, version: event.version },
          },
        },
      };
    }
    case 'day_sealed': {
      if (state.sealed[event.day]) {
        throw new Error(`invariant violated: day ${event.day} sealed twice`);
      }
      return {
        ...state,
        sealed: {
          ...state.sealed,
          [event.day]: {
            day: event.day,
            sealedAt: event.at,
            score: event.score,
            results: event.results,
            reflection: event.reflection,
            streak: event.streak,
          },
        },
      };
    }
  }
}

export function replay(events: DomainEvent[]): State {
  return events.reduce(apply, emptyState);
}
