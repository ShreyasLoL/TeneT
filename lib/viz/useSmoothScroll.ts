'use client';

import Lenis from 'lenis';
import { useEffect } from 'react';
import { stageClock } from '@/lib/stage/clock';
import { isTouchDevice } from '@/lib/stage/tiers';
import { useTenetStore } from '@/lib/store';

/**
 * Attaches Lenis smooth scrolling on long-document review routes, driven strictly
 * on-demand by `stageClock` while scroll momentum is non-zero (0 rAFs when idle).
 */
export function useSmoothScroll() {
  const reducedMotion = useTenetStore((s) => s.quality.reducedMotion);
  const lowPower = useTenetStore((s) => s.quality.lowPower);

  useEffect(() => {
    if (reducedMotion || lowPower || isTouchDevice()) return;

    const lenis = new Lenis({
      autoRaf: false,
      duration: 0.9,
      easing: (t) => 1 - Math.pow(2, -10 * t),
      smoothWheel: true,
    });

    let unsubClock: (() => void) | null = null;
    let activeUntilMs = 0;

    const wake = () => {
      activeUntilMs = performance.now() + 180;
      if (unsubClock !== null) return;
      unsubClock = stageClock.subscribe((nowMs) => {
        lenis.raf(nowMs);
        const moving = lenis.isScrolling || Math.abs(lenis.velocity) > 0.005;
        if (!moving && nowMs > activeUntilMs) {
          unsubClock = null;
          return false;
        }
        return true;
      });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'PageDown' ||
        e.key === 'PageUp' ||
        e.key === 'Home' ||
        e.key === 'End' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowUp' ||
        e.key === ' '
      ) {
        wake();
      }
    };

    window.addEventListener('wheel', wake, { passive: true });
    window.addEventListener('keydown', onKeyDown, { passive: true });

    return () => {
      window.removeEventListener('wheel', wake);
      window.removeEventListener('keydown', onKeyDown);
      if (unsubClock) {
        unsubClock();
        unsubClock = null;
      }
      lenis.destroy();
    };
  }, [lowPower, reducedMotion]);
}
