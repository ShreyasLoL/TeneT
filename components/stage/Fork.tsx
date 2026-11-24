'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useTenetState, useToday } from '@/lib/api/hooks';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { forkLayout } from '@/lib/viz/forkLayout';
import { hexToRgbNormalized, readPalette } from '@/lib/viz/palette';
import { doorFragmentShader, doorVertexShader } from './shaders/door';

export function Fork() {
  const today = useToday();
  const { data: state } = useTenetState();
  const mode = useTenetStore((s) => s.mode);
  const liveScore = useTenetStore((s) => s.livePreview.score);

  const layout = useMemo(() => forkLayout(), []);
  const leftMatRef = useRef<THREE.ShaderMaterial | null>(null);
  const rightMatRef = useRef<THREE.ShaderMaterial | null>(null);

  const tonightSealed = Boolean(state?.days.some((d) => d.day === today));

  const leftUniforms = useMemo(() => {
    const pal = readPalette();
    const [abr, abg, abb] = hexToRgbNormalized(pal.accentAbyss);
    const [ar, ag, ab] = hexToRgbNormalized(pal.accent);
    const [hr, hg, hb] = hexToRgbNormalized(pal.accentHot);
    return {
      uTime: { value: 0 },
      uFlowDir: { value: layout.left.flowDir },
      uIntensity: { value: 0.6 },
      uHover: { value: 0 },
      uSealed: { value: 0 },
      uOrchidAbyss: { value: new THREE.Vector3(abr, abg, abb) },
      uOrchid: { value: new THREE.Vector3(ar, ag, ab) },
      uOrchidHot: { value: new THREE.Vector3(hr, hg, hb) },
    };
  }, [layout.left.flowDir]);

  const rightUniforms = useMemo(() => {
    const pal = readPalette();
    const [abr, abg, abb] = hexToRgbNormalized(pal.accentAbyss);
    const [ar, ag, ab] = hexToRgbNormalized(pal.accent);
    const [hr, hg, hb] = hexToRgbNormalized(pal.accentHot);
    return {
      uTime: { value: 0 },
      uFlowDir: { value: layout.right.flowDir },
      uIntensity: { value: 0.75 },
      uHover: { value: 0 },
      uSealed: { value: 0 },
      uOrchidAbyss: { value: new THREE.Vector3(abr, abg, abb) },
      uOrchid: { value: new THREE.Vector3(ar, ag, ab) },
      uOrchidHot: { value: new THREE.Vector3(hr, hg, hb) },
    };
  }, [layout.right.flowDir]);

  useFrame((frameState, delta) => {
    const dt = Math.min(delta, 1 / 20);
    const lm = leftMatRef.current;
    const rm = rightMatRef.current;
    if (!lm || !rm) return;

    const reveal = THREE.MathUtils.smoothstep(rig.introProgress, 0.72, 1.0);

    lm.uniforms.uTime.value = frameState.clock.elapsedTime;
    lm.uniforms.uHover.value = THREE.MathUtils.damp(
      lm.uniforms.uHover.value as number,
      rig.doorHover === -1 ? 1 : 0,
      7.0,
      dt,
    );
    lm.uniforms.uIntensity.value = reveal * (tonightSealed ? 0.95 : 0.55);

    rm.uniforms.uTime.value = frameState.clock.elapsedTime;
    rm.uniforms.uHover.value = THREE.MathUtils.damp(
      rm.uniforms.uHover.value as number,
      rig.doorHover === 1 ? 1 : 0,
      7.0,
      dt,
    );
    const liveFactor = liveScore === null ? 0.55 : 0.45 + (liveScore / 100) * 0.55;
    rm.uniforms.uIntensity.value = reveal * (tonightSealed ? 0.35 : liveFactor);
    rm.uniforms.uSealed.value = tonightSealed ? 1 : 0;
  });

  if (mode !== 'fork' || rig.introProgress < 0.72) return null;

  return (
    <group>
      <mesh position={[layout.left.x, layout.left.y, 0.4]}>
        <planeGeometry args={[layout.left.width, layout.left.height]} />
        <shaderMaterial
          ref={leftMatRef}
          glslVersion={THREE.GLSL3}
          transparent
          depthWrite={false}
          uniforms={leftUniforms}
          vertexShader={doorVertexShader}
          fragmentShader={doorFragmentShader}
        />
      </mesh>
      <mesh position={[layout.right.x, layout.right.y, 0.4]}>
        <planeGeometry args={[layout.right.width, layout.right.height]} />
        <shaderMaterial
          ref={rightMatRef}
          glslVersion={THREE.GLSL3}
          transparent
          depthWrite={false}
          uniforms={rightUniforms}
          vertexShader={doorVertexShader}
          fragmentShader={doorFragmentShader}
        />
      </mesh>
    </group>
  );
}
