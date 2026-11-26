'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  GLSL3,
  InstancedBufferAttribute,
  type InstancedMesh,
  Matrix4,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import {
  bhStarSpritesFragmentShader,
  bhStarSpritesVertexShader,
} from '@/components/stage/shaders/bhStarSprites.glsl';
import { rig } from '@/lib/store/rig';
import { getBhAssets, subscribeBhAssets } from '@/stage/blackhole/assetStore';
import { BH_BRIGHT_STAR_COUNT } from '@/stage/blackhole/constants';

const MAX_INSTANCES = BH_BRIGHT_STAR_COUNT * 2;
const viewProjScratch = new Matrix4();
const viewportScratch = new Vector2();

export function BrightStarSprites() {
  const meshRef = useRef<InstancedMesh | null>(null);
  const { size } = useThree();

  const { geometry, material, dirFluxAttr, tempAttr } = useMemo(() => {
    const geom = new PlaneGeometry(1, 1);
    const dirFluxData = new Float32Array(MAX_INSTANCES * 4);
    const tempData = new Float32Array(MAX_INSTANCES);
    const dfAttr = new InstancedBufferAttribute(dirFluxData, 4);
    const tAttr = new InstancedBufferAttribute(tempData, 1);
    geom.setAttribute('aStarDirFlux', dfAttr);
    geom.setAttribute('aStarTemp', tAttr);

    const mat = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: bhStarSpritesVertexShader,
      fragmentShader: bhStarSpritesFragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending,
      uniforms: {
        uDeflectionLut: { value: null },
        uBlackbodyLut: { value: null },
        uCamPos: { value: new Vector3() },
        uViewProj: { value: new Matrix4() },
        uViewport: { value: new Vector2(1280, 720) },
        uExposureScale: { value: 1 },
      },
    });

    return { geometry: geom, material: mat, dirFluxAttr: dfAttr, tempAttr: tAttr };
  }, []);

  useEffect(() => {
    const unsub = subscribeBhAssets((assets) => {
      if (!assets || !assets.brightStars || assets.brightStars.length < 5) return;
      const src = assets.brightStars;
      const starCount = Math.min(BH_BRIGHT_STAR_COUNT, Math.floor(src.length / 5));
      const dfArr = dirFluxAttr.array as Float32Array;
      const tArr = tempAttr.array as Float32Array;

      for (let i = 0; i < starCount; i++) {
        const s = i * 5;
        const x = src[s];
        const y = src[s + 1];
        const z = src[s + 2];
        const flux = src[s + 3];
        const temp = src[s + 4];
        for (let k = 0; k < 2; k++) {
          const inst = i * 2 + k;
          dfArr[inst * 4] = x;
          dfArr[inst * 4 + 1] = y;
          dfArr[inst * 4 + 2] = z;
          dfArr[inst * 4 + 3] = flux;
          tArr[inst] = temp;
        }
      }

      dirFluxAttr.needsUpdate = true;
      tempAttr.needsUpdate = true;
      material.uniforms.uDeflectionLut.value = assets.deflectionLut;
      material.uniforms.uBlackbodyLut.value = assets.blackbodyLut;
      if (meshRef.current) {
        meshRef.current.count = starCount * 2;
      }
    });
    return () => {
      unsub();
      geometry.dispose();
      material.dispose();
    };
  }, [dirFluxAttr, geometry, material, tempAttr]);

  useFrame((state) => {
    const mesh = meshRef.current;
    const assets = getBhAssets();
    if (!mesh || !assets || !assets.deflectionLut || !assets.blackbodyLut) {
      if (mesh) mesh.visible = false;
      return;
    }
    const tier = rig.bhTier;
    const isVisible = tier >= 1 && rig.introProgress > 0.02;
    mesh.visible = isVisible;
    if (!isVisible) return;

    const starLimit = tier >= 2 ? BH_BRIGHT_STAR_COUNT * 2 : 1024;
    const count = Math.min(starLimit, Math.floor(assets.brightStars.length / 5) * 2);
    mesh.count = count;

    state.camera.updateMatrixWorld();
    viewProjScratch.multiplyMatrices(state.camera.projectionMatrix, state.camera.matrixWorldInverse);
    viewportScratch.set(size.width, size.height);

    const u = material.uniforms;
    u.uDeflectionLut.value = assets.deflectionLut;
    u.uBlackbodyLut.value = assets.blackbodyLut;
    (u.uCamPos.value as Vector3).copy(state.camera.position);
    (u.uViewProj.value as Matrix4).copy(viewProjScratch);
    (u.uViewport.value as Vector2).copy(viewportScratch);
    u.uExposureScale.value = rig.bhExposureScale * Math.min(1, rig.introProgress * 1.4);
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, MAX_INSTANCES]}
      frustumCulled={false}
      renderOrder={1}
    />
  );
}
