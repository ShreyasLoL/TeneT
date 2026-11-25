'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import type { ApiTrackable } from '@/lib/api/types';
import { COPY } from '@/lib/copy';
import type { DayKey } from '@/lib/domain/types';
import type { RowSaveState } from './TrackableRow';

const IMMEDIATE_KINDS = new Set(['check', 'rating', 'choice']);
const COALESCE_MS = 150;

type PendingWrite = {
  trackable: ApiTrackable;
  value: unknown;
  timerId: number;
};

export function mapApiErrorCopy(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'day_sealed':
        return COPY.status.daySealed;
      case 'day_not_open':
        return COPY.status.dayNotOpen;
      case 'invalid_value':
        return COPY.status.invalidValue;
      case 'network_error':
        return COPY.status.networkError;
      case 'invalid_reflection':
        return error.message;
      default:
        return COPY.status.databaseError;
    }
  }
  return COPY.status.databaseError;
}

export function useEntryWriteQueue({
  today,
  isSealed,
  mutateEntry,
  refetch,
}: {
  today: DayKey;
  isSealed: boolean;
  mutateEntry: (input: {
    day: DayKey;
    key: string;
    version: number;
    value: unknown;
  }) => Promise<unknown>;
  refetch: () => Promise<unknown>;
}) {
  const [draftValues, setDraftValues] = useState<Record<string, unknown>>({});
  const [rowStates, setRowStates] = useState<Record<string, RowSaveState>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string | null>>({});

  const pendingTimersRef = useRef<Map<string, PendingWrite>>(new Map());
  const inFlightByKeyRef = useRef<Map<string, Promise<boolean>>>(new Map());
  const mountedRef = useRef(true);
  const sealedRef = useRef(isSealed);
  const mutateEntryRef = useRef(mutateEntry);
  const refetchRef = useRef(refetch);

  useEffect(() => {
    sealedRef.current = isSealed;
  }, [isSealed]);

  useEffect(() => {
    mutateEntryRef.current = mutateEntry;
  }, [mutateEntry]);

  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  const dispatchWrite = useCallback(
    (trackable: ApiTrackable, value: unknown): Promise<boolean> => {
      if (mountedRef.current) {
        setRowStates((prev) => ({ ...prev, [trackable.key]: 'saving' }));
        setRowErrors((prev) => ({ ...prev, [trackable.key]: null }));
      }

      const prevChain = inFlightByKeyRef.current.get(trackable.key) ?? Promise.resolve(true);
      const nextPromise = prevChain
        .catch(() => true)
        .then(async () => {
          try {
            await mutateEntryRef.current({
              day: today,
              key: trackable.key,
              version: trackable.version,
              value,
            });
            if (mountedRef.current) {
              setRowStates((prev) => ({ ...prev, [trackable.key]: 'saved' }));
            }
            return true;
          } catch (error) {
            if (error instanceof ApiError && error.code === 'network_error') {
              if (mountedRef.current) {
                setRowStates((prev) => ({ ...prev, [trackable.key]: 'saved' }));
              }
              return false;
            }
            if (mountedRef.current) {
              setRowStates((prev) => ({ ...prev, [trackable.key]: 'error' }));
              setRowErrors((prev) => ({ ...prev, [trackable.key]: mapApiErrorCopy(error) }));
            }
            if (error instanceof ApiError && error.code === 'day_sealed') {
              void refetchRef.current();
            }
            return false;
          }
        });

      const tracked = nextPromise.finally(() => {
        if (inFlightByKeyRef.current.get(trackable.key) === tracked) {
          inFlightByKeyRef.current.delete(trackable.key);
        }
      });
      inFlightByKeyRef.current.set(trackable.key, tracked);
      return tracked;
    },
    [today],
  );

  const flushKey = useCallback(
    (key: string) => {
      const pending = pendingTimersRef.current.get(key);
      if (!pending) return;
      window.clearTimeout(pending.timerId);
      pendingTimersRef.current.delete(key);
      void dispatchWrite(pending.trackable, pending.value);
    },
    [dispatchWrite],
  );

  const flushAllPending = useCallback(() => {
    for (const key of [...pendingTimersRef.current.keys()]) {
      flushKey(key);
    }
  }, [flushKey]);

  useEffect(() => {
    mountedRef.current = true;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushAllPending();
    };
    const onPageHide = () => flushAllPending();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      flushAllPending();
    };
  }, [flushAllPending]);

  const handleTrackableChange = useCallback(
    (trackable: ApiTrackable, value: unknown) => {
      if (sealedRef.current) return;
      setDraftValues((prev) => ({ ...prev, [trackable.key]: value }));

      const existing = pendingTimersRef.current.get(trackable.key);
      if (existing) {
        window.clearTimeout(existing.timerId);
        pendingTimersRef.current.delete(trackable.key);
      }

      if (IMMEDIATE_KINDS.has(trackable.kind)) {
        void dispatchWrite(trackable, value);
        return;
      }

      setRowStates((prev) => ({ ...prev, [trackable.key]: 'saving' }));
      const timerId = window.setTimeout(() => {
        pendingTimersRef.current.delete(trackable.key);
        void dispatchWrite(trackable, value);
      }, COALESCE_MS);
      pendingTimersRef.current.set(trackable.key, { trackable, value, timerId });
    },
    [dispatchWrite],
  );

  const flushAndAwaitAll = useCallback(async (): Promise<boolean> => {
    flushAllPending();
    const activeWrites = [...inFlightByKeyRef.current.values()];
    if (activeWrites.length === 0) return true;
    const outcomes = await Promise.all(activeWrites);
    return outcomes.every(Boolean);
  }, [flushAllPending]);

  return {
    draftValues,
    rowStates,
    rowErrors,
    handleTrackableChange,
    flushKey,
    flushAndAwaitAll,
  };
}
