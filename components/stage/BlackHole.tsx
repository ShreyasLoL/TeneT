'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { AdditiveBlending, GLSL3, type Mesh, type ShaderMaterial, Vector3 } from 'three';
import { rig } from '@/lib/store/rig';
import { readPalette } from '@/lib/viz/palette';
import {
  haloFragmentShader,
  haloVertexShader,
  horizonFragmentShader,
  horizonVertexShader,
} from './shaders/blackHole';
import { hexToLinearRgb, readAmberLinear } from './shaders/color';

/**
 * 3D Black Event Horizon Sphere (depth-writing obsidian core + grazing photon ring)
 * paired with a camera-facing Lensed Halo & Back-of-Disk relativistic arc billboard.
 */
export function BlackHole() {
  const horizonMeshRef = useRef<Mesh | null>(null);
  const horizonMatRef = useRef<ShaderMaterial | null>(null);
  const haloMeshRef = useRef<Mesh | null>(null);
  const haloMatRef = useRef<ShaderMaterial | null>(null);

  const { horizonUniforms, haloUniforms } = useMemo(() => {
    const pal = readPalette();
    const [ar, ag, ab] = hexToLinearRgb(pal.accent);
    const [abr, abg, abb] = hexToLinearRgb(pal.accentAbyss);
    const [amr, amg, amb] = readAmberLinear();

    const orchid = new Vector3(ar, ag, ab);
    const amber = new Vector3(amr, amg, amb);
    const violet = new Vector3(abr * 1.35 + 0.04, abg * 1.2 + 0.02, abb * 2.4 + 0.18);
    const coldBlue = new Vector3(0.035, 0.22, 0.88);

    return {
      horizonUniforms: {
        uIntro: { value: 1 },
        uHold: { value: 0 },
        uMode: { value: 0 },
        uWarp: { value: 0 },
        uHue: { value: 0 },
        uOrchid: { value: orchid },
        uAmber: { value: amber },
        uColdBlue: { value: coldBlue },
      },
      haloUniforms: {
        uTime: { value: 0 },
        uIntro: { value: 1 },
        uHold: { value: 0 },
        uMode: { value: 0 },
        uWarp: { value: 0 },
        uHue: { value: 0 },
        uAmber: { value: amber.clone() },
        uOrchid: { value: orchid.clone() },
        uViolet: { value: violet },
        uColdBlue: { value: coldBlue.clone() },
      },
    };
  }, []);

  useFrame((state) => {
    const haloMesh = haloMeshRef.current;
    if (haloMesh) {
      haloMesh.quaternion.copy(state.camera.quaternion);
      haloMesh.rotateZ(-0.39);
    }

    const hMat = horizonMatRef.current;
    if (hMat) {
      hMat.uniforms.uIntro.value = rig.introProgress;
      hMat.uniforms.uHold.value = rig.sealHold;
      hMat.uniforms.uMode.value = rig.forkMode;
      hMat.uniforms.uWarp.value = rig.forkWarp;
      hMat.uniforms.uHue.value = rig.forkHue;
    }

    const lMat = haloMatRef.current;
    if (lMat) {
      lMat.uniforms.uTime.value = rig.elapsedTime;
      lMat.uniforms.uIntro.value = rig.introProgress;
      lMat.uniforms.uHold.value = rig.sealHold;
      lMat.uniforms.uMode.value = rig.forkMode;
      lMat.uniforms.uWarp.value = rig.forkWarp;
      lMat.uniforms.uHue.value = rig.forkHue;
    }

    const hMesh = horizonMeshRef.current;
    if (hMesh) {
      const starCondense = 1 - Math.min(1, Math.max(0, rig.forkWarp)) * 0.58;
      const scale =
        (1 + rig.sealHold * 0.06 - (rig.recapBeat === 3 ? rig.recapProgress * 0.12 : 0)) *
        starCondense;
      hMesh.scale.setScalar(Math.max(0.25, scale));
    }
  });

  return (
    <>
      <mesh ref={horizonMeshRef} renderOrder={0} frustumCulled={false}>
        <sphereGeometry args={[1.12, 48, 32]} />
        <shaderMaterial
          ref={horizonMatRef}
          glslVersion={GLSL3}
          transparent
          depthWrite
          depthTest
          uniforms={horizonUniforms}
          vertexShader={horizonVertexShader}
          fragmentShader={horizonFragmentShader}
        />
      </mesh>

      <mesh ref={haloMeshRef} renderOrder={5} frustumCulled={false}>
        <planeGeometry args={[8.8, 8.8, 1, 1]} />
        <shaderMaterial
          ref={haloMatRef}
          glslVersion={GLSL3}
          transparent
          depthWrite={false}
          depthTest={false}
          blending={AdditiveBlending}
          uniforms={haloUniforms}
          vertexShader={haloVertexShader}
          fragmentShader={haloFragmentShader}
        />
      </mesh>
    </>
  );
}
