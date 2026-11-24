'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { AMBIENT_STEP_MS, stageActivity } from '@/lib/stage/activity';
import { FrameGovernor } from '@/lib/stage/governor';
import { inspectRenderer, isTouchDevice, type QualityLevel } from '@/lib/stage/tiers';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { CameraRig } from './CameraRig';
import { Disk } from './Disk';
import { Fork } from './Fork';
import { Intro } from './Intro';
import { Particles } from './Particles';
import { Postfx } from './Postfx';
import { Recap } from './Recap';
import { Rings } from './Rings';

export function Scene() {
  const gl = useThree((s) => s.gl);
  const setFrameloop = useThree((s) => s.setFrameloop);
  const invalidate = useThree((s) => s.invalidate);

  const level = useTenetStore((s) => s.quality.level);
  const lowPower = useTenetStore((s) => s.quality.lowPower);
  const reducedMotion = useTenetStore((s) => s.quality.reducedMotion);
  const alwaysAlive = useTenetStore((s) => s.alwaysAlive);
  const setQuality = useTenetStore((s) => s.setQuality);

  const governorRef = useRef<FrameGovernor | null>(null);
  const lastFrameStartRef = useRef<number>(0);
  const touchRef = useRef(false);

  useEffect(() => {
    touchRef.current = isTouchDevice();
    governorRef.current = new FrameGovernor(level, performance.now());
    const info = inspectRenderer(gl.getContext());
    rig.rendererName = info.renderer;
    rig.isSoftwareRenderer = info.isSoftware;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  useEffect(() => {
    stageActivity.configure({
      lowPower,
      reducedMotion,
      alwaysAlive,
      touch: touchRef.current,
    });
    invalidate();
  }, [alwaysAlive, invalidate, lowPower, reducedMotion]);

  useEffect(() => {
    const syncActivity = () => {
      const act = stageActivity.getLevel(performance.now());
      rig.activityLevel = act;
      if (act === 'burst') {
        setFrameloop('always');
      } else {
        setFrameloop('demand');
        if (act === 'ambient') invalidate();
      }
    };

    const unsubAct = stageActivity.subscribe(syncActivity);
    const unsubDemand = stageActivity.onDemandFrame(() => invalidate());
    const unsubStore = useTenetStore.subscribe(() => invalidate());

    const ambientInterval = window.setInterval(() => {
      const act = stageActivity.getLevel(performance.now());
      rig.activityLevel = act;
      if (act === 'ambient') {
        invalidate();
      } else if (act === 'still') {
        setFrameloop('demand');
      }
    }, Math.round(AMBIENT_STEP_MS));

    const onVisibility = () => {
      stageActivity.configure({ hidden: document.hidden });
      if (!document.hidden) {
        lastFrameStartRef.current = performance.now();
        invalidate();
      }
    };
    const onInput = () => {
      stageActivity.notifyInput(performance.now());
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pointermove', onInput, { passive: true });
    window.addEventListener('pointerdown', onInput, { passive: true });
    window.addEventListener('keydown', onInput, { passive: true });

    syncActivity();

    return () => {
      unsubAct();
      unsubDemand();
      unsubStore();
      window.clearInterval(ambientInterval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onInput);
      window.removeEventListener('pointerdown', onInput);
      window.removeEventListener('keydown', onInput);
    };
  }, [invalidate, setFrameloop]);

  useFrame(() => {
    const now = performance.now();
    const prev = lastFrameStartRef.current;
    lastFrameStartRef.current = now;

    rig.drawCalls = gl.info.render.calls;
    rig.triangles = gl.info.render.triangles;

    if (prev > 0 && governorRef.current) {
      const elapsed = now - prev;
      const sample = rig.injectedFrameMs > 0 ? rig.injectedFrameMs : elapsed;
      rig.jsFrameMs = elapsed;
      const res = governorRef.current.pushFrame(sample, now, {
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
      <Particles />
      <Disk />
      <Rings />
      <Fork />
      <Intro />
      <Recap />
      <Postfx />
    </>
  );
}
