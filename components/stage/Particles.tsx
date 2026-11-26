'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  GLSL3,
  InstancedBufferAttribute,
  type InstancedMesh,
  MathUtils,
  Matrix4,
  PlaneGeometry,
  ShaderMaterial,
  Sphere,
  Vector2,
  Vector3,
} from 'three';
import {
  bhParticlesRenderFragmentShader,
  bhParticlesRenderVertexShader,
} from '@/components/stage/shaders/bhParticlesRender.glsl';
import { useLivePreview, useTenetState, useToday } from '@/lib/api/hooks';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { buildCohortMap } from '@/lib/viz/cohorts';
import { readPalette } from '@/lib/viz/palette';
import { getBhAssets, subscribeBhAssets } from '@/stage/blackhole/assetStore';
import { BH_PARTICLE_COUNTS } from '@/stage/blackhole/constants';
import { detectGpuCaps } from '@/stage/blackhole/gpuCaps';
import { GpgpuParticleSim } from '@/stage/blackhole/gpgpuParticles';
import {
  buildCohortParticleBuffers,
  buildParticleInitBuffer,
  createCohortTexture,
  MAX_PARTICLES,
} from './particlesBuffers';
import { hexToLinearRgb } from './shaders/color';

const viewProjScratch = new Matrix4();
const viewportScratch = new Vector2();

export function Particles() {
  const { gl, size } = useThree();
  const today = useToday();
  const { data: state } = useTenetState();
  const live = useLivePreview(today);

  const cursor = useTenetStore((s) => s.cursor);
  const mode = useTenetStore((s) => s.mode);
  const meshRef = useRef<InstancedMesh | null>(null);
  const cohortTex = useMemo(() => createCohortTexture(), []);
  const targetDirRef = useRef(new Float32Array(16).fill(1));
  const simRef = useRef<GpgpuParticleSim | null>(null);

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
      dirs[slot.slotIndex] = !r || r.status === 'off' ? 0.35 : r.satisfied ? 1 : -1;
    }
  }, [cohortMap, cursor, live.results, sealedDays]);

  const { geometry, material, partAttr, cohortAttr } = useMemo(() => {
    const geom = new PlaneGeometry(1, 1);
    const pInit = buildParticleInitBuffer(null, MAX_PARTICLES);
    const cMeta = buildCohortParticleBuffers(null, MAX_PARTICLES);
    const pAttr = new InstancedBufferAttribute(pInit, 4);
    const cAttr = new InstancedBufferAttribute(cMeta, 2);
    geom.setAttribute('aPartInit', pAttr);
    geom.setAttribute('aCohortMeta', cAttr);
    geom.boundingSphere = new Sphere(new Vector3(0, 0, 0), 32);

    const pal = readPalette();
    const [or, og, ob] = hexToLinearRgb(pal.accent);
    const mat = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: bhParticlesRenderVertexShader,
      fragmentShader: bhParticlesRenderFragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending,
      uniforms: {
        uStatePos: { value: null },
        uCohortTex: { value: cohortTex },
        uDeflectionLut: { value: null },
        uBlackbodyLut: { value: null },
        uUseGpgpu: { value: 0 },
        uTime: { value: 0 },
        uSpinSense: { value: 1 },
        uKerrMode: { value: 0 },
        uHold: { value: 0 },
        uIntro: { value: 1 },
        uExposureScale: { value: 1 },
        uFocusArea: { value: -1 },
        uRecapJudge: { value: -1 },
        uRecapSpike: { value: 0 },
        uParticleScale: { value: 1 },
        uCamPos: { value: new Vector3() },
        uViewProj: { value: new Matrix4() },
        uViewport: { value: new Vector2(1280, 720) },
        uOrchid: { value: new Vector3(or, og, ob) },
      },
    });
    return { geometry: geom, material: mat, partAttr: pAttr, cohortAttr: cAttr };
  }, [cohortTex]);

  useEffect(() => {
    const cMeta = buildCohortParticleBuffers(cohortMap, MAX_PARTICLES);
    (cohortAttr.array as Float32Array).set(cMeta);
    cohortAttr.needsUpdate = true;
  }, [cohortAttr, cohortMap]);

  useEffect(() => {
    const caps = detectGpuCaps(gl.getContext() as WebGL2RenderingContext);
    const sim = new GpgpuParticleSim(caps.colorBufferFloat);
    simRef.current = sim;

    const unsub = subscribeBhAssets((assets) => {
      if (!assets) return;
      material.uniforms.uDeflectionLut.value = assets.deflectionLut;
      material.uniforms.uBlackbodyLut.value = assets.blackbodyLut;
      if (assets.particlesInit.length >= 4) {
        const baked = buildParticleInitBuffer(assets.particlesInit, MAX_PARTICLES);
        (partAttr.array as Float32Array).set(baked);
        partAttr.needsUpdate = true;
        if (!sim.isSeeded) sim.seed(gl, assets.particlesInit);
      }
    });

    return () => {
      unsub();
      sim.dispose();
      simRef.current = null;
      cohortTex.dispose();
      geometry.dispose();
      material.dispose();
    };
  }, [cohortTex, geometry, gl, material, partAttr]);

  useFrame((stateCtx, delta) => {
    const mesh = meshRef.current;
    const assets = getBhAssets();
    if (!mesh || !assets) {
      if (mesh) mesh.visible = false;
      return;
    }
    mesh.visible = rig.introProgress > 0.01;
    if (!mesh.visible) return;

    const dt = Math.min(delta, 1 / 30);
    const spinSense = rig.forkMode < -0.05 ? -1 : 1;
    const tier = rig.bhTier;
    const kerrMode = tier === 3 ? 1 : 0;

    // Update cohort direction & phase texture in place
    const targets = targetDirRef.current;
    const cData = cohortTex.image.data as Float32Array;
    let dirty = false;
    for (let i = 0; i < 16; i++) {
      rig.cohortDirSmooth[i] = MathUtils.damp(rig.cohortDirSmooth[i], targets[i], 4.5, dt);
      rig.cohortPhases[i] += rig.cohortDirSmooth[i] * spinSense * 0.36 * dt;
      if (Math.abs(cData[i * 4] - rig.cohortDirSmooth[i]) > 1e-4) {
        cData[i * 4] = rig.cohortDirSmooth[i];
        cData[i * 4 + 3] = rig.cohortPhases[i];
        dirty = true;
      }
    }
    if (dirty) cohortTex.needsUpdate = true;

    const sim = simRef.current;
    const useGpgpu = tier >= 2 && sim !== null && sim.isSeeded;
    if (useGpgpu) {
      sim.step(gl, dt, spinSense, kerrMode, rig.elapsedTime);
    }

    const tierMax =
      tier === 0 ? BH_PARTICLE_COUNTS.T0 : tier === 1 ? BH_PARTICLE_COUNTS.T1 : MAX_PARTICLES;
    const motionScale = 1 - Math.min(0.45, rig.bhCamMotion * 0.45);
    mesh.count = Math.max(1024, Math.floor(tierMax * motionScale * rig.bhRenderScale));

    stateCtx.camera.updateMatrixWorld();
    viewProjScratch.multiplyMatrices(
      stateCtx.camera.projectionMatrix,
      stateCtx.camera.matrixWorldInverse,
    );
    viewportScratch.set(size.width, size.height);

    const u = material.uniforms;
    u.uStatePos.value = useGpgpu ? sim.posTexture : null;
    u.uUseGpgpu.value = useGpgpu ? 1 : 0;
    u.uDeflectionLut.value = assets.deflectionLut;
    u.uBlackbodyLut.value = assets.blackbodyLut;
    u.uTime.value = rig.elapsedTime;
    u.uSpinSense.value = spinSense;
    u.uKerrMode.value = kerrMode;
    u.uHold.value = rig.sealHold;
    u.uIntro.value = rig.introProgress;
    u.uExposureScale.value = (mode === 'ritual' ? 0.6 : 1.0) * rig.bhExposureScale;
    u.uFocusArea.value = rig.focusAreaIndex;
    u.uRecapJudge.value = rig.recapJudgeIndex;
    u.uRecapSpike.value = rig.recapSpike;
    u.uParticleScale.value = tier === 0 ? 1.25 : tier === 1 ? 1.0 : 0.78;
    (u.uCamPos.value as Vector3).copy(stateCtx.camera.position);
    (u.uViewProj.value as Matrix4).copy(viewProjScratch);
    (u.uViewport.value as Vector2).copy(viewportScratch);
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, MAX_PARTICLES]}
      frustumCulled={false}
      renderOrder={2}
    />
  );
}
