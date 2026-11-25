'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { stageActivity } from '@/lib/stage/activity';
import { stageClock } from '@/lib/stage/clock';
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

// ~30fps ambient cadence driven from single VSync clock (every ~32ms)
const AMBIENT_MIN_INTERVAL_MS = 31;
const POINTER_MOVE_THROTTLE_MS = 250;

export function Scene() {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);

  const level = useTenetStore((s) => s.quality.level);
  const lowPower = useTenetStore((s) => s.quality.lowPower);
  const reducedMotion = useTenetStore((s) => s.quality.reducedMotion);
  const webglStatus = useTenetStore((s) => s.quality.webgl);
  const alwaysAlive = useTenetStore((s) => s.alwaysAlive);
  const setQuality = useTenetStore((s) => s.setQuality);

  const governorRef = useRef<FrameGovernor | null>(null);
  const lastBurstFrameRef = useRef<number>(0);
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
    const forcePaused = lowPower || reducedMotion || level >= 4 || webglStatus !== 'ok';
    stageActivity.configure({
      lowPower: forcePaused,
      reducedMotion,
      alwaysAlive,
      touch: touchRef.current,
    });
    if (!forcePaused) invalidate();
  }, [alwaysAlive, invalidate, level, lowPower, reducedMotion, webglStatus]);

  useEffect(() => {
    let unsubClock: (() => void) | null = null;
    let lastAmbientAt = 0;
    let lastPointerMoveAt = 0;

    const ensureClockSubscription = () => {
      const now = performance.now();
      const act = stageActivity.getLevel(now);
      rig.activityLevel = act;

      if (act === 'still') {
        lastBurstFrameRef.current = 0;
        if (unsubClock) {
          unsubClock();
          unsubClock = null;
        }
        return;
      }

      if (unsubClock !== null) return;

      unsubClock = stageClock.subscribe((tickNow) => {
        const currentAct = stageActivity.getLevel(tickNow);
        rig.activityLevel = currentAct;

        if (currentAct === 'still') {
          lastBurstFrameRef.current = 0;
          unsubClock = null;
          return false;
        }

        if (currentAct === 'burst') {
          rig.elapsedTime = stageClock.getElapsedSec();
          invalidate();
          return true;
        }

        // 'ambient': ~30fps gated on the shared VSync loop, zero setInterval timers
        lastBurstFrameRef.current = 0;
        if (tickNow - lastAmbientAt >= AMBIENT_MIN_INTERVAL_MS) {
          lastAmbientAt = tickNow;
          rig.elapsedTime = stageClock.getElapsedSec();
          invalidate();
        }
        return true;
      });
    };

    const unsubAct = stageActivity.subscribe(ensureClockSubscription);
    const unsubDemand = stageActivity.onDemandFrame(() => {
      if (stageActivity.getLevel(performance.now()) !== 'still' || !useTenetStore.getState().quality.lowPower) {
        rig.elapsedTime = stageClock.getElapsedSec();
        invalidate();
      }
    });
    const unsubStore = useTenetStore.subscribe(() => {
      const q = useTenetStore.getState().quality;
      if (!q.lowPower && q.level < 4 && q.webgl === 'ok') {
        invalidate();
      }
    });

    const onVisibility = () => {
      const hidden = document.hidden;
      stageClock.setHidden(hidden);
      stageActivity.configure({ hidden });
      if (!hidden) {
        lastBurstFrameRef.current = 0;
        ensureClockSubscription();
      }
    };

    const onDiscreteInput = () => {
      stageActivity.notifyInput(performance.now());
    };

    const onPointerMove = () => {
      const now = performance.now();
      if (now - lastPointerMoveAt >= POINTER_MOVE_THROTTLE_MS) {
        lastPointerMoveAt = now;
        stageActivity.notifyInput(now);
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onDiscreteInput, { passive: true });
    window.addEventListener('keydown', onDiscreteInput, { passive: true });

    ensureClockSubscription();

    return () => {
      unsubAct();
      unsubDemand();
      unsubStore();
      if (unsubClock) {
        unsubClock();
        unsubClock = null;
      }
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onDiscreteInput);
      window.removeEventListener('keydown', onDiscreteInput);
    };
  }, [invalidate]);

  useFrame(() => {
    const now = performance.now();
    rig.drawCalls = gl.info.render.calls;
    rig.triangles = gl.info.render.triangles;

    // Feed FrameGovernor ONLY during full-rate 'burst' frames so ~30fps ambient intervals
    // never masquerade as slow 33ms+ renders (fixes F-01).
    if (rig.activityLevel !== 'burst') {
      lastBurstFrameRef.current = 0;
      return;
    }

    const prev = lastBurstFrameRef.current;
    lastBurstFrameRef.current = now;

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
