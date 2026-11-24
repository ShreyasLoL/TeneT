'use client';

import Lenis from 'lenis';
import { useEffect } from 'react';
import { isTouchDevice } from '@/lib/stage/tiers';
import { useTenetStore } from '@/lib/store';

/**
 * Attaches Lenis smooth scrolling only on long-document review routes,
 * disabled on touch devices and when prefers-reduced-motion is active.
 */
export function useSmoothScroll() {
  const reducedMotion = useTenetStore((s) => s.quality.reducedMotion);
  const lowPower = useTenetStore((s) => s.quality.lowPower);

  useEffect(() => {
    if (reducedMotion || lowPower || isTouchDevice()) return;

    const lenis = new Lenis({
      duration: 0.9,
      easing: (t) => 1 - Math.pow(2, -10 * t),
      smoothWheel: true,
    });

    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, [lowPower, reducedMotion]);
}
