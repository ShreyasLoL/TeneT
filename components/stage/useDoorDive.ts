'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { acquireFrames } from '@/lib/stage/activity';
import { stageClock } from '@/lib/stage/clock';
import type { QualityState } from '@/lib/store';
import { notifyForkTransition, rig, triggerArrivalHud } from '@/lib/store/rig';
import { expoBezierEase } from './expoBezier';

type GsapCore = (typeof import('gsap/gsap-core'))['gsap'];

function resetForkRigState() {
  rig.forkActive = false;
  rig.forkMode = 0;
  rig.forkWarp = 0;
  rig.forkHue = 0;
  rig.forkFlash = 0;
  rig.sealHold = 0;
  rig.uDir = 1;
  rig.doorHover = 0;
  rig.cameraOverride.active = false;
  notifyForkTransition();
}

export function useDoorDive(quality: QualityState, setDensity: (d: number) => void) {
  const router = useRouter();
  const [diving, setDiving] = useState(false);

  const divingRef = useRef(false);
  const gsapRef = useRef<GsapCore | null>(null);
  const tlRef = useRef<ReturnType<GsapCore['timeline']> | null>(null);
  const diveReleaseRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setDensity(0.1);
    router.prefetch('/log');
    router.prefetch('/dashboard');
    let cancelled = false;
    void import('gsap/gsap-core').then((m) => {
      stageClock.bindGsap(m.gsap);
      if (!cancelled) gsapRef.current = m.gsap;
    });
    return () => {
      cancelled = true;
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

    const gsapInstance = gsapRef.current;
    if (!gsapInstance) {
      resetForkRigState();
      diveReleaseRef.current?.();
      diveReleaseRef.current = null;
      return;
    }

    gsapInstance.to(rig, {
      forkMode: 0,
      forkWarp: 0,
      forkHue: 0,
      forkFlash: 0,
      sealHold: 0,
      duration: 0.35,
      ease: expoBezierEase,
    });
    gsapInstance.to(rig.cameraOverride, {
      px: 0,
      py: 0,
      pz: 10.6,
      tx: 0,
      ty: 0,
      tz: 0,
      fov: 45,
      duration: 0.35,
      ease: expoBezierEase,
      onComplete: () => {
        resetForkRigState();
        diveReleaseRef.current?.();
        diveReleaseRef.current = null;
      },
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
        // Reduced motion: calm crossfade only, zero camera zoom
        const gsapInstance = gsapRef.current;
        if (!gsapInstance) {
          router.push(href);
          return;
        }
        divingRef.current = true;
        setDiving(true);
        rig.forkMode = side === 'left' ? -1 : 1;
        rig.forkActive = true;
        notifyForkTransition();
        const tl = gsapInstance.timeline({
          onComplete: () => {
            divingRef.current = false;
            resetForkRigState();
          },
        });
        tl.to(rig, { forkFlash: 0.92, duration: 0.14, ease: expoBezierEase });
        tl.call(() => startTransition(() => router.push(href)));
        tl.to(rig, { forkFlash: 0, duration: 0.18, ease: expoBezierEase });
        tlRef.current = tl;
        return;
      }

      const gsapInstance = gsapRef.current;
      if (!gsapInstance) {
        router.push(href);
        return;
      }

      divingRef.current = true;
      setDiving(true);
      diveReleaseRef.current?.();
      diveReleaseRef.current = acquireFrames('fork-dive');

      const isRetro = side === 'left';
      const totalSec = quality.lowPower ? 0.95 : isRetro ? 2.4 : 1.8;
      const peakSec = totalSec * 0.74;

      const startZ = 10.6 + Math.sin(rig.elapsedTime * 0.28) * 0.28;
      rig.forkActive = true;
      rig.cameraOverride.active = true;
      rig.cameraOverride.px = 0;
      rig.cameraOverride.py = 0;
      rig.cameraOverride.pz = startZ;
      rig.cameraOverride.tx = 0;
      rig.cameraOverride.ty = 0;
      rig.cameraOverride.tz = 0;
      rig.cameraOverride.fov = 45;
      notifyForkTransition();

      let routed = false;
      const tl = gsapInstance.timeline({
        onComplete: () => {
          if (!routed) startTransition(() => router.push(href));
          divingRef.current = false;
          tlRef.current = null;
          resetForkRigState();
          if (diveReleaseRef.current) {
            diveReleaseRef.current();
            diveReleaseRef.current = null;
          }
        },
      });
      tlRef.current = tl;

      if (isRetro) {
        // RETROGRADE (~2.4s): cold ice-blue/teal, counter-clockwise, calm heavy glide into ringed star
        tl.to(
          rig,
          {
            forkMode: -1,
            forkHue: 1,
            sealHold: 0.25,
            duration: totalSec * 0.45,
            ease: expoBezierEase,
          },
          0,
        );
        tl.to(rig, { forkWarp: 1, duration: peakSec, ease: expoBezierEase }, 0);
        tl.to(
          rig.cameraOverride,
          { py: 0.28, pz: 2.15, fov: 50, duration: peakSec, ease: expoBezierEase },
          0,
        );
      } else {
        // PROGRADE (~1.8s): hot orchid/amber/white-hot, clockwise burst, fast snap + ignition flash
        tl.to(
          rig,
          {
            forkMode: 1,
            forkHue: 1,
            sealHold: 0.65,
            duration: totalSec * 0.32,
            ease: expoBezierEase,
          },
          0,
        );
        tl.to(rig, { forkWarp: 1, duration: peakSec, ease: expoBezierEase }, totalSec * 0.08);
        tl.to(
          rig.cameraOverride,
          { py: 0.14, pz: 1.55, fov: 62, duration: peakSec * 0.92, ease: expoBezierEase },
          totalSec * 0.08,
        );
      }

      // Peak veil/flash covers route swap cleanly, then fades out on the destination route
      tl.to(
        rig,
        { forkFlash: 1, duration: totalSec * 0.16, ease: expoBezierEase },
        peakSec - totalSec * 0.14,
      );
      tl.call(
        () => {
          if (!routed) {
            routed = true;
            rig.cameraOverride.active = false;
            triggerArrivalHud(isRetro ? 'retrograde' : 'prograde');
            startTransition(() => router.push(href));
          }
        },
        undefined,
        peakSec,
      );
      tl.to(
        rig,
        {
          forkFlash: 0,
          duration: Math.max(0.28, (totalSec - peakSec) * 0.65),
          ease: expoBezierEase,
        },
        peakSec + 0.02,
      );
      tl.to(
        rig,
        {
          forkWarp: 0,
          forkHue: 0,
          forkMode: 0,
          sealHold: 0,
          duration: 0.95,
          ease: expoBezierEase,
        },
        peakSec + 0.16,
      );
    },
    [quality.lowPower, quality.reducedMotion, quality.webgl, router],
  );

  return { diving, startJourney, interruptDive };
}
