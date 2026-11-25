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

const POINTER_IDLE_MS = 2600;
const PARALLAX_MAX_X = 0.6;
const PARALLAX_MAX_Y = 0.42;
const PARALLAX_MAX_TILT = 0.14; // ~8 degrees
const BASE_ROLL_Z = -0.09;     // subtle ~5 deg cinematic roll on origin
const PARALLAX_LAMBDA = 5.0;

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
  const pointerSampleRef = useRef({ x: 0, y: 0, inside: false, lastMoveMs: 0 });
  const dampedPointerRef = useRef({ x: 0, y: 0, gate: 0 });

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

  // High-rate (144Hz / 1600dpi) passive pointer sampling without setState or per-event work
  useEffect(() => {
    const sample = pointerSampleRef.current;

    const onPointerMove = (e: PointerEvent) => {
      const vw = viewportRef.current.w;
      const vh = viewportRef.current.h;
      sample.x = MathUtils.clamp((e.clientX / vw) * 2 - 1, -1, 1);
      sample.y = MathUtils.clamp(-(e.clientY / vh) * 2 + 1, -1, 1);
      sample.inside = true;
      sample.lastMoveMs = performance.now();
    };

    const onPointerLeave = () => {
      sample.inside = false;
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

    // Sample latest pointer once per frame and damp strictly via delta-based MathUtils.damp
    const p = pointerSampleRef.current;
    const d = dampedPointerRef.current;
    const canParallax =
      !reducedMotion && !rig.introActive && useTenetStore.getState().introDone;

    if (!canParallax) {
      d.gate = 0;
    } else if (d.gate < 1) {
      d.gate = Math.min(1, d.gate + dt / 0.6);
    }
    const smoothGate = d.gate * d.gate * (3 - 2 * d.gate);

    const activePointer = p.inside && now - p.lastMoveMs <= POINTER_IDLE_MS;
    const targetX = activePointer ? p.x * smoothGate : 0;
    const targetY = activePointer ? p.y * smoothGate : 0;

    if (reducedMotion) {
      d.x = 0;
      d.y = 0;
    } else {
      d.x = MathUtils.damp(d.x, targetX, PARALLAX_LAMBDA, dt);
      d.y = MathUtils.damp(d.y, targetY, PARALLAX_LAMBDA, dt);
    }

    rig.pointerX = d.x;
    rig.pointerY = d.y;

    const holeGroup = holeGroupRef.current;
    if (holeGroup) {
      holeGroup.position.set(d.x * PARALLAX_MAX_X, d.y * PARALLAX_MAX_Y, 0);
      holeGroup.rotation.set(-d.y * PARALLAX_MAX_TILT, d.x * PARALLAX_MAX_TILT, BASE_ROLL_Z);

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
        <Rings />
      </group>
      <Fork />
      <Intro />
      <Recap />
      <Postfx />
    </>
  );
}
