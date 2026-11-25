import type { QueryClient } from '@tanstack/react-query';
import type { DayKey } from '@/lib/domain/types';
import { postCommand } from './client';
import type { ApiEntry, StateResponse } from './types';

export type QueuedEntryWrite = {
  day: DayKey;
  key: string;
  version: number;
  value: unknown;
  queuedAt: number;
};

export type TenetSyncMessage =
  | { type: 'entry_logged'; entry: ApiEntry }
  | { type: 'day_sealed'; day: DayKey };

const OUTBOX_KEY = 'tenet.outbox.v1';
const SYNC_CHANNEL = 'tenet-sync';
const SYNC_STORAGE_FALLBACK_KEY = 'tenet.sync.pulse';

const outboxListeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedList: QueuedEntryWrite[] = [];
let channel: BroadcastChannel | null = null;

function notifyOutbox() {
  for (const cb of outboxListeners) cb();
}

function getStorage(custom?: Storage): Storage | undefined {
  if (custom) return custom;
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function readOutbox(storage?: Storage): QueuedEntryWrite[] {
  const store = getStorage(storage);
  if (!store) return [];
  try {
    const raw = store.getItem(OUTBOX_KEY);
    if (!raw) {
      cachedRaw = null;
      cachedList = [];
      return cachedList;
    }
    if (!storage && raw === cachedRaw) return cachedList;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter(
      (item): item is QueuedEntryWrite =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as QueuedEntryWrite).day === 'string' &&
        typeof (item as QueuedEntryWrite).key === 'string' &&
        typeof (item as QueuedEntryWrite).version === 'number',
    );
    if (!storage) {
      cachedRaw = raw;
      cachedList = valid;
    }
    return valid;
  } catch {
    return [];
  }
}

function writeOutbox(items: QueuedEntryWrite[], storage?: Storage) {
  const store = getStorage(storage);
  if (!store) return;
  try {
    const raw = items.length === 0 ? null : JSON.stringify(items);
    if (raw === null) {
      store.removeItem(OUTBOX_KEY);
    } else {
      store.setItem(OUTBOX_KEY, raw);
    }
    if (!storage) {
      cachedRaw = raw;
      cachedList = items;
      notifyOutbox();
    }
  } catch {
    // ignore storage quota errors
  }
}

/** Coalesces queued offline writes by `(day, key)` while preserving first-seen order. */
export function enqueueOutboxEntry(item: QueuedEntryWrite, storage?: Storage): QueuedEntryWrite[] {
  const current = [...readOutbox(storage)];
  const idx = current.findIndex((x) => x.day === item.day && x.key === item.key);
  if (idx >= 0) {
    current[idx] = item;
  } else {
    current.push(item);
  }
  writeOutbox(current, storage);
  return current;
}

export function clearOutboxEntry(day: DayKey, key: string, storage?: Storage): QueuedEntryWrite[] {
  const next = readOutbox(storage).filter((x) => !(x.day === day && x.key === key));
  writeOutbox(next, storage);
  return next;
}

export async function replayOutbox(
  sender: (item: QueuedEntryWrite) => Promise<void>,
  storage?: Storage,
): Promise<{ sent: number; remaining: number }> {
  const queue = readOutbox(storage);
  if (queue.length === 0) return { sent: 0, remaining: 0 };

  let sent = 0;
  const failed: QueuedEntryWrite[] = [];
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    try {
      await sender(item);
      sent++;
    } catch {
      failed.push(...queue.slice(i));
      break;
    }
  }
  writeOutbox(failed, storage);
  return { sent, remaining: failed.length };
}

export function subscribeOutbox(cb: () => void): () => void {
  outboxListeners.add(cb);
  if (typeof window === 'undefined') {
    return () => {
      outboxListeners.delete(cb);
    };
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === OUTBOX_KEY) cb();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    outboxListeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!channel) {
    try {
      channel = new BroadcastChannel(SYNC_CHANNEL);
    } catch {
      channel = null;
    }
  }
  return channel;
}

export function broadcastTenetSync(msg: TenetSyncMessage) {
  const bc = getChannel();
  if (bc) {
    try {
      bc.postMessage(msg);
    } catch {
      // ignore broadcast errors
    }
  }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        SYNC_STORAGE_FALLBACK_KEY,
        JSON.stringify({ msg, ts: Date.now() }),
      );
    } catch {
      // ignore storage errors
    }
  }
}

export function subscribeTenetSync(onMessage: (msg: TenetSyncMessage) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const bc = getChannel();
  const onBc = (e: MessageEvent<TenetSyncMessage>) => {
    if (e.data && typeof e.data === 'object' && 'type' in e.data) {
      onMessage(e.data);
    }
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== SYNC_STORAGE_FALLBACK_KEY || !e.newValue) return;
    try {
      const parsed = JSON.parse(e.newValue) as { msg?: TenetSyncMessage };
      if (parsed.msg) onMessage(parsed.msg);
    } catch {
      // ignore malformed payload
    }
  };

  bc?.addEventListener('message', onBc);
  window.addEventListener('storage', onStorage);
  return () => {
    bc?.removeEventListener('message', onBc);
    window.removeEventListener('storage', onStorage);
  };
}

export function startTenetSyncRuntime(
  queryClient: QueryClient,
  setOfflineState: (offline: boolean, queuedCount: number) => void,
): () => void {
  let retryTimer: number | null = null;
  let backoffMs = 2_000;

  const refreshStatus = () => {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    setOfflineState(offline, readOutbox().length);
  };

  const flushQueued = async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      refreshStatus();
      return;
    }
    const res = await replayOutbox(async (item) => {
      await postCommand({
        type: 'log_entry',
        day: item.day,
        key: item.key,
        value: item.value,
      });
      broadcastTenetSync({
        type: 'entry_logged',
        entry: {
          day: item.day,
          key: item.key,
          version: item.version,
          value: item.value,
        },
      });
    });
    refreshStatus();
    if (res.remaining > 0) {
      retryTimer = window.setTimeout(() => void flushQueued(), backoffMs);
      backoffMs = Math.min(30_000, backoffMs * 2);
    } else {
      backoffMs = 2_000;
      if (res.sent > 0) {
        void queryClient.invalidateQueries({ queryKey: ['tenet', 'state'] });
      }
    }
  };

  const cleanupOutbox = subscribeOutbox(refreshStatus);
  const cleanupSync = subscribeTenetSync((msg) => {
    if (msg.type === 'entry_logged') {
      const queries = queryClient.getQueriesData<StateResponse>({
        queryKey: ['tenet', 'state'],
      });
      for (const [key, data] of queries) {
        if (!data) continue;
        const filtered = data.entries.filter(
          (e) => !(e.day === msg.entry.day && e.key === msg.entry.key),
        );
        filtered.push(msg.entry);
        queryClient.setQueryData<StateResponse>(key, { ...data, entries: filtered });
      }
    } else if (msg.type === 'day_sealed') {
      void queryClient.invalidateQueries({ queryKey: ['tenet', 'state'] });
    }
  });

  const onOnline = () => {
    backoffMs = 2_000;
    refreshStatus();
    void flushQueued();
  };
  const onOffline = () => refreshStatus();

  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  refreshStatus();
  if (readOutbox().length > 0) {
    void flushQueued();
  }

  return () => {
    cleanupSync();
    cleanupOutbox();
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    if (retryTimer !== null) window.clearTimeout(retryTimer);
  };
}
