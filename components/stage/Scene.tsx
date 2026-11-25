'use client';

import { addEffect, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { type Group, MathUtils, Vector3 } from 'three';
import { stageClock } from '@/lib/stage/clock';
import { FrameGovernor } from '@/lib/stage/governor';
import { inspectRenderer, type QualityLevel } from '@/lib/stage/tiers';
import { useTenetStore } from '@/lib/store';
import { notifyCanvasReady, rig } from '@/lib/store/rig';
import { BlackHole } from './BlackHole';
import { CameraRig } from './CameraRig';
import { Disk } from './Disk';
import { Fork } from './Fork';
import { Intro } from './Intro';
import { Particles } from './Particles';
import { Postfx } from './Postfx';
import { Recap } from './Recap';
import { Rings } from './Rings';

const POINTER_IDLE_MS = 2000;
const FOLLOW_SCALE = 0.38;
const POS_LAMBDA = 6.0;
const SCALE_LAMBDA = 4.0;
const DIM_LAMBDA = 6.0;
const OVER_CARD_DIM = 0.68;

const scratchNdc = new Vector3();
const scratchRayDir = new Vector3();
const scratchTargetWorld = new Vector3();
const scratchProjected = new Vector3();

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

  const holeGroupRef = useRef<Group | null>(null);
  const governorRef = useRef<FrameGovernor | null>(null);
  const lastFrameAtRef = useRef(0);
  const viewportRef = useRef({ w: Math.max(1, size.width), h: Math.max(1, size.height) });
  const pointerSampleRef = useRef({
    x: 0,
    y: 0,
    inside: false,
    overCard: false,
    lastMoveMs: 0,
  });
  const followStateRef = useRef({ x: 0, y: 0, scale: 1, dim: 1 });

  useEffect(() => {
    viewportRef.current.w = Math.max(1, size.width);
    viewportRef.current.h = Math.max(1, size.height);
    if (reducedMotion) invalidate();
  }, [invalidate, reducedMotion, size.height, size.width]);

  useEffect(() => {
    if (reducedMotion) invalidate();
  }, [cursor, invalidate, lowPower, mode, reducedMotion]);

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

  // High-rate (144Hz / 1600dpi) passive pointer sampling with zero setState or per-event work
  useEffect(() => {
    const sample = pointerSampleRef.current;

    const onPointerMove = (e: PointerEvent) => {
      const vw = viewportRef.current.w;
      const vh = viewportRef.current.h;
      sample.x = MathUtils.clamp((e.clientX / vw) * 2 - 1, -1, 1);
      sample.y = MathUtils.clamp(-(e.clientY / vh) * 2 + 1, -1, 1);
      const target = e.target as Element | null;
      sample.overCard = Boolean(
        target?.closest('[data-stage-card], article, section, form, header, [role="dialog"]'),
      );
      sample.inside = true;
      sample.lastMoveMs = performance.now();
    };

    const onPointerLeave = () => {
      sample.inside = false;
      sample.overCard = false;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });
    window.addEventListener('blur', onPointerLeave);
    document.addEventListener('mouseleave', onPointerLeave);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('blur', onPointerLeave);
      document.removeEventListener('mouseleave', onPointerLeave);
    };
  }, []);

  useFrame((state, delta) => {
    if (!rig.canvasReady) {
      rig.canvasReady = true;
      notifyCanvasReady();
    }

    const now = performance.now();
    const dt = Math.min(delta, 1 / 30);

    // Sample latest pointer once per frame; shrink & follow in world space at z = 0 after intro
    const p = pointerSampleRef.current;
    const f = followStateRef.current;
    const introFinished =
      !reducedMotion && !rig.introActive && useTenetStore.getState().introDone;
    const activeCursor =
      introFinished && p.inside && now - p.lastMoveMs <= POINTER_IDLE_MS;

    let targetWorldX = 0;
    let targetWorldY = 0;
    if (activeCursor) {
      scratchNdc.set(p.x, p.y, 0.5).unproject(state.camera);
      scratchRayDir.subVectors(scratchNdc, state.camera.position);
      if (Math.abs(scratchRayDir.z) > 1e-4) {
        const hitT = -state.camera.position.z / scratchRayDir.z;
        if (hitT > 0) {
          scratchTargetWorld.copy(state.camera.position).addScaledVector(scratchRayDir, hitT);
          targetWorldX = MathUtils.clamp(scratchTargetWorld.x, -16, 16);
          targetWorldY = MathUtils.clamp(scratchTargetWorld.y, -10, 10);
        }
      }
    }

    const targetScale = activeCursor ? FOLLOW_SCALE : 1.0;
    const targetDim = activeCursor && p.overCard ? OVER_CARD_DIM : 1.0;

    if (reducedMotion) {
      f.x = 0;
      f.y = 0;
      f.scale = 1.0;
      f.dim = 1.0;
    } else {
      f.x = MathUtils.damp(f.x, targetWorldX, POS_LAMBDA, dt);
      f.y = MathUtils.damp(f.y, targetWorldY, POS_LAMBDA, dt);
      f.scale = MathUtils.damp(f.scale, targetScale, SCALE_LAMBDA, dt);
      f.dim = MathUtils.damp(f.dim, targetDim, DIM_LAMBDA, dt);
    }

    rig.pointerX = activeCursor ? p.x : 0;
    rig.pointerY = activeCursor ? p.y : 0;
    rig.holeScale = f.scale;
    rig.holeDim = f.dim;

    const holeGroup = holeGroupRef.current;
    if (holeGroup) {
      holeGroup.position.set(f.x, f.y, 0);
      holeGroup.rotation.set(0, 0, 0);
      holeGroup.scale.setScalar(f.scale);

      rig.holeWorldDist = state.camera.position.distanceTo(holeGroup.position);
      scratchProjected.copy(holeGroup.position).project(state.camera);
      rig.holeScreenX = scratchProjected.x * 0.5 + 0.5;
      rig.holeScreenY = scratchProjected.y * 0.5 + 0.5;
    }

    rig.drawCalls = gl.info.render.calls;
    rig.triangles = gl.info.render.triangles;

    if (reducedMotion) {
      lastFrameAtRef.current = 0;
      return;
    }

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
      <group ref={holeGroupRef}>
        <BlackHole />
        <Disk />
        <Particles />
      </group>
      <Rings />
      <Fork />
      <Intro />
      <Recap />
      <Postfx />
    </>
  );
}
