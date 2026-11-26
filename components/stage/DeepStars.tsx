'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  type BufferGeometry,
  GLSL3,
  MathUtils,
  type ShaderMaterial,
  Sphere,
  Vector3,
} from 'three';
import { isTouchDevice, type QualityLevel } from '@/lib/stage/tiers';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { CAMERA_DISTANCE_DEFAULT, CAMERA_ROLL_RAD } from './blackhole/constants';
import { deepStarsFragmentShader, deepStarsVertexShader } from './shaders/deepStars.glsl';

const MAX_DEEP_STARS = 4400;
const scratchCamPos = new Vector3();
const scratchForward = new Vector3();
const scratchRight = new Vector3();
const scratchUp = new Vector3();
const scratchWorldUp = new Vector3(0, 1, 0);

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildDeepStarBuffers() {
  const rng = mulberry32(908147);
  const dirs = new Float32Array(MAX_DEEP_STARS * 3);
  const seeds = new Float32Array(MAX_DEEP_STARS * 4);

  // Normalized bottom-right Messier 87* void center matching blackholeSky.glsl.ts
  const m87Len = Math.hypot(0.328, -0.128, -0.936);
  const mx = 0.328 / m87Len;
  const my = -0.128 / m87Len;
  const mz = -0.936 / m87Len;
  const m87VoidCos = Math.cos(0.215);

  let i = 0;
  let attempts = 0;
  while (i < MAX_DEEP_STARS && attempts < MAX_DEEP_STARS * 4) {
    attempts++;
    const z = rng() * 2 - 1;
    const phi = rng() * Math.PI * 2;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const dx = r * Math.cos(phi);
    const dy = r * Math.sin(phi);
    const dz = z;

    // Carve out the BIG bottom-right M87* void + two natural negative-space pockets
    if (dx * mx + dy * my + dz * mz > m87VoidCos) continue;
    const pocket = Math.sin(dx * 5.2 + dy * 4.1) * Math.cos(dy * 6.0 - dz * 3.8);
    if (pocket > 0.56 && rng() < 0.76) continue;

    dirs[i * 3] = dx;
    dirs[i * 3 + 1] = dy;
    dirs[i * 3 + 2] = dz;

    const u = rng();
    // High-contrast distribution: ~72% distant dim, ~22% crisp clear, ~6% bright hero pinpoints
    const lum = u > 0.94 ? 0.95 + rng() * 0.72 : u > 0.72 ? 0.36 + rng() * 0.36 : 0.06 + rng() * 0.20;
    seeds[i * 4] = lum;
    seeds[i * 4 + 1] = rng();
    seeds[i * 4 + 2] = rng();
    seeds[i * 4 + 3] = u;
    i++;
  }

  return { dirs, seeds, count: i };
}

export function DeepStars() {
  const { gl, size } = useThree();
  const mode = useTenetStore((s) => s.mode);
  const level = useTenetStore((s) => s.quality.level) as QualityLevel;
  const lowPower = useTenetStore((s) => s.quality.lowPower);
  const reducedMotion = useTenetStore((s) => s.quality.reducedMotion);

  const geomRef = useRef<BufferGeometry | null>(null);
  const matRef = useRef<ShaderMaterial | null>(null);
  const smoothTimeRef = useRef(0);
  const emaDtRef = useRef(1 / 60);

  const buffers = useMemo(() => buildDeepStarBuffers(), []);
  const drawCount = lowPower || level >= 3 ? 1400 : level === 2 || isTouchDevice() ? 2800 : buffers.count;

  const initialUniforms = useMemo(
    () => ({
      uCamRight: { value: new Vector3(1, 0, 0) },
      uCamUp: { value: new Vector3(0, 1, 0) },
      uCamForward: { value: new Vector3(0, 0, -1) },
      uTanHalfFov: { value: Math.tan((34 * Math.PI) / 360) },
      uAspect: { value: 1.6 },
      uTime: { value: 0 },
      uDpr: { value: 1 },
      uRoll: { value: CAMERA_ROLL_RAD },
      uBrightness: { value: 1 },
    }),
    [],
  );

  useEffect(() => {
    if (geomRef.current) {
      geomRef.current.setDrawRange(0, drawCount);
      if (!geomRef.current.boundingSphere) {
        geomRef.current.boundingSphere = new Sphere(new Vector3(0, 0, 0), 20);
      }
    }
  }, [drawCount]);

  useFrame((_state, delta) => {
    const mat = matRef.current;
    if (!mat) return;

    const clampedDt = Math.min(delta, 1 / 30);
    emaDtRef.current = emaDtRef.current * 0.85 + clampedDt * 0.15;
    if (!reducedMotion) {
      smoothTimeRef.current += emaDtRef.current;
    }

    const cam = rig.bhCam;
    const dist = cam.distance || CAMERA_DISTANCE_DEFAULT;
    const sinInc = Math.sin(cam.inclination);
    const cosInc = Math.cos(cam.inclination);
    const sinAz = Math.sin(cam.azimuth);
    const cosAz = Math.cos(cam.azimuth);

    scratchCamPos.set(dist * sinInc * sinAz, dist * cosInc, dist * sinInc * cosAz);
    scratchForward.copy(scratchCamPos).negate().normalize();
    scratchRight.crossVectors(scratchForward, scratchWorldUp);
    if (scratchRight.lengthSq() < 1e-6) scratchRight.set(1, 0, 0);
    else scratchRight.normalize();
    scratchUp.crossVectors(scratchRight, scratchForward).normalize();

    if (cam.roll !== 0) {
      scratchRight.applyAxisAngle(scratchForward, cam.roll);
      scratchUp.applyAxisAngle(scratchForward, cam.roll);
    }

    const u = mat.uniforms;
    (u.uCamRight.value as Vector3).copy(scratchRight);
    (u.uCamUp.value as Vector3).copy(scratchUp);
    (u.uCamForward.value as Vector3).copy(scratchForward);
    u.uTanHalfFov.value = Math.tan((cam.fov * Math.PI) / 360);
    u.uAspect.value = size.width / Math.max(size.height, 1);
    u.uTime.value = smoothTimeRef.current;
    u.uDpr.value = gl.getPixelRatio();
    u.uRoll.value = cam.roll;
    u.uBrightness.value = MathUtils.damp(
      u.uBrightness.value as number,
      mode === 'fork' ? 1.0 : mode === 'ritual' ? 0.45 : 0.72,
      4.5,
      clampedDt,
    );
  });

  return (
    <points renderOrder={0} frustumCulled={false}>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute attach="attributes-position" args={[buffers.dirs, 3]} />
        <bufferAttribute attach="attributes-aSeed" args={[buffers.seeds, 4]} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        glslVersion={GLSL3}
        transparent
        depthTest={false}
        depthWrite={false}
        blending={AdditiveBlending}
        uniforms={initialUniforms}
        vertexShader={deepStarsVertexShader}
        fragmentShader={deepStarsFragmentShader}
      />
    </points>
  );
}
