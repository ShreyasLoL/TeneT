'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { MathUtils, PerspectiveCamera, type ShaderMaterial, Vector2, Vector3 } from 'three';
import { isTouchDevice, profileForLevel, type QualityLevel } from '@/lib/stage/tiers';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { hexToRgbNormalized, readPalette } from '@/lib/viz/palette';
import { createTenetComposer, type TenetComposerRig } from './effects/TenetPostEffect';

function computeHoleScreenRadius(camera: unknown): number {
  if (camera instanceof PerspectiveCamera) {
    const dist = Math.max(1.8, camera.position.length());
    const halfH = dist * Math.tan(MathUtils.degToRad(camera.fov * 0.5));
    return MathUtils.clamp(0.86 / Math.max(0.5, halfH * 2), 0.04, 0.34);
  }
  return 0.18;
}

function SimplifiedLensQuad() {
  const { size, camera } = useThree();
  const matRef = useRef<ShaderMaterial | null>(null);
  const uniforms = useMemo(() => {
    const pal = readPalette();
    const [ar, ag, ab] = hexToRgbNormalized(pal.accent);
    return {
      uOrchid: { value: new Vector3(ar, ag, ab) },
      uCenter: { value: new Vector2(0.5, 0.5) },
      uAspect: { value: 1.77 },
      uRadiusS: { value: 0.18 },
      uHold: { value: 0 },
    };
  }, []);

  useFrame(() => {
    const mat = matRef.current;
    if (!mat) return;
    const aspect = size.width / Math.max(1, size.height);
    const center = mat.uniforms.uCenter.value as Vector2;
    center.set(0.5, 0.5);
    mat.uniforms.uAspect.value = aspect;
    mat.uniforms.uRadiusS.value = computeHoleScreenRadius(camera);
    mat.uniforms.uHold.value = rig.sealHold;
  });

  return (
    <mesh renderOrder={99} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        transparent
        depthWrite={false}
        depthTest={false}
        uniforms={uniforms}
        vertexShader={/* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
          }
        `}
        fragmentShader={/* glsl */ `
          precision mediump float;
          uniform vec3 uOrchid;
          uniform vec2 uCenter;
          uniform float uAspect;
          uniform float uRadiusS;
          uniform float uHold;
          varying vec2 vUv;
          void main() {
            vec2 d = (vUv - uCenter) * vec2(uAspect, 1.0);
            float r = length(d);
            float s = uRadiusS * (1.0 + uHold * 0.08);
            float ring = exp(-pow((r - s * 1.04) / max(0.003, s * 0.07), 2.0));
            gl_FragColor = vec4(uOrchid * ring * 0.55, ring * 0.65);
          }
        `}
      />
    </mesh>
  );
}

export function Postfx() {
  const { gl, scene, camera, size } = useThree();
  const level = useTenetStore((s) => s.quality.level) as QualityLevel;
  const lowPower = useTenetStore((s) => s.quality.lowPower);
  const density = useTenetStore((s) => s.density);
  const mode = useTenetStore((s) => s.mode);
  const profile = profileForLevel(level, isTouchDevice(), lowPower);
  const composerActive = profile.lensMode === 'full';

  const rigRef = useRef<TenetComposerRig | null>(null);

  useEffect(() => {
    if (!composerActive) {
      rigRef.current = null;
      return;
    }

    const composerRig = createTenetComposer(gl, scene, camera);
    composerRig.syncBloom(profile.bloom);
    rigRef.current = composerRig;

    return () => {
      rigRef.current = null;
      composerRig.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, composerActive, gl, scene]);

  useEffect(() => {
    rigRef.current?.syncBloom(profile.bloom);
  }, [profile.bloom]);

  useFrame(
    (_state, delta) => {
      const composerRig = rigRef.current;
      if (!composerActive || !composerRig) return;

      const dt = Math.min(delta, 1 / 30);
      const aspect = size.width / Math.max(1, size.height);
      const horizonAppear = MathUtils.smoothstep(rig.introProgress, 0.55, 0.98);
      const ritualAttenuation = mode === 'ritual' && rig.sealHold < 0.01 ? 0.62 : 1.0;
      const baseStrength =
        (0.85 - 0.35 * density + rig.sealHold * 0.45) * ritualAttenuation * horizonAppear;

      const u = composerRig.tenet.uniforms;
      const center = u.get('uCenter')!.value as Vector2;
      center.set(0.5, 0.5);

      u.get('uRadiusS')!.value = computeHoleScreenRadius(camera);
      u.get('uStrength')!.value = MathUtils.damp(
        u.get('uStrength')!.value as number,
        baseStrength,
        6.0,
        dt,
      );
      u.get('uHold')!.value = rig.sealHold;
      u.get('uAspect')!.value = aspect;
      u.get('uSpike')!.value = rig.recapSpike + rig.turnstilePulse * 0.4;
      u.get('uTime')!.value = rig.elapsedTime;
      u.get('uMirrorEnabled')!.value = 0.0;
      u.get('uGrainEnabled')!.value = profile.grain && !lowPower ? 1.0 : 0.0;

      composerRig.renderFrame(dt);
    },
    composerActive ? 1 : 0,
  );

  if (profile.lensMode === 'none') return null;
  if (profile.lensMode === 'quad') return <SimplifiedLensQuad />;
  return null;
}
