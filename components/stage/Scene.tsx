'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { stageClock } from '@/lib/stage/clock';
import { inspectRenderer, isTouchDevice, profileForLevel, type QualityLevel } from '@/lib/stage/tiers';
import { useTenetStore } from '@/lib/store';
import { notifyCanvasReady, rig } from '@/lib/store/rig';
import type { BhTier } from '@/stage/blackhole/bhRenderer';
import { detectGpuCaps } from '@/stage/blackhole/gpuCaps';
import { detectInitialBhTier, QualityController } from '@/stage/blackhole/qualityController';
import { BrightStarSprites } from './BrightStarSprites';
import { CameraRig } from './CameraRig';
import { Intro } from './Intro';
import { Particles } from './Particles';
import { Postfx } from './Postfx';
import { Recap } from './Recap';
import { Rings } from './Rings';

export function Scene() {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const setDpr = useThree((s) => s.setDpr);

  const level = useTenetStore((s) => s.quality.level) as QualityLevel;
  const bhTier = useTenetStore((s) => s.quality.bhTier);
  const lowPower = useTenetStore((s) => s.quality.lowPower);
  const storeReduced = useTenetStore((s) => s.quality.reducedMotion);
  const reducedMotion =
    storeReduced ||
    (typeof window !== 'undefined' &&
      (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false));
  const mode = useTenetStore((s) => s.mode);
  const cursor = useTenetStore((s) => s.cursor);
  const selection = useTenetStore((s) => s.selection);
  const setQuality = useTenetStore((s) => s.setQuality);

  const qcRef = useRef<QualityController | null>(null);
  const lastFrameAtRef = useRef(0);
  const pendingTierRef = useRef<BhTier | null>(null);
  const pendingDprRef = useRef<number | null>(null);

  useEffect(() => {
    invalidate();
  }, [bhTier, cursor, invalidate, lowPower, mode, reducedMotion, selection, size.height, size.width]);

  useEffect(() => {
    const webglCtx = gl.getContext() as WebGL2RenderingContext;
    const caps = detectGpuCaps(webglCtx);
    const info = inspectRenderer(webglCtx);
    rig.rendererName = info.renderer;
    rig.isSoftwareRenderer = info.isSoftware;

    const baseDpr = profileForLevel(level, isTouchDevice(), lowPower).dprMax;
    const qc = new QualityController(webglCtx, caps.disjointTimerQuery, 2, baseDpr);
    qcRef.current = qc;

    let cancelled = false;
    void detectInitialBhTier(webglCtx).then((detected) => {
      if (cancelled) return;
      qc.setMaxAllowedTier(detected);
    });

    return () => {
      cancelled = true;
      qc.dispose();
      qcRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  // Single unified rAF loop driving demand-invalidate, EMA dt, 30fps idle cap & quality sync
  useEffect(() => {
    stageClock.setExternalDriven(false);

    if (reducedMotion) {
      rig.activityLevel = 'still';
      invalidate();
    } else {
      rig.activityLevel = 'ambient';
    }

    let emaDt = 1 / 60;
    let lastInvMs = 0;
    let appliedDpr = 0;

    const unsub = stageClock.subscribe((nowMs, dtSec) => {
      const pendingTier = pendingTierRef.current;
      if (pendingTier !== null) {
        pendingTierRef.current = null;
        setQuality({ bhTier: pendingTier });
      }
      const nextDpr = pendingDprRef.current;
      if (nextDpr !== null && Math.abs(nextDpr - appliedDpr) > 0.05) {
        pendingDprRef.current = null;
        appliedDpr = nextDpr;
        setDpr(nextDpr);
      }

      if (document.hidden || rig.canvasCovered) return;

      const clampedDt = Math.min(dtSec, 1 / 30);
      emaDt = emaDt * 0.8 + clampedDt * 0.2;
      if (!reducedMotion) {
        rig.elapsedTime += emaDt;
      }

      if (reducedMotion && !rig.introActive && !rig.forkActive && rig.warmupFrames >= 3) {
        return;
      }

      const isIdle =
        !rig.introActive &&
        !rig.forkActive &&
        rig.sealHold < 0.01 &&
        Math.abs(rig.cursorVelocity) < 0.01 &&
        rig.bhCamMotion < 0.03;

      rig.activityLevel = isIdle ? 'still' : 'ambient';
      if (isIdle && (lowPower || rig.bhTier <= 1) && nowMs - lastInvMs < 32) {
        return;
      }

      lastInvMs = nowMs;
      invalidate();
    });

    invalidate();
    return unsub;
  }, [invalidate, lowPower, reducedMotion, setDpr, setQuality]);

  useFrame((stateCtx, delta) => {
    rig.warmupFrames += 1;
    if (!rig.canvasReady && (rig.warmupFrames >= 3 || reducedMotion)) {
      rig.canvasReady = true;
      notifyCanvasReady();
    }

    const now = performance.now();
    const prev = lastFrameAtRef.current;
    lastFrameAtRef.current = now;
    const rawElapsed = prev > 0 ? now - prev : 16.67;
    const frameMs = rig.injectedFrameMs > 0 ? rig.injectedFrameMs : rawElapsed;
    rig.jsFrameMs = rawElapsed;

    const qc = qcRef.current;
    if (qc && !document.hidden && !rig.canvasCovered) {
      const stepRes = qc.step({
        cpuFrameMs: frameMs,
        gpuFrameMs: rig.gpuFrameMs,
        dtSec: Math.min(delta, 1 / 30),
        camX: stateCtx.camera.position.x,
        camY: stateCtx.camera.position.y,
        camZ: stateCtx.camera.position.z,
        lowPower,
        manualTierOverride: rig.manualTierOverride,
        hidden: document.hidden || rig.canvasCovered,
      });

      if (!rig.manualTierOverride) {
        rig.bhTier = stepRes.tier;
      }
      rig.bhCamMotion = stepRes.camMotion;
      rig.bhRenderScale = stepRes.renderScale;
      rig.p50FrameMs = stepRes.p50Ms;
      rig.p95FrameMs = stepRes.p95Ms;

      if (stepRes.tierChanged && !rig.manualTierOverride) {
        pendingTierRef.current = stepRes.tier;
      }
      pendingDprRef.current = stepRes.recommendedDpr;
    }
  });

  return (
    <>
      <CameraRig />
      <BrightStarSprites />
      <Particles />
      <Rings />
      <Intro />
      <Recap />
      <Postfx />
    </>
  );
}
