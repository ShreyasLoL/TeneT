'use client';

import { useEffect, useRef, useState } from 'react';
import { stageClock } from '@/lib/stage/clock';
import { rig, subscribeForkTransition } from '@/lib/store/rig';

/**
 * Minimalist obsidian veil + single 1px horizon hairline mounted in `<Stage>`
 * so route swaps (`/` -> `/dashboard` or `/log`) stay visually seamless.
 */
export function ForkTransitionOverlay() {
  const [mounted, setMounted] = useState(false);
  const veilRef = useRef<HTMLDivElement | null>(null);
  const lineRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let unsubClock: (() => void) | null = null;

    const startSync = () => {
      if (unsubClock) return;
      setMounted(true);
      const reduced =
        typeof window !== 'undefined' &&
        (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

      unsubClock = stageClock.subscribe(() => {
        const el = veilRef.current;
        const lineEl = lineRef.current;
        const flash = rig.forkFlash;
        const clampedFlash = Math.min(1, Math.max(0, flash));

        if (el) {
          el.style.opacity = clampedFlash.toFixed(3);
        }
        if (lineEl) {
          if (reduced) {
            lineEl.style.opacity = '0';
          } else {
            const lineScale = 0.25 + clampedFlash * 0.75;
            lineEl.style.opacity = Math.min(1, clampedFlash * 1.15).toFixed(3);
            lineEl.style.transform = `scaleX(${lineScale.toFixed(3)})`;
            lineEl.className = `pointer-events-none h-px w-[min(72vw,520px)] origin-center ${
              rig.forkMode < 0 ? 'bg-text-dim/50' : 'bg-accent/80'
            }`;
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
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg)] opacity-0"
      style={{ willChange: 'opacity' }}
    >
      <div
        ref={lineRef}
        className="pointer-events-none h-px w-[min(72vw,520px)] origin-center bg-text-dim/50 opacity-0"
        style={{ willChange: 'transform, opacity' }}
      />
    </div>
  );
}
