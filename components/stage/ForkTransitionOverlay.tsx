'use client';

import { useEffect, useRef, useState } from 'react';
import { stageClock } from '@/lib/stage/clock';
import { rig, subscribeForkTransition } from '@/lib/store/rig';

/**
 * Persistent transition veil mounted in `<Stage>` so peak flash/veil covers the
 * route swap (`/` -> `/dashboard` cold ice-void vs `/` -> `/log` warm ignition flare)
 * without unmounting when `ForkView` exits.
 */
export function ForkTransitionOverlay() {
  const [mounted, setMounted] = useState(false);
  const veilRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let unsubClock: (() => void) | null = null;

    const startSync = () => {
      if (unsubClock) return;
      setMounted(true);
      unsubClock = stageClock.subscribe(() => {
        const el = veilRef.current;
        const flash = rig.forkFlash;
        if (el) {
          el.style.opacity = `${Math.min(1, Math.max(0, flash)).toFixed(3)}`;
          if (rig.forkMode < 0) {
            el.style.background =
              'radial-gradient(circle at 50% 50%, rgba(28, 72, 98, 0.38) 0%, var(--bg) 68%)';
          } else {
            el.style.background =
              'radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--accent) 42%, #FFF8F2) 0%, color-mix(in srgb, var(--status-warning) 24%, var(--bg)) 46%, var(--bg) 88%)';
          }
        }
        if (!rig.forkActive && flash <= 0.004) {
          unsubClock = null;
          setMounted(false);
          return false;
        }
        return true;
      });
    };

    const unsubRig = subscribeForkTransition(() => {
      if (rig.forkActive || rig.forkFlash > 0.004) {
        startSync();
      }
    });

    return () => {
      unsubRig();
      unsubClock?.();
    };
  }, []);

  if (!mounted) return null;

  return (
    <div
      ref={veilRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 opacity-0"
      style={{ willChange: 'opacity' }}
    />
  );
}
