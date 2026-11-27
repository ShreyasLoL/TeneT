'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useTenetStore } from '@/lib/store';
import { rig, subscribeCanvasReady } from '@/lib/store/rig';
import { ArrivalHud } from './ArrivalHud';
import { ForkTransitionOverlay } from './ForkTransitionOverlay';

/**
 * Keeps UI hidden on fork routes until the intro completes, or reveals
 * immediately when `?ui=1`, low-power, reduced-motion, or non-WebGL is active.
 */
export function UI({ children }: { children: ReactNode }) {
  const mode = useTenetStore((s) => s.mode);
  const introDone = useTenetStore((s) => s.introDone);
  const setIntroDone = useTenetStore((s) => s.setIntroDone);
  const webgl = useTenetStore((s) => s.quality.webgl);
  const lowPower = useTenetStore((s) => s.quality.lowPower);
  const reducedMotion = useTenetStore((s) => s.quality.reducedMotion);
  const [canvasReady, setCanvasReady] = useState(() => rig.canvasReady);

  useEffect(() => {
    if (rig.canvasReady || webgl !== 'ok' || reducedMotion) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCanvasReady(true);
      return;
    }
    const unsub = subscribeCanvasReady(() => {
      setCanvasReady(true);
    });
    const fallbackId = window.setTimeout(() => setCanvasReady(true), 450);
    return () => {
      unsub();
      window.clearTimeout(fallbackId);
    };
  }, [reducedMotion, webgl]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('ui') === '1' || lowPower || reducedMotion || webgl !== 'ok') {
      setIntroDone(true);
    }
  }, [lowPower, reducedMotion, setIntroDone, webgl]);

  const showUi =
    canvasReady && (mode !== 'fork' || introDone || lowPower || reducedMotion || webgl !== 'ok');

  return (
    <div
      className={`relative z-10 flex min-h-dvh flex-col transition-opacity duration-[var(--duration-ui)] ease-[var(--ease-out)] ${
        showUi ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      {children}
      <ForkTransitionOverlay />
      <ArrivalHud />
    </div>
  );
}
