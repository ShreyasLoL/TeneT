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
  type ShaderMaterial,
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
  const matRef = useRef<ShaderMaterial | null>(null);
  const cohortTex = useMemo(() => createCohortTexture(), []);
  const cohortTexRef = useRef(cohortTex);
  const attrsRef = useRef<{
    part: InstancedBufferAttribute;
    cohort: InstancedBufferAttribute;
  } | null>(null);
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

  const geometry = useMemo(() => {
    const geom = new PlaneGeometry(1, 1);
    geom.boundingSphere = new Sphere(new Vector3(0, 0, 0), 32);
    return geom;
  }, []);

  const uniforms = useMemo(() => {
    const pal = readPalette();
    const [or, og, ob] = hexToLinearRgb(pal.accent);
    return {
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
    };
  }, [cohortTex]);

  useEffect(() => {
    const pInit = buildParticleInitBuffer(null, MAX_PARTICLES);
    const cMeta = buildCohortParticleBuffers(null, MAX_PARTICLES);
    const pAttr = new InstancedBufferAttribute(pInit, 4);
    const cAttr = new InstancedBufferAttribute(cMeta, 2);
    geometry.setAttribute('aPartInit', pAttr);
    geometry.setAttribute('aCohortMeta', cAttr);
    attrsRef.current = { part: pAttr, cohort: cAttr };

    const tex = cohortTexRef.current;
    const caps = detectGpuCaps(gl.getContext() as WebGL2RenderingContext);
    const sim = new GpgpuParticleSim(caps.colorBufferFloat);
    simRef.current = sim;

    const unsub = subscribeBhAssets((assets) => {
      if (!assets) return;
      if (matRef.current) {
        matRef.current.uniforms.uDeflectionLut.value = assets.deflectionLut;
        matRef.current.uniforms.uBlackbodyLut.value = assets.blackbodyLut;
      }
      if (assets.particlesInit.length >= 4 && attrsRef.current) {
        const baked = buildParticleInitBuffer(assets.particlesInit, MAX_PARTICLES);
        (attrsRef.current.part.array as Float32Array).set(baked);
        attrsRef.current.part.needsUpdate = true;
        if (!sim.isSeeded) sim.seed(gl, assets.particlesInit);
      }
    });

    return () => {
      unsub();
      sim.dispose();
      simRef.current = null;
      attrsRef.current = null;
      tex.dispose();
      geometry.dispose();
    };
  }, [geometry, gl]);

  useEffect(() => {
    const attrs = attrsRef.current;
    if (!attrs) return;
    const cMeta = buildCohortParticleBuffers(cohortMap, MAX_PARTICLES);
    (attrs.cohort.array as Float32Array).set(cMeta);
    attrs.cohort.needsUpdate = true;
  }, [cohortMap]);

  useFrame((stateCtx, delta) => {
    const mesh = meshRef.current;
    const mat = matRef.current;
    const assets = getBhAssets();
    if (!mesh || !mat || !assets) {
      if (mesh) mesh.visible = false;
      return;
    }
    mesh.visible = rig.introProgress > 0.01;
    if (!mesh.visible) return;

    const dt = Math.min(delta, 1 / 30);
    const spinSense = rig.forkMode < -0.05 ? -1 : 1;
    const tier = rig.bhTier;
    const kerrMode = tier === 3 ? 1 : 0;

    const targets = targetDirRef.current;
    const tex = cohortTexRef.current;
    const cData = tex.image.data as Float32Array;
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
    if (dirty) tex.needsUpdate = true;

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

    const u = mat.uniforms;
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
      args={[geometry, undefined, MAX_PARTICLES]}
      frustumCulled={false}
      renderOrder={2}
    >
      <shaderMaterial
        ref={matRef}
        glslVersion={GLSL3}
        vertexShader={bhParticlesRenderVertexShader}
        fragmentShader={bhParticlesRenderFragmentShader}
        transparent
        depthWrite={false}
        depthTest={false}
        blending={AdditiveBlending}
        uniforms={uniforms}
      />
    </instancedMesh>
  );
}
