'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { detectInitialLevel, detectWebGL2Support } from '@/lib/stage/tiers';
import { useTenetStore } from '@/lib/store';

const LazyStageCanvas = dynamic(() => import('./StageCanvas'), {
  ssr: false,
  loading: () => null,
});

export function Stage() {
  const [ready, setReady] = useState(false);
  const quality = useTenetStore((s) => s.quality);
  const setQuality = useTenetStore((s) => s.setQuality);

  useEffect(() => {
    const hasWebGL2 = detectWebGL2Support();
    const initial = detectInitialLevel();
    setQuality({
      webgl: hasWebGL2 ? 'ok' : 'none',
      level: useTenetStore.getState().quality.lowPower ? 4 : initial,
    });

    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    let cancelled = false;
    let idleId: number | null = null;
    let timerId: number | null = null;
    const rafId = window.requestAnimationFrame(() => {
      if (cancelled) return;
      if (typeof w.requestIdleCallback === 'function') {
        idleId = w.requestIdleCallback(() => {
          if (!cancelled) setReady(true);
        }, { timeout: 240 });
      } else {
        timerId = window.setTimeout(() => {
          if (!cancelled) setReady(true);
        }, 120);
      }
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
      if (idleId !== null) w.cancelIdleCallback?.(idleId);
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [setQuality]);

  if (!ready) return null;
  if (
    quality.lowPower ||
    quality.reducedMotion ||
    quality.level >= 4 ||
    quality.webgl !== 'ok'
  ) {
    return null;
  }

  return <LazyStageCanvas />;
}
