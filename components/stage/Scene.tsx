'use client';

import { addEffect, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { stageClock } from '@/lib/stage/clock';
import { FrameGovernor } from '@/lib/stage/governor';
import { inspectRenderer, type QualityLevel } from '@/lib/stage/tiers';
import { useTenetStore } from '@/lib/store';
import { notifyCanvasReady, rig } from '@/lib/store/rig';
import { BlackHole } from './BlackHole';
import { CameraRig } from './CameraRig';
import { Disk } from './Disk';
import { Galaxy } from './Galaxy';
import { Intro } from './Intro';
import { Particles } from './Particles';
import { Postfx } from './Postfx';
import { Recap } from './Recap';
import { Rings } from './Rings';

export function Scene() {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);

  const level = useTenetStore((s) => s.quality.level);
  const lowPower = useTenetStore((s) => s.quality.lowPower);
  const storeReduced = useTenetStore((s) => s.quality.reducedMotion);
  const reducedMotion =
    storeReduced ||
    (typeof window !== 'undefined' &&
      (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false));
  const mode = useTenetStore((s) => s.mode);
  const cursor = useTenetStore((s) => s.cursor);
  const setQuality = useTenetStore((s) => s.setQuality);

  const governorRef = useRef<FrameGovernor | null>(null);
  const lastFrameAtRef = useRef(0);

  useEffect(() => {
    if (reducedMotion) invalidate();
  }, [cursor, invalidate, lowPower, mode, reducedMotion, size.height, size.width]);

  useEffect(() => {
    governorRef.current = new FrameGovernor(level, performance.now());
    const info = inspectRenderer(gl.getContext());
    rig.rendererName = info.renderer;
    rig.isSoftwareRenderer = info.isSoftware;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  // Share one single RAF loop across R3F, GSAP (lagSmoothing(0)), and Lenis
  useEffect(() => {
    if (reducedMotion) {
      stageClock.setExternalDriven(false);
      rig.activityLevel = 'still';
      invalidate();
      return;
    }

    stageClock.setExternalDriven(true);
    rig.activityLevel = 'ambient';
    const removeEffect = addEffect((nowMs) => {
      stageClock.stepExternal(nowMs);
      rig.elapsedTime = stageClock.getElapsedSec();
    });

    return () => {
      removeEffect();
      stageClock.setExternalDriven(false);
    };
  }, [invalidate, reducedMotion]);

  useFrame(() => {
    if (!rig.canvasReady) {
      rig.canvasReady = true;
      notifyCanvasReady();
    }

    rig.drawCalls = gl.info.render.calls;
    rig.triangles = gl.info.render.triangles;

    if (reducedMotion) {
      lastFrameAtRef.current = 0;
      return;
    }

    const now = performance.now();
    const prev = lastFrameAtRef.current;
    lastFrameAtRef.current = now;
    if (prev > 0 && governorRef.current && !lowPower) {
      const elapsed = now - prev;
      const frameSample = rig.injectedFrameMs > 0 ? rig.injectedFrameMs : elapsed;
      rig.jsFrameMs = elapsed;
      const res = governorRef.current.pushFrame(frameSample, now, {
        hidden: document.hidden,
      });
      rig.p50FrameMs = res.p50;
      rig.p95FrameMs = res.p95;
      if (res.changed && res.level !== useTenetStore.getState().quality.level) {
        setQuality({ level: res.level as QualityLevel });
      }
    }
  });

  return (
    <>
      <CameraRig />
      <BlackHole />
      <group rotation={[0, 0, -0.39]}>
        <group rotation={[0.65, 0, 0]}>
          <Galaxy />
          <Disk />
          <Particles />
        </group>
      </group>
      <Rings />
      <Intro />
      <Recap />
      <Postfx />
    </>
  );
}
