'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  DoubleSide,
  GLSL3,
  MathUtils,
  type Mesh,
  type ShaderMaterial,
  Vector3,
} from 'three';
import { isTouchDevice, profileForLevel, type QualityLevel } from '@/lib/stage/tiers';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { readPalette } from '@/lib/viz/palette';
import { hexToLinearRgb, readAmberLinear } from './shaders/color';
import { diskFragmentShader, diskVertexShader } from './shaders/disk';

export function Disk() {
  const liveScore = useTenetStore((s) => s.livePreview.score);
  const mode = useTenetStore((s) => s.mode);
  const level = useTenetStore((s) => s.quality.level) as QualityLevel;
  const lowPower = useTenetStore((s) => s.quality.lowPower);
  const profile = profileForLevel(level, isTouchDevice(), lowPower);

  const matRef = useRef<ShaderMaterial | null>(null);
  const meshRef = useRef<Mesh | null>(null);

  const uniforms = useMemo(() => {
    const pal = readPalette();
    const [abr, abg, abb] = hexToLinearRgb(pal.accentAbyss);
    const [ar, ag, ab] = hexToLinearRgb(pal.accent);
    const [amr, amg, amb] = readAmberLinear();
    return {
      uTime: { value: 0 },
      uIntro: { value: 1 },
      uSpin: { value: 0 },
      uHeat: { value: 0.58 },
      uHold: { value: 0 },
      uMode: { value: 0 },
      uWarp: { value: 0 },
      uHue: { value: 0 },
      uSimplified: { value: 0 },
      uAmber: { value: new Vector3(amr, amg, amb) },
      uOrchid: { value: new Vector3(ar, ag, ab) },
      uViolet: { value: new Vector3(abr * 1.35 + 0.04, abg * 1.2 + 0.02, abb * 2.4 + 0.18) },
      uColdBlue: { value: new Vector3(0.14, 0.52, 1.0) },
    };
  }, []);

  useFrame((_state, delta) => {
    const mat = matRef.current;
    const mesh = meshRef.current;
    if (!mat || !mesh) return;

    const isVisible = rig.introProgress > 0.22 || rig.recapBeat > 0;
    mesh.visible = isVisible;
    if (!isVisible) return;

    const dt = Math.min(delta, 1 / 30);
    const baseHeat = liveScore === null ? 0.56 : 0.44 + (liveScore / 100) * 0.56;
    const targetHeat = mode === 'ritual' ? baseHeat * 0.82 : baseHeat;

    mat.uniforms.uTime.value = rig.elapsedTime;
    mat.uniforms.uIntro.value = rig.introProgress;
    mat.uniforms.uSpin.value = rig.introSpin;
    mat.uniforms.uHeat.value = MathUtils.damp(
      mat.uniforms.uHeat.value as number,
      targetHeat,
      5.0,
      dt,
    );
    mat.uniforms.uHold.value = rig.sealHold;
    mat.uniforms.uMode.value = rig.forkMode;
    mat.uniforms.uWarp.value = rig.forkWarp;
    mat.uniforms.uHue.value = rig.forkHue;
    mat.uniforms.uSimplified.value = profile.simplifiedDisk ? 1.0 : 0.0;

    const collapseScale = Math.max(
      0.15,
      1 - rig.sealHold * 0.22 - (rig.recapBeat === 3 ? rig.recapProgress * 0.85 : 0),
    );
    mesh.scale.setScalar(collapseScale);
  });

  return (
    <mesh
      ref={meshRef}
      renderOrder={3}
      rotation={[-Math.PI / 2, 0, 0]}
      frustumCulled={false}
    >
      <planeGeometry args={[9.6, 9.6, 1, 1]} />
      <shaderMaterial
        ref={matRef}
        glslVersion={GLSL3}
        transparent
        depthTest
        depthWrite={false}
        side={DoubleSide}
        blending={AdditiveBlending}
        uniforms={uniforms}
        vertexShader={diskVertexShader}
        fragmentShader={diskFragmentShader}
      />
    </mesh>
  );
}
