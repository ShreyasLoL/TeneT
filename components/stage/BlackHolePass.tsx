'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { GLSL3, ShaderMaterial, Vector2, Vector3 } from 'three';
import { isTouchDevice, profileForLevel, type QualityLevel } from '@/lib/stage/tiers';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { hexToRgbNormalized, readPalette } from '@/lib/viz/palette';
import {
  ANALYTIC_B_END,
  ANALYTIC_B_START,
  DOPPLER_STRENGTH_DEFAULT,
  SHADOW_RADIUS_BC,
} from './blackhole/constants';
import { blackHoleFragmentShader, blackHoleVertexShader } from './shaders/blackhole.glsl';
import { readAmberLinear } from './shaders/color';

const scratchCamPos = new Vector3();
const scratchForward = new Vector3();
const scratchRight = new Vector3();
const scratchUp = new Vector3();
const scratchWorldUp = new Vector3(0, 1, 0);

function srgbChannelToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function hexToLinearVec3(hex: string, target: Vector3) {
  const [r, g, b] = hexToRgbNormalized(hex);
  target.set(srgbChannelToLinear(r), srgbChannelToLinear(g), srgbChannelToLinear(b));
}

export function BlackHolePass() {
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const level = useTenetStore((s) => s.quality.level) as QualityLevel;
  const lowPower = useTenetStore((s) => s.quality.lowPower);
  const profile = profileForLevel(level, isTouchDevice(), lowPower);
  const composerActive = profile.lensMode === 'full';
  const matRef = useRef<ShaderMaterial | null>(null);

  const initialUniforms = useMemo(() => {
    const [amr, amg, amb] = readAmberLinear();
    return {
      uCamPos: { value: new Vector3(0, 0, 42) },
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
      uTime: { value: 0 },
      uDopplerStrength: { value: DOPPLER_STRENGTH_DEFAULT },
      uHold: { value: 0 },
      uMode: { value: 0 },
      uWarp: { value: 0 },
      uHue: { value: 0 },
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
    hexToLinearVec3(pal.bg, mat.uniforms.uBgColor.value as Vector3);
    hexToLinearVec3(pal.accent, mat.uniforms.uAccent.value as Vector3);
    hexToLinearVec3(pal.accentDim, mat.uniforms.uAccentDim.value as Vector3);
    hexToLinearVec3(pal.accentAbyss, mat.uniforms.uAccentAbyss.value as Vector3);
    mat.uniforms.uOutputSrgb.value = composerActive ? 0.0 : 1.0;
    invalidate();
  }, [composerActive, invalidate, size.width, size.height]);

  useFrame(() => {
    const mat = matRef.current;
    if (!mat) return;
    const u = mat.uniforms;
    const cam = rig.bhCam;
    const sinInc = Math.sin(cam.inclination);
    const cosInc = Math.cos(cam.inclination);
    const sinAz = Math.sin(cam.azimuth);
    const cosAz = Math.cos(cam.azimuth);

    scratchCamPos.set(
      cam.distance * sinInc * sinAz,
      cam.distance * cosInc,
      cam.distance * sinInc * cosAz,
    );

    scratchForward.copy(scratchCamPos).negate().normalize();
    scratchRight.crossVectors(scratchForward, scratchWorldUp);
    if (scratchRight.lengthSq() < 1e-6) {
      scratchRight.set(1, 0, 0);
    } else {
      scratchRight.normalize();
    }
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
    u.uTime.value = rig.elapsedTime;
    u.uDopplerStrength.value = cam.dopplerStrength;
    u.uHold.value = rig.sealHold;
    u.uMode.value = rig.forkMode;
    u.uWarp.value = rig.forkWarp;
    u.uHue.value = rig.forkHue;
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
