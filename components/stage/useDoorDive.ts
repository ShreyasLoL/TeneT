'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { acquireFrames } from '@/lib/stage/activity';
import { stageClock } from '@/lib/stage/clock';
import type { QualityState } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { readMotionTokens } from '@/lib/viz/motion';

type GsapCore = (typeof import('gsap/gsap-core'))['gsap'];

export function useDoorDive(quality: QualityState, setDensity: (d: number) => void) {
  const router = useRouter();
  const [diving, setDiving] = useState(false);

  const divingRef = useRef(false);
  const gsapRef = useRef<GsapCore | null>(null);
  const diveTweenRef = useRef<ReturnType<GsapCore['to']> | null>(null);
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
      diveTweenRef.current?.kill();
      diveTweenRef.current = null;
      diveReleaseRef.current?.();
      diveReleaseRef.current = null;
      divingRef.current = false;
      rig.doorHover = 0;
      rig.cameraOverride.active = false;
    };
  }, [router, setDensity]);

  useEffect(() => {
    const interruptDive = () => {
      if (!divingRef.current) return;
      diveTweenRef.current?.kill();
      diveTweenRef.current = null;
      divingRef.current = false;
      setDiving(false);

      const gsapInstance = gsapRef.current;
      if (!gsapInstance) {
        rig.cameraOverride.active = false;
        diveReleaseRef.current?.();
        diveReleaseRef.current = null;
        return;
      }

      diveTweenRef.current = gsapInstance.to(rig.cameraOverride, {
        px: 0,
        py: 1.18,
        pz: 5.45,
        tx: 0,
        ty: 0,
        tz: 0,
        fov: 46,
        duration: 0.32,
        ease: 'expo.out',
        onComplete: () => {
          rig.cameraOverride.active = false;
          diveTweenRef.current = null;
          diveReleaseRef.current?.();
          diveReleaseRef.current = null;
        },
      });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && divingRef.current) {
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
  }, []);

  const handleDoorDive = useCallback(
    (
      _side: 'left' | 'right',
      href: '/dashboard' | '/log',
      e: React.MouseEvent<HTMLAnchorElement>,
    ) => {
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        quality.reducedMotion ||
        quality.lowPower ||
        quality.level >= 4 ||
        quality.webgl !== 'ok'
      ) {
        return;
      }

      e.preventDefault();
      if (divingRef.current) return;
      const gsapInstance = gsapRef.current;
      if (!gsapInstance) {
        router.push(href);
        return;
      }
      divingRef.current = true;
      setDiving(true);

      const durationSec = Math.min(0.48, Math.max(0.35, (readMotionTokens().sceneMs / 1000) * 0.55));
      diveReleaseRef.current?.();
      diveReleaseRef.current = acquireFrames('fork-dive');

      if (!rig.cameraOverride.active) {
        rig.cameraOverride.active = true;
        rig.cameraOverride.px = 0;
        rig.cameraOverride.py = 1.18;
        rig.cameraOverride.pz = 5.45;
        rig.cameraOverride.tx = 0;
        rig.cameraOverride.ty = 0;
        rig.cameraOverride.tz = 0;
        rig.cameraOverride.fov = 46;
      }

      let pushed = false;
      diveTweenRef.current = gsapInstance.to(rig.cameraOverride, {
        px: 0,
        py: 0.85,
        pz: 2.8,
        fov: 56,
        duration: durationSec,
        ease: 'expo.out',
        onUpdate: function () {
          if (!pushed && divingRef.current && this.progress() >= 0.85) {
            pushed = true;
            startTransition(() => router.push(href));
          }
        },
        onComplete: () => {
          if (!pushed && divingRef.current) {
            startTransition(() => router.push(href));
          }
          rig.cameraOverride.active = false;
          divingRef.current = false;
          diveTweenRef.current = null;
          if (diveReleaseRef.current) {
            diveReleaseRef.current();
            diveReleaseRef.current = null;
          }
        },
      });
    },
    [quality.level, quality.lowPower, quality.reducedMotion, quality.webgl, router],
  );

  return { diving, handleDoorDive };
}
