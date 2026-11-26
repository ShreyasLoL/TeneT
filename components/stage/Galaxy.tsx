'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  type BufferGeometry,
  DoubleSide,
  GLSL3,
  MathUtils,
  NormalBlending,
  type ShaderMaterial,
  Sphere,
  Vector3,
} from 'three';
import {
  isTouchDevice,
  LOW_POWER_GALAXY_PARTICLES,
  NORMAL_GALAXY_PARTICLES,
  type QualityLevel,
} from '@/lib/stage/tiers';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { readPalette } from '@/lib/viz/palette';
import { buildGalaxyBuffers } from './galaxyBuffers';
import { hexToLinearRgb, readAmberLinear } from './shaders/color';
import {
  dustLaneFragmentShader,
  dustLaneVertexShader,
  galaxyFragmentShader,
  galaxyVertexShader,
} from './shaders/galaxy';

function galaxyCountForTier(level: QualityLevel, touch: boolean, lowPower: boolean): number {
  if (lowPower || level >= 3) return LOW_POWER_GALAXY_PARTICLES; // 4x fewer (8,500)
  if (level === 2 || touch) return 22_000;
  return NORMAL_GALAXY_PARTICLES; // 34,000
}

export function Galaxy() {
  const { gl } = useThree();
  const mode = useTenetStore((s) => s.mode);
  const level = useTenetStore((s) => s.quality.level) as QualityLevel;
  const lowPower = useTenetStore((s) => s.quality.lowPower);
  const drawCount = galaxyCountForTier(level, isTouchDevice(), lowPower);

  const geomRef = useRef<BufferGeometry | null>(null);
  const starMatRef = useRef<ShaderMaterial | null>(null);
  const dustMatRef = useRef<ShaderMaterial | null>(null);

  const buffers = useMemo(() => buildGalaxyBuffers(NORMAL_GALAXY_PARTICLES), []);

  const { starUniforms, dustUniforms } = useMemo(() => {
    const pal = readPalette();
    const [abr, abg, abb] = hexToLinearRgb(pal.accentAbyss);
    const [ar, ag, ab] = hexToLinearRgb(pal.accent);
    const [amr, amg, amb] = readAmberLinear();

    return {
      starUniforms: {
        uTime: { value: 0 },
        uDpr: { value: 1 },
        uIntro: { value: 1 },
        uSpin: { value: 0 },
        uTick: { value: 0 },
        uMode: { value: 0 },
        uWarp: { value: 0 },
        uHue: { value: 0 },
        uBrightness: { value: 1 },
        uAmber: { value: new Vector3(amr, amg, amb) },
        uOrchid: { value: new Vector3(ar, ag, ab) },
        uViolet: { value: new Vector3(abr * 1.3 + 0.03, abg * 1.1 + 0.015, abb * 2.2 + 0.12) },
        uColdBlue: { value: new Vector3(0.28, 0.62, 1.0) },
      },
      dustUniforms: {
        uTime: { value: 0 },
        uIntro: { value: 1 },
        uSpin: { value: 0 },
      },
    };
  }, []);

  useEffect(() => {
    if (geomRef.current) {
      geomRef.current.setDrawRange(0, drawCount);
      if (!geomRef.current.boundingSphere) {
        geomRef.current.boundingSphere = new Sphere(new Vector3(0, 0, 0), 32);
      }
    }
  }, [drawCount]);

  useFrame((_state, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const sMat = starMatRef.current;
    if (sMat) {
      sMat.uniforms.uTime.value = rig.elapsedTime;
      sMat.uniforms.uDpr.value = gl.getPixelRatio();
      sMat.uniforms.uIntro.value = rig.introProgress;
      sMat.uniforms.uSpin.value = rig.introSpin;
      sMat.uniforms.uTick.value = rig.introTick;
      sMat.uniforms.uMode.value = rig.forkMode;
      sMat.uniforms.uWarp.value = rig.forkWarp;
      sMat.uniforms.uHue.value = rig.forkHue;
      sMat.uniforms.uBrightness.value = MathUtils.damp(
        sMat.uniforms.uBrightness.value as number,
        mode === 'fork' ? 0.42 : mode === 'ritual' ? 0.28 : 0.38,
        4.5,
        dt,
      );
    }

    const dMat = dustMatRef.current;
    if (dMat) {
      dMat.uniforms.uTime.value = rig.elapsedTime;
      dMat.uniforms.uIntro.value = rig.introProgress;
      dMat.uniforms.uSpin.value = rig.introSpin;
    }
  });

  return (
    <>
      <points renderOrder={1} frustumCulled={false}>
        <bufferGeometry ref={geomRef}>
          <bufferAttribute attach="attributes-position" args={[buffers.origins, 3]} />
          <bufferAttribute attach="attributes-aSeed" args={[buffers.seeds, 4]} />
          <bufferAttribute attach="attributes-aMeta" args={[buffers.meta, 2]} />
        </bufferGeometry>
        <shaderMaterial
          ref={starMatRef}
          glslVersion={GLSL3}
          transparent
          depthTest
          depthWrite={false}
          blending={AdditiveBlending}
          uniforms={starUniforms}
          vertexShader={galaxyVertexShader}
          fragmentShader={galaxyFragmentShader}
        />
      </points>

      {/* Absorbing dark dust lanes along the inner concave edge of the 2 main spiral arms */}
      <mesh renderOrder={2} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
        <planeGeometry args={[42, 42, 1, 1]} />
        <shaderMaterial
          ref={dustMatRef}
          glslVersion={GLSL3}
          transparent
          depthTest
          depthWrite={false}
          side={DoubleSide}
          blending={NormalBlending}
          uniforms={dustUniforms}
          vertexShader={dustLaneVertexShader}
          fragmentShader={dustLaneFragmentShader}
        />
      </mesh>
    </>
  );
}
