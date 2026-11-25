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
import { useLivePreview, useTenetState, useToday } from '@/lib/api/hooks';
import { isTouchDevice, NORMAL_PARTICLES, profileForLevel, type QualityLevel } from '@/lib/stage/tiers';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { buildCohortMap } from '@/lib/viz/cohorts';
import { readPalette } from '@/lib/viz/palette';
import {
  buildCohortParticleBuffers,
  buildStaticParticleBuffers,
  createCohortTexture,
} from './particlesBuffers';
import { hexToLinearRgb, readAmberLinear } from './shaders/color';
import { particlesFragmentShader, particlesVertexShader } from './shaders/particles';

export function Particles() {
  const { gl } = useThree();
  const today = useToday();
  const { data: state } = useTenetState();
  const live = useLivePreview(today);

  const cursor = useTenetStore((s) => s.cursor);
  const mode = useTenetStore((s) => s.mode);
  const level = useTenetStore((s) => s.quality.level) as QualityLevel;
  const lowPower = useTenetStore((s) => s.quality.lowPower);
  const profile = profileForLevel(level, isTouchDevice(), lowPower);

  const matRef = useRef<ShaderMaterial | null>(null);
  const geomRef = useRef<BufferGeometry | null>(null);

  const cohortTex = useMemo(() => createCohortTexture(), []);
  const cohortTexRef = useRef(cohortTex);

  const areasDef = state?.definitions.areas;
  const trackablesDef = state?.definitions.trackables;
  const sealedDays = state?.days;

  const cohortMap = useMemo(() => {
    if (!areasDef || !trackablesDef || !sealedDays) return null;
    return buildCohortMap(
      areasDef,
      trackablesDef,
      sealedDays.map((d) => d.results),
    );
  }, [areasDef, trackablesDef, sealedDays]);

  const staticBuffers = useMemo(() => buildStaticParticleBuffers(NORMAL_PARTICLES), []);
  const cohortMeta = useMemo(
    () => buildCohortParticleBuffers(cohortMap, NORMAL_PARTICLES),
    [cohortMap],
  );

  const targetDirRef = useRef(new Float32Array(16).fill(1));

  useEffect(() => {
    const dirs = targetDirRef.current;
    if (!cohortMap || !sealedDays) {
      dirs.fill(1);
      return;
    }

    const sealedDay = sealedDays.find((d) => d.day === cursor);
    const sourceResults = sealedDay ? sealedDay.results : live.results;
    const byKey = new Map(sourceResults.map((r) => [r.key, r]));

    for (const slot of cohortMap.slots) {
      const r = byKey.get(slot.key);
      if (!r || r.status === 'off') {
        dirs[slot.slotIndex] = 0.35;
      } else {
        dirs[slot.slotIndex] = r.satisfied ? 1 : -1;
      }
    }
  }, [cohortMap, cursor, live.results, sealedDays]);

  const uniforms = useMemo(() => {
    const pal = readPalette();
    const [abr, abg, abb] = hexToLinearRgb(pal.accentAbyss);
    const [ar, ag, ab] = hexToLinearRgb(pal.accent);
    const [amr, amg, amb] = readAmberLinear();
    return {
      uCohortTex: { value: cohortTex },
      uDpr: { value: 1 },
      uIntro: { value: 1 },
      uTime: { value: 0 },
      uHold: { value: 0 },
      uLive: { value: 1 },
      uBrightness: { value: 1 },
      uFocusArea: { value: -1 },
      uRecapJudge: { value: -1 },
      uRecapSpike: { value: 0 },
      uAmber: { value: new Vector3(amr, amg, amb) },
      uOrchid: { value: new Vector3(ar, ag, ab) },
      uViolet: { value: new Vector3(abr * 1.35 + 0.04, abg * 1.2 + 0.02, abb * 2.4 + 0.18) },
      uColdBlue: { value: new Vector3(0.035, 0.22, 0.88) },
    };
  }, [cohortTex]);

  useEffect(() => {
    const tex = cohortTexRef.current;
    return () => {
      tex.dispose();
    };
  }, []);

  useEffect(() => {
    if (geomRef.current) {
      geomRef.current.setDrawRange(0, profile.particles);
      if (!geomRef.current.boundingSphere) {
        geomRef.current.boundingSphere = new Sphere(new Vector3(0, 0, 0), 24);
      }
    }
  }, [profile.particles]);

  useFrame((_state, delta) => {
    const mat = matRef.current;
    if (!mat) return;
    const dt = Math.min(delta, 1 / 30);
    const dirFactor = rig.uDir;
    const scrubBoost = 1 + Math.min(6, Math.abs(rig.cursorVelocity) * 1.4);

    const targets = targetDirRef.current;
    const tex = cohortTexRef.current;
    const data = tex.image.data as Float32Array;
    let dirty = false;
    for (let i = 0; i < 16; i++) {
      rig.cohortDirSmooth[i] = MathUtils.damp(rig.cohortDirSmooth[i], targets[i], 4.5, dt);
      const omega0 = 0.32 + (i % 3) * 0.09;
      rig.cohortPhases[i] += rig.cohortDirSmooth[i] * dirFactor * omega0 * scrubBoost * dt;
      if (
        Math.abs(data[i * 4] - rig.cohortDirSmooth[i]) > 1e-4 ||
        Math.abs(data[i * 4 + 3] - rig.cohortPhases[i]) > 1e-4
      ) {
        data[i * 4] = rig.cohortDirSmooth[i];
        data[i * 4 + 3] = rig.cohortPhases[i];
        dirty = true;
      }
    }
    if (dirty) tex.needsUpdate = true;

    mat.uniforms.uDpr.value = gl.getPixelRatio();
    mat.uniforms.uIntro.value = rig.introProgress;
    mat.uniforms.uTime.value = rig.elapsedTime;
    mat.uniforms.uHold.value = rig.sealHold;
    mat.uniforms.uBrightness.value = MathUtils.damp(
      mat.uniforms.uBrightness.value as number,
      mode === 'ritual' ? 0.58 : 1.0,
      5.0,
      dt,
    );
    mat.uniforms.uFocusArea.value = mode === 'area' ? rig.focusAreaIndex : -1;
    mat.uniforms.uRecapJudge.value = rig.recapJudgeIndex;
    mat.uniforms.uRecapSpike.value = rig.recapSpike;
  });

  if (profile.particles <= 0) return null;

  return (
    <points frustumCulled={false}>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute attach="attributes-position" args={[staticBuffers.spawn, 3]} />
        <bufferAttribute attach="attributes-aSeed" args={[staticBuffers.seeds, 4]} />
        <bufferAttribute attach="attributes-aMeta" args={[cohortMeta, 2]} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        glslVersion={GLSL3}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        uniforms={uniforms}
        vertexShader={particlesVertexShader}
        fragmentShader={particlesFragmentShader}
      />
    </points>
  );
}
