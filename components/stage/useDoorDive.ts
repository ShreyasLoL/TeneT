'use client';

import { gsap } from 'gsap';
import { useRouter } from 'next/navigation';
import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { acquireFrames } from '@/lib/stage/activity';
import { stageClock } from '@/lib/stage/clock';
import type { QualityState } from '@/lib/store';
import { notifyForkTransition, rig, triggerArrivalHud } from '@/lib/store/rig';
import { buildDoorDiveTimeline, resetForkRigState, tweenDiveInterrupt } from './doorDiveTimeline';
import { expoBezierEase } from './expoBezier';

stageClock.bindGsap(gsap);

export function useDoorDive(quality: QualityState, setDensity: (d: number) => void) {
  const router = useRouter();
  const [diving, setDiving] = useState(false);

  const divingRef = useRef(false);
  const tlRef = useRef<ReturnType<typeof gsap.timeline> | null>(null);
  const diveReleaseRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setDensity(0.1);
    router.prefetch('/log');
    router.prefetch('/dashboard');
    return () => {
      rig.doorHover = 0;
    };
  }, [router, setDensity]);

  const interruptDive = useCallback(() => {
    if (!divingRef.current && !rig.forkActive) return;
    tlRef.current?.kill();
    tlRef.current = null;
    divingRef.current = false;
    setDiving(false);
    triggerArrivalHud(null);

    tweenDiveInterrupt(gsap, () => {
      resetForkRigState();
      diveReleaseRef.current?.();
      diveReleaseRef.current = null;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (divingRef.current || rig.forkActive)) {
        e.preventDefault();
        interruptDive();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('popstate', interruptDive);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('popstate', interruptDive);
    };
  }, [interruptDive]);

  const startJourney = useCallback(
    (side: 'left' | 'right', href: '/dashboard' | '/log') => {
      if (divingRef.current) return;

      const mediaReduced =
        typeof window !== 'undefined' &&
        (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

      if (quality.reducedMotion || mediaReduced || quality.webgl !== 'ok') {
        divingRef.current = true;
        setDiving(true);
        rig.forkMode = side === 'left' ? -1 : 1;
        rig.forkActive = true;
        notifyForkTransition();
        const tl = gsap.timeline({
          onComplete: () => {
            divingRef.current = false;
            tlRef.current = null;
            resetForkRigState();
          },
        });
        tl.to(rig, { forkFlash: 0.92, duration: 0.14, ease: expoBezierEase });
        tl.call(() => startTransition(() => router.push(href)));
        tl.to(rig, { forkFlash: 0, duration: 0.18, ease: expoBezierEase });
        tlRef.current = tl;
        return;
      }

      divingRef.current = true;
      setDiving(true);
      diveReleaseRef.current?.();
      diveReleaseRef.current = acquireFrames('fork-dive');

      let routed = false;
      tlRef.current = buildDoorDiveTimeline({
        gsapInstance: gsap,
        side,
        onRoute: () => {
          if (routed) return;
          routed = true;
          triggerArrivalHud(side === 'left' ? 'retrograde' : 'prograde');
          startTransition(() => router.push(href));
        },
        onComplete: () => {
          if (!routed) {
            routed = true;
            startTransition(() => router.push(href));
          }
          divingRef.current = false;
          tlRef.current = null;
          resetForkRigState();
          diveReleaseRef.current?.();
          diveReleaseRef.current = null;
        },
      });
    },
    [quality.reducedMotion, quality.webgl, router],
  );

  return { diving, startJourney, interruptDive };
}
