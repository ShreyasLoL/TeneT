'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useTenetState, useToday } from '@/lib/api/hooks';
import { LADDER_PROFILES, type QualityLevel } from '@/lib/stage/tiers';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { hexToRgbNormalized, readPalette } from '@/lib/viz/palette';
import { diskFragmentShader, diskVertexShader } from './shaders/disk';

export function Disk() {
  const today = useToday();
  const { data: state } = useTenetState();
  const cursor = useTenetStore((s) => s.cursor);
  const liveScore = useTenetStore((s) => s.livePreview.score);
  const level = useTenetStore((s) => s.quality.level) as QualityLevel;
  const profile = LADDER_PROFILES[level];

  const matRef = useRef<THREE.ShaderMaterial | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);

  const tonightSealed = Boolean(state?.days.some((d) => d.day === today));
  const showDisk = cursor === today && !tonightSealed;

  const uniforms = useMemo(() => {
    const pal = readPalette();
    const [abr, abg, abb] = hexToRgbNormalized(pal.accentAbyss);
    const [ar, ag, ab] = hexToRgbNormalized(pal.accent);
    const [hr, hg, hb] = hexToRgbNormalized(pal.accentHot);
    return {
      uTime: { value: 0 },
      uHeat: { value: 0.2 },
      uHold: { value: 0 },
      uSimplified: { value: 0 },
      uOrchidAbyss: { value: new THREE.Vector3(abr, abg, abb) },
      uOrchid: { value: new THREE.Vector3(ar, ag, ab) },
      uOrchidHot: { value: new THREE.Vector3(hr, hg, hb) },
    };
  }, []);

  useFrame((frameState, delta) => {
    const mat = matRef.current;
    const mesh = meshRef.current;
    if (!mat || !mesh) return;
    const dt = Math.min(delta, 1 / 20);
    const targetHeat = showDisk ? (liveScore === null ? 0.16 : 0.25 + (liveScore / 100) * 0.75) : 0;

    mat.uniforms.uTime.value = frameState.clock.elapsedTime;
    mat.uniforms.uHeat.value = THREE.MathUtils.damp(
      mat.uniforms.uHeat.value as number,
      targetHeat,
      5.0,
      dt,
    );
    mat.uniforms.uHold.value = rig.sealHold;
    mat.uniforms.uSimplified.value = profile.simplifiedDisk ? 1.0 : 0.0;

    const collapseScale = Math.max(0.15, 1 - rig.sealHold * 0.22 - (rig.recapBeat === 3 ? rig.recapProgress * 0.85 : 0));
    mesh.scale.setScalar(collapseScale);
  });

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      visible={showDisk || rig.recapBeat > 0}
    >
      <planeGeometry args={[4.1, 4.1, 1, 1]} />
      <shaderMaterial
        ref={matRef}
        glslVersion={THREE.GLSL3}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        uniforms={uniforms}
        vertexShader={diskVertexShader}
        fragmentShader={diskFragmentShader}
      />
    </mesh>
  );
}
