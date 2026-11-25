import { describe, expect, it } from 'vitest';
import {
  clearOutboxEntry,
  enqueueOutboxEntry,
  readOutbox,
  replayOutbox,
} from './sync';

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => {
      map.delete(k);
    },
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

describe('offline entry outbox', () => {
  it('coalesces duplicate (day, key) entries and replays in FIFO order with partial-failure retention', async () => {
    const store = createMemoryStorage();
    enqueueOutboxEntry(
      { day: '2026-11-25', key: 'session', version: 1, value: false, queuedAt: 1 },
      store,
    );
    enqueueOutboxEntry(
      { day: '2026-11-25', key: 'drills', version: 1, value: 2, queuedAt: 2 },
      store,
    );
    // Coalesce 'session' to true at index 0
    enqueueOutboxEntry(
      { day: '2026-11-25', key: 'session', version: 1, value: true, queuedAt: 3 },
      store,
    );

    const queued = readOutbox(store);
    expect(queued).toHaveLength(2);
    expect(queued[0]).toMatchObject({ key: 'session', value: true });
    expect(queued[1]).toMatchObject({ key: 'drills', value: 2 });

    // First item succeeds, second fails -> second stays in outbox
    const delivered: string[] = [];
    const firstPass = await replayOutbox(async (item) => {
      if (item.key === 'drills') throw new Error('offline');
      delivered.push(`${item.key}:${String(item.value)}`);
    }, store);

    expect(firstPass).toEqual({ sent: 1, remaining: 1 });
    expect(delivered).toEqual(['session:true']);
    expect(readOutbox(store)).toHaveLength(1);

    // Reconnect -> second item succeeds and outbox empties
    const secondPass = await replayOutbox(async (item) => {
      delivered.push(`${item.key}:${String(item.value)}`);
    }, store);

    expect(secondPass).toEqual({ sent: 1, remaining: 0 });
    expect(readOutbox(store)).toEqual([]);

    enqueueOutboxEntry(
      { day: '2026-11-25', key: 'note', version: 1, value: 'ok', queuedAt: 4 },
      store,
    );
    clearOutboxEntry('2026-11-25', 'note', store);
    expect(readOutbox(store)).toEqual([]);
  });
});
