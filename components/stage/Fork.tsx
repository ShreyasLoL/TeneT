'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { GLSL3, type Group, MathUtils, type ShaderMaterial, Vector3 } from 'three';
import { useTenetState, useToday } from '@/lib/api/hooks';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { forkLayout } from '@/lib/viz/forkLayout';
import { readPalette } from '@/lib/viz/palette';
import { hexToLinearRgb } from './shaders/color';
import { doorFragmentShader, doorVertexShader } from './shaders/door';

export function Fork() {
  const today = useToday();
  const { data: state } = useTenetState();
  const mode = useTenetStore((s) => s.mode);
  const liveScore = useTenetStore((s) => s.livePreview.score);

  const layout = useMemo(() => forkLayout(), []);
  const groupRef = useRef<Group | null>(null);
  const leftMatRef = useRef<ShaderMaterial | null>(null);
  const rightMatRef = useRef<ShaderMaterial | null>(null);

  const tonightSealed = Boolean(state?.days.some((d) => d.day === today));

  const leftUniforms = useMemo(() => {
    const pal = readPalette();
    const [abr, abg, abb] = hexToLinearRgb(pal.accentAbyss);
    const [ar, ag, ab] = hexToLinearRgb(pal.accent);
    const [hr, hg, hb] = hexToLinearRgb(pal.accentHot);
    return {
      uTime: { value: 0 },
      uFlowDir: { value: layout.left.flowDir },
      uIntensity: { value: 0.12 },
      uHover: { value: 0 },
      uSealed: { value: 0 },
      uOrchidAbyss: { value: new Vector3(abr, abg, abb) },
      uOrchid: { value: new Vector3(ar, ag, ab) },
      uOrchidHot: { value: new Vector3(hr, hg, hb) },
    };
  }, [layout.left.flowDir]);

  const rightUniforms = useMemo(() => {
    const pal = readPalette();
    const [abr, abg, abb] = hexToLinearRgb(pal.accentAbyss);
    const [ar, ag, ab] = hexToLinearRgb(pal.accent);
    const [hr, hg, hb] = hexToLinearRgb(pal.accentHot);
    return {
      uTime: { value: 0 },
      uFlowDir: { value: layout.right.flowDir },
      uIntensity: { value: 0.16 },
      uHover: { value: 0 },
      uSealed: { value: 0 },
      uOrchidAbyss: { value: new Vector3(abr, abg, abb) },
      uOrchid: { value: new Vector3(ar, ag, ab) },
      uOrchidHot: { value: new Vector3(hr, hg, hb) },
    };
  }, [layout.right.flowDir]);

  useFrame((_state, delta) => {
    const group = groupRef.current;
    const isVisible = mode === 'fork' && rig.introProgress >= 0.82;
    if (group) group.visible = isVisible;
    if (!isVisible) return;

    const dt = Math.min(delta, 1 / 30);
    const lm = leftMatRef.current;
    const rm = rightMatRef.current;
    if (!lm || !rm) return;

    const reveal = MathUtils.smoothstep(rig.introProgress, 0.82, 1.0);
    const lh = MathUtils.damp(
      lm.uniforms.uHover.value as number,
      rig.doorHover === -1 ? 1 : 0,
      7.0,
      dt,
    );
    const rh = MathUtils.damp(
      rm.uniforms.uHover.value as number,
      rig.doorHover === 1 ? 1 : 0,
      7.0,
      dt,
    );

    lm.uniforms.uTime.value = rig.elapsedTime;
    lm.uniforms.uHover.value = lh;
    lm.uniforms.uIntensity.value = reveal * (0.06 + lh * 0.34);

    rm.uniforms.uTime.value = rig.elapsedTime;
    rm.uniforms.uHover.value = rh;
    const liveFactor = liveScore === null ? 0.08 : 0.07 + (liveScore / 100) * 0.08;
    rm.uniforms.uIntensity.value = reveal * (liveFactor + rh * 0.34);
    rm.uniforms.uSealed.value = tonightSealed ? 1 : 0;
  });

  // Keep arches mounted with frustumCulled={false} so gl.compileAsync warms shaders once at startup
  return (
    <group ref={groupRef} visible={false}>
      <mesh position={[layout.left.x, layout.left.y, 0.4]} frustumCulled={false}>
        <planeGeometry args={[layout.left.width, layout.left.height]} />
        <shaderMaterial
          ref={leftMatRef}
          glslVersion={GLSL3}
          transparent
          depthWrite={false}
          uniforms={leftUniforms}
          vertexShader={doorVertexShader}
          fragmentShader={doorFragmentShader}
        />
      </mesh>
      <mesh position={[layout.right.x, layout.right.y, 0.4]} frustumCulled={false}>
        <planeGeometry args={[layout.right.width, layout.right.height]} />
        <shaderMaterial
          ref={rightMatRef}
          glslVersion={GLSL3}
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
