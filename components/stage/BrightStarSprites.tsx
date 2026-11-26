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
  type ShaderMaterial,
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
  const matRef = useRef<ShaderMaterial | null>(null);
  const attrsRef = useRef<{
    dirFlux: InstancedBufferAttribute;
    temp: InstancedBufferAttribute;
  } | null>(null);
  const { size } = useThree();

  const geometry = useMemo(() => new PlaneGeometry(1, 1), []);
  const uniforms = useMemo(
    () => ({
      uDeflectionLut: { value: null },
      uBlackbodyLut: { value: null },
      uCamPos: { value: new Vector3() },
      uViewProj: { value: new Matrix4() },
      uViewport: { value: new Vector2(1280, 720) },
      uExposureScale: { value: 1 },
    }),
    [],
  );

  useEffect(() => {
    const dfAttr = new InstancedBufferAttribute(new Float32Array(MAX_INSTANCES * 4), 4);
    const tAttr = new InstancedBufferAttribute(new Float32Array(MAX_INSTANCES), 1);
    geometry.setAttribute('aStarDirFlux', dfAttr);
    geometry.setAttribute('aStarTemp', tAttr);
    attrsRef.current = { dirFlux: dfAttr, temp: tAttr };

    const unsub = subscribeBhAssets((assets) => {
      if (!assets || !assets.brightStars || assets.brightStars.length < 5 || !attrsRef.current) {
        return;
      }
      const src = assets.brightStars;
      const starCount = Math.min(BH_BRIGHT_STAR_COUNT, Math.floor(src.length / 5));
      const dfArr = attrsRef.current.dirFlux.array as Float32Array;
      const tArr = attrsRef.current.temp.array as Float32Array;

      for (let i = 0; i < starCount; i++) {
        const s = i * 5;
        for (let k = 0; k < 2; k++) {
          const inst = i * 2 + k;
          dfArr[inst * 4] = src[s];
          dfArr[inst * 4 + 1] = src[s + 1];
          dfArr[inst * 4 + 2] = src[s + 2];
          dfArr[inst * 4 + 3] = src[s + 3];
          tArr[inst] = src[s + 4];
        }
      }

      attrsRef.current.dirFlux.needsUpdate = true;
      attrsRef.current.temp.needsUpdate = true;
      if (matRef.current) {
        matRef.current.uniforms.uDeflectionLut.value = assets.deflectionLut;
        matRef.current.uniforms.uBlackbodyLut.value = assets.blackbodyLut;
      }
      if (meshRef.current) {
        meshRef.current.count = starCount * 2;
      }
    });

    return () => {
      unsub();
      attrsRef.current = null;
      geometry.dispose();
    };
  }, [geometry]);

  useFrame((state) => {
    const mesh = meshRef.current;
    const mat = matRef.current;
    const assets = getBhAssets();
    if (!mesh || !mat || !assets || !assets.deflectionLut || !assets.blackbodyLut) {
      if (mesh) mesh.visible = false;
      return;
    }
    const tier = rig.bhTier;
    const isVisible = tier >= 1 && rig.introProgress > 0.02;
    mesh.visible = isVisible;
    if (!isVisible) return;

    const starLimit = tier >= 2 ? BH_BRIGHT_STAR_COUNT * 2 : 1024;
    mesh.count = Math.min(starLimit, Math.floor(assets.brightStars.length / 5) * 2);

    state.camera.updateMatrixWorld();
    viewProjScratch.multiplyMatrices(state.camera.projectionMatrix, state.camera.matrixWorldInverse);
    viewportScratch.set(size.width, size.height);

    const u = mat.uniforms;
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
      args={[geometry, undefined, MAX_INSTANCES]}
      frustumCulled={false}
      renderOrder={1}
    >
      <shaderMaterial
        ref={matRef}
        glslVersion={GLSL3}
        vertexShader={bhStarSpritesVertexShader}
        fragmentShader={bhStarSpritesFragmentShader}
        transparent
        depthWrite={false}
        depthTest={false}
        blending={AdditiveBlending}
        uniforms={uniforms}
      />
    </instancedMesh>
  );
}
