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

const POINTER_MOVE_THROTTLE_MS = 250;

export function Scene() {
  const gl = useThree((s) => s.gl);
  const advance = useThree((s) => s.advance);
  const size = useThree((s) => s.size);

  const level = useTenetStore((s) => s.quality.level);
  const lowPower = useTenetStore((s) => s.quality.lowPower);
  const reducedMotion = useTenetStore((s) => s.quality.reducedMotion);
  const webglStatus = useTenetStore((s) => s.quality.webgl);
  const alwaysAlive = useTenetStore((s) => s.alwaysAlive);
  const setQuality = useTenetStore((s) => s.setQuality);

  const governorRef = useRef<FrameGovernor | null>(null);
  const lastActiveFrameRef = useRef<number>(0);
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
    if (!forcePaused) stageClock.requestRender();
  }, [alwaysAlive, level, lowPower, reducedMotion, webglStatus]);

  useEffect(() => {
    const q = useTenetStore.getState().quality;
    if (!q.lowPower && !q.reducedMotion && q.level < 4 && q.webgl === 'ok') {
      stageClock.requestRender();
    }
  }, [size.height, size.width]);

  useEffect(() => {
    let unsubRender: (() => void) | null = null;
    let lastPointerMoveAt = 0;

    const ensureClockSubscription = () => {
      const now = performance.now();
      const act = stageActivity.getLevel(now);
      rig.activityLevel = act;

      if (act === 'still') {
        lastActiveFrameRef.current = 0;
        if (unsubRender) {
          unsubRender();
          unsubRender = null;
        }
        return;
      }

      if (unsubRender !== null) return;

      // Both 'burst' and 'ambient' execute at full locked VSync via advance(elapsedSec)
      unsubRender = stageClock.subscribeRender((tickNow) => {
        const currentAct = stageActivity.getLevel(tickNow);
        rig.activityLevel = currentAct;

        if (currentAct === 'still') {
          lastActiveFrameRef.current = 0;
          unsubRender = null;
          return false;
        }

        rig.elapsedTime = stageClock.getElapsedSec();
        advance(rig.elapsedTime);
        return true;
      });
    };

    const unsubAct = stageActivity.subscribe(ensureClockSubscription);
    const unsubDemand = stageActivity.onDemandFrame(() => {
      if (stageActivity.getLevel(performance.now()) !== 'still' || !useTenetStore.getState().quality.lowPower) {
        stageClock.requestRender();
      }
    });
    const unsubStore = useTenetStore.subscribe(() => {
      const q = useTenetStore.getState().quality;
      if (!q.lowPower && q.level < 4 && q.webgl === 'ok') {
        stageClock.requestRender();
      }
    });

    const onVisibility = () => {
      const hidden = document.hidden;
      stageClock.setHidden(hidden);
      stageActivity.configure({ hidden });
      if (!hidden) {
        lastActiveFrameRef.current = 0;
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
      if (unsubRender) {
        unsubRender();
        unsubRender = null;
      }
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onDiscreteInput);
      window.removeEventListener('keydown', onDiscreteInput);
    };
  }, [advance]);

  useFrame(() => {
    const now = performance.now();
    rig.drawCalls = gl.info.render.calls;
    rig.triangles = gl.info.render.triangles;

    if (rig.activityLevel === 'still') {
      lastActiveFrameRef.current = 0;
      return;
    }

    const prev = lastActiveFrameRef.current;
    lastActiveFrameRef.current = now;

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
