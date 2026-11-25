'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useTenetStore } from '@/lib/store';
import { rig, subscribeCanvasReady } from '@/lib/store/rig';

/**
 * Fades UI in only after the WebGL canvas has rendered its first frame
 * (or immediately if WebGL is unavailable / reduced-motion is active),
 * preventing any first-frame flash over `--bg`.
 */
export function UI({ children }: { children: ReactNode }) {
  const webgl = useTenetStore((s) => s.quality.webgl);
  const reducedMotion = useTenetStore((s) => s.quality.reducedMotion);
  const [visible, setVisible] = useState(() => rig.canvasReady);

  useEffect(() => {
    if (rig.canvasReady || webgl !== 'ok' || reducedMotion) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(true);
      return;
    }
    const unsub = subscribeCanvasReady(() => {
      setVisible(true);
    });
    // Safety fallback if GPU context creation stalls on headless/restricted drivers
    const fallbackId = window.setTimeout(() => setVisible(true), 450);
    return () => {
      unsub();
      window.clearTimeout(fallbackId);
    };
  }, [reducedMotion, webgl]);

  return (
    <div
      className={`relative z-10 flex min-h-dvh flex-col transition-opacity duration-[var(--duration-ui)] ease-[var(--ease-out)] ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {children}
    </div>
  );
}
