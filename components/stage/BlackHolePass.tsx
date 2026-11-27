'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  CubeTexture,
  GLSL3,
  MathUtils,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  type WebGLCubeRenderTarget,
} from 'three';
import { isTouchDevice, profileForLevel, type QualityLevel } from '@/lib/stage/tiers';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { hexToRgbNormalized, readPalette } from '@/lib/viz/palette';
import { bakeDeepSpaceCube } from './blackhole/bakeSkyCube';
import {
  ANALYTIC_B_END,
  ANALYTIC_B_START,
  CAMERA_DISTANCE_DEFAULT,
  CAMERA_FOV_DEG,
  CAMERA_INCLINATION_RAD,
  CAMERA_ROLL_RAD,
  DOPPLER_STRENGTH_DEFAULT,
  INTEGRATOR_STEPS_FULL,
  INTEGRATOR_STEPS_HIGH,
  INTEGRATOR_STEPS_MID,
  SHADOW_RADIUS_BC,
} from './blackhole/constants';
import { blackHoleFragmentShader, blackHoleVertexShader } from './shaders/blackhole.glsl';
import { readAmberLinear } from './shaders/color';

const scratchCamPos = new Vector3();
const scratchForward = new Vector3();
const scratchRight = new Vector3();
const scratchUp = new Vector3();
const scratchWorldUp = new Vector3(0, 1, 0);
const FALLBACK_CUBE = new CubeTexture();

function srgbChannelToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function hexToLinearVec3(hex: string, target: Vector3) {
  const [r, g, b] = hexToRgbNormalized(hex);
  target.set(srgbChannelToLinear(r), srgbChannelToLinear(g), srgbChannelToLinear(b));
}

export function BlackHolePass() {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const level = useTenetStore((s) => s.quality.level) as QualityLevel;
  const lowPower = useTenetStore((s) => s.quality.lowPower);
  const reducedMotion = useTenetStore((s) => s.quality.reducedMotion);
  const touch = isTouchDevice();
  const profile = profileForLevel(level, touch, lowPower);
  const composerActive = profile.lensMode === 'full';
  const cubeFaceSize = lowPower || level >= 2 ? 512 : 1024;

  const matRef = useRef<ShaderMaterial | null>(null);
  const skyTargetRef = useRef<WebGLCubeRenderTarget | null>(null);
  const emaDtRef = useRef(1 / 60);
  const smoothTimeRef = useRef(0);
  const diskTimeRef = useRef(0);

  const initialUniforms = useMemo(() => {
    const [amr, amg, amb] = readAmberLinear();
    return {
      uCamPos: { value: new Vector3(0, 0, CAMERA_DISTANCE_DEFAULT) },
      uCamRight: { value: new Vector3(1, 0, 0) },
      uCamUp: { value: new Vector3(0, 1, 0) },
      uCamForward: { value: new Vector3(0, 0, -1) },
      uTanHalfFov: { value: Math.tan((34 * Math.PI) / 360) },
      uAspect: { value: 1.6 },
      uResolution: { value: new Vector2(1440, 900) },
      uShadowBc: { value: SHADOW_RADIUS_BC },
      uAnalyticBStart: { value: ANALYTIC_B_START },
      uAnalyticBEnd: { value: ANALYTIC_B_END },
      uMaxSteps: { value: 64 },
      uSkyCube: { value: FALLBACK_CUBE },
      uTime: { value: 0 },
      uDiskFlow: { value: new Vector4(0, 0, 0, 1) },
      uDiskQuality: { value: 1 },
      uSkyRot: { value: new Vector2(1, 0) },
      uRingAnim: { value: new Vector3(0.72, 0, 0) },
      uDopplerStrength: { value: DOPPLER_STRENGTH_DEFAULT },
      uHold: { value: 0 },
      uMode: { value: 0 },
      uWarp: { value: 0 },
      uHue: { value: 0 },
      uSkyReveal: { value: rig.introSky },
      uShadowReveal: { value: rig.introShadow },
      uLensStrength: { value: rig.introLens },
      uDiskReveal: { value: rig.introDisk },
      uDiskSweep: { value: rig.introDiskSweep },
      uRingReveal: { value: rig.introRing },
      uOutputSrgb: { value: 0 },
      uBgColor: { value: new Vector3(0.003, 0.002, 0.006) },
      uAccent: { value: new Vector3(0.75, 0.07, 0.82) },
      uAccentDim: { value: new Vector3(0.34, 0.03, 0.38) },
      uAccentAbyss: { value: new Vector3(0.11, 0.01, 0.13) },
      uAmber: { value: new Vector3(amr, amg, amb) },
      uColdBlue: { value: new Vector3(0.12, 0.42, 0.96) },
    };
  }, []);

  useEffect(() => {
    const mat = matRef.current;
    if (!mat) return;
    const pal = readPalette();
    const bg = mat.uniforms.uBgColor.value as Vector3;
    const accent = mat.uniforms.uAccent.value as Vector3;
    const accentDim = mat.uniforms.uAccentDim.value as Vector3;
    const accentAbyss = mat.uniforms.uAccentAbyss.value as Vector3;
    const amber = mat.uniforms.uAmber.value as Vector3;
    hexToLinearVec3(pal.bg, bg);
    hexToLinearVec3(pal.accent, accent);
    hexToLinearVec3(pal.accentDim, accentDim);
    hexToLinearVec3(pal.accentAbyss, accentAbyss);
    mat.uniforms.uOutputSrgb.value = composerActive ? 0.0 : 1.0;

    const prevTarget = skyTargetRef.current;
    const baked = bakeDeepSpaceCube(gl, cubeFaceSize, { bg, accent, accentDim, accentAbyss, amber });
    skyTargetRef.current = baked;
    mat.uniforms.uSkyCube.value = baked.texture;
    if (prevTarget) prevTarget.dispose();

    invalidate();
    return () => {
      baked.dispose();
      if (skyTargetRef.current === baked) skyTargetRef.current = null;
    };
  }, [composerActive, cubeFaceSize, gl, invalidate]);

  useFrame((_state, delta) => {
    const mat = matRef.current;
    if (!mat) return;

    const clampedDt = Math.min(delta, 1 / 30);
    emaDtRef.current = emaDtRef.current * 0.85 + clampedDt * 0.15;
    const retro = Math.min(1, Math.max(0, -rig.forkMode)) * rig.forkHue;
    const prog = Math.min(1, Math.max(0, rig.forkMode)) * rig.forkHue;
    const diskDir = 1.0 - retro * 1.55 + prog * 0.9;
    if (!reducedMotion) {
      smoothTimeRef.current += emaDtRef.current;
      diskTimeRef.current += emaDtRef.current * diskDir;
    }
    const t = smoothTimeRef.current;

    const cam = rig.bhCam;
    cam.steps =
      lowPower || level >= 4
        ? 36
        : level >= 2
          ? INTEGRATOR_STEPS_MID
          : level === 0 && !touch
            ? INTEGRATOR_STEPS_HIGH
            : INTEGRATOR_STEPS_FULL;
    if (!rig.forkActive && !rig.introActive && !reducedMotion) {
      cam.inclination = MathUtils.damp(cam.inclination, CAMERA_INCLINATION_RAD + Math.sin(t * 0.14) * 0.036, 3.2, clampedDt);
      cam.distance = MathUtils.damp(cam.distance, CAMERA_DISTANCE_DEFAULT + Math.sin(t * 0.105 + 0.8) * 1.6, 3.2, clampedDt);
      cam.azimuth = MathUtils.damp(cam.azimuth, Math.sin(t * 0.055) * 0.032, 3.2, clampedDt);
      cam.roll = MathUtils.damp(cam.roll, CAMERA_ROLL_RAD + Math.sin(t * 0.095 + 1.4) * 0.016, 3.2, clampedDt);
      cam.fov = MathUtils.damp(cam.fov, CAMERA_FOV_DEG, 3.2, clampedDt);
    }

    const u = mat.uniforms;
    const trem = rig.introTremor;
    const tremAz = trem > 1e-4 ? (Math.sin(rig.elapsedTime * 53.0) * 0.6 + Math.sin(rig.elapsedTime * 89.0 + 1.1) * 0.4) * trem * 0.0042 : 0;
    const tremInc = trem > 1e-4 ? (Math.cos(rig.elapsedTime * 61.0 + 0.4) * 0.6 + Math.sin(rig.elapsedTime * 97.0) * 0.4) * trem * 0.0032 : 0;
    const sinInc = Math.sin(cam.inclination + tremInc);
    const cosInc = Math.cos(cam.inclination + tremInc);
    const sinAz = Math.sin(cam.azimuth + tremAz);
    const cosAz = Math.cos(cam.azimuth + tremAz);

    scratchCamPos.set(cam.distance * sinInc * sinAz, cam.distance * cosInc, cam.distance * sinInc * cosAz);

    scratchForward.copy(scratchCamPos).negate().normalize();
    scratchRight.crossVectors(scratchForward, scratchWorldUp);
    if (scratchRight.lengthSq() < 1e-6) scratchRight.set(1, 0, 0);
    else scratchRight.normalize();
    scratchUp.crossVectors(scratchRight, scratchForward).normalize();

    if (cam.roll !== 0) {
      scratchRight.applyAxisAngle(scratchForward, cam.roll);
      scratchUp.applyAxisAngle(scratchForward, cam.roll);
    }

    (u.uCamPos.value as Vector3).copy(scratchCamPos);
    (u.uCamForward.value as Vector3).copy(scratchForward);
    (u.uCamRight.value as Vector3).copy(scratchRight);
    (u.uCamUp.value as Vector3).copy(scratchUp);
    u.uTanHalfFov.value = Math.tan((cam.fov * Math.PI) / 360);
    u.uAspect.value = size.width / Math.max(size.height, 1);
    (u.uResolution.value as Vector2).set(size.width, size.height);
    u.uMaxSteps.value = cam.steps;
    u.uTime.value = t;
    const rawA = diskTimeRef.current * 0.042;
    const phaseA = rawA - Math.floor(rawA);
    const rawB = rawA + 0.5;
    const phaseB = rawB - Math.floor(rawB);
    const wB = 0.5 + 0.5 * Math.cos(phaseA * 6.2831853);
    const wA = 1.0 - wB;
    const invNorm = 1.0 / Math.sqrt(wA * wA + wB * wB);
    (u.uDiskFlow.value as Vector4).set((phaseA - 0.5) / 0.042, (phaseB - 0.5) / 0.042, wA * invNorm, wB * invNorm);
    const rot = Math.sin(t * 0.035) * 0.022;
    (u.uSkyRot.value as Vector2).set(Math.cos(rot), Math.sin(rot));
    const glintTheta = ((t * 0.19) % 6.2831853) - Math.PI;
    const glintWave = Math.max(0.0, Math.sin(t * 0.28 + 0.9));
    (u.uRingAnim.value as Vector3).set(0.72 + 0.28 * Math.sin(t * 0.34), glintTheta, Math.pow(glintWave, 6.0) * 0.75);
    u.uDiskQuality.value = profile.simplifiedDisk ? 0.0 : 1.0;
    u.uDopplerStrength.value = cam.dopplerStrength;
    u.uHold.value = rig.sealHold;
    u.uMode.value = rig.forkMode;
    u.uWarp.value = rig.forkWarp;
    u.uHue.value = rig.forkHue;
    u.uSkyReveal.value = rig.introSky;
    u.uShadowReveal.value = rig.introShadow;
    u.uLensStrength.value = rig.introLens;
    u.uDiskReveal.value = rig.introDisk;
    u.uDiskSweep.value = rig.introDiskSweep;
    u.uRingReveal.value = rig.introRing;
    u.uOutputSrgb.value = composerActive ? 0.0 : 1.0;
  }, -10);

  return (
    <mesh frustumCulled={false} renderOrder={-10}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        glslVersion={GLSL3}
        depthTest={false}
        depthWrite={false}
        uniforms={initialUniforms}
        vertexShader={blackHoleVertexShader}
        fragmentShader={blackHoleFragmentShader}
      />
    </mesh>
  );
}
