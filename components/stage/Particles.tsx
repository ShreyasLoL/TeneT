'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  type BufferGeometry,
  DataTexture,
  FloatType,
  GLSL3,
  MathUtils,
  NearestFilter,
  RGBAFormat,
  type ShaderMaterial,
  Sphere,
  Vector3,
} from 'three';
import { useLivePreview, useTenetState, useToday } from '@/lib/api/hooks';
import { isTouchDevice, profileForLevel, type QualityLevel } from '@/lib/stage/tiers';
import { buildWordmarkTargets } from '@/lib/stage/wordmark';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { buildCohortMap } from '@/lib/viz/cohorts';
import { hexToRgbNormalized, readPalette } from '@/lib/viz/palette';
import { particlesFragmentShader, particlesVertexShader } from './shaders/particles';

const MAX_PARTICLES = 200_000;
const WORDMARK_COUNT = 6_000;

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

export function Particles() {
  const { gl } = useThree();
  const today = useToday();
  const { data: state } = useTenetState();
  const live = useLivePreview(today);

  const cursor = useTenetStore((s) => s.cursor);
  const mode = useTenetStore((s) => s.mode);
  const level = useTenetStore((s) => s.quality.level) as QualityLevel;
  const profile = profileForLevel(level, isTouchDevice());

  const matRef = useRef<ShaderMaterial | null>(null);
  const geomRef = useRef<BufferGeometry | null>(null);

  const cohortData = useMemo(() => {
    const arr = new Float32Array(16 * 4);
    for (let i = 0; i < 16; i++) {
      arr[i * 4] = 1;
      arr[i * 4 + 1] = 1;
      arr[i * 4 + 2] = i % 3;
      arr[i * 4 + 3] = 0;
    }
    return arr;
  }, []);

  const cohortTex = useMemo(() => {
    const tex = new DataTexture(cohortData, 16, 1, RGBAFormat, FloatType);
    tex.minFilter = NearestFilter;
    tex.magFilter = NearestFilter;
    tex.needsUpdate = true;
    return tex;
  }, [cohortData]);
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

  const staticBuffers = useMemo(() => {
    const rng = mulberry32(99173);
    const positions = new Float32Array(MAX_PARTICLES * 3);
    const seeds = new Float32Array(MAX_PARTICLES * 4);
    const targets = new Float32Array(MAX_PARTICLES * 3);
    const wordmark = buildWordmarkTargets(WORDMARK_COUNT, 7);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      seeds[i * 4] = rng();
      seeds[i * 4 + 1] = rng();
      seeds[i * 4 + 2] = rng();
      seeds[i * 4 + 3] = rng();

      if (i < WORDMARK_COUNT) {
        targets[i * 3] = wordmark[i * 3];
        targets[i * 3 + 1] = wordmark[i * 3 + 1];
        targets[i * 3 + 2] = wordmark[i * 3 + 2];
      }
    }

    return { positions, seeds, targets };
  }, []);

  const cohortBuffers = useMemo(() => {
    const cohorts = new Float32Array(MAX_PARTICLES);
    const areas = new Float32Array(MAX_PARTICLES);
    const slotCount = cohortMap?.slots.length || 3;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const slot = cohortMap?.slots[i % slotCount];
      cohorts[i] = slot ? slot.slotIndex : i % 3;
      areas[i] = slot ? slot.areaIndex % 3 : i % 3;
    }
    return { cohorts, areas };
  }, [cohortMap]);

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
        dirs[slot.slotIndex] = 0.25;
      } else {
        dirs[slot.slotIndex] = r.satisfied ? 1 : -1;
      }
    }
  }, [cohortMap, cursor, live.results, sealedDays]);

  const uniforms = useMemo(() => {
    const pal = readPalette();
    const [abr, abg, abb] = hexToRgbNormalized(pal.accentAbyss);
    const [ar, ag, ab] = hexToRgbNormalized(pal.accent);
    const [hr, hg, hb] = hexToRgbNormalized(pal.accentHot);
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
      uOrchidAbyss: { value: new Vector3(abr, abg, abb) },
      uOrchid: { value: new Vector3(ar, ag, ab) },
      uOrchidHot: { value: new Vector3(hr, hg, hb) },
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
        geomRef.current.boundingSphere = new Sphere(new Vector3(0, 0, 0), 18);
      }
    }
  }, [profile.particles]);

  useFrame((_state, delta) => {
    const mat = matRef.current;
    if (!mat) return;
    const dt = Math.min(delta, 1 / 20);
    const dirFactor = rig.uDir;
    const scrubBoost = 1 + Math.min(6, Math.abs(rig.cursorVelocity) * 1.4);

    const targets = targetDirRef.current;
    const tex = cohortTexRef.current;
    const data = tex.image.data as Float32Array;
    let dirty = false;
    for (let i = 0; i < 16; i++) {
      rig.cohortDirSmooth[i] = MathUtils.damp(rig.cohortDirSmooth[i], targets[i], 4.5, dt);
      const omega0 = 0.28 + (i % 3) * 0.08;
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
      mode === 'ritual' ? 0.38 : 1.0,
      5.0,
      dt,
    );
    mat.uniforms.uFocusArea.value = mode === 'area' ? rig.focusAreaIndex : -1;
    mat.uniforms.uRecapJudge.value = rig.recapJudgeIndex;
    mat.uniforms.uRecapSpike.value = rig.recapSpike;
  });

  if (profile.particles <= 0) return null;

  return (
    <points>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[staticBuffers.positions, 3]}
        />
        <bufferAttribute
          attach="attributes-aSeed"
          args={[staticBuffers.seeds, 4]}
        />
        <bufferAttribute
          attach="attributes-aCohort"
          args={[cohortBuffers.cohorts, 1]}
        />
        <bufferAttribute
          attach="attributes-aArea"
          args={[cohortBuffers.areas, 1]}
        />
        <bufferAttribute
          attach="attributes-aTarget"
          args={[staticBuffers.targets, 3]}
        />
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
