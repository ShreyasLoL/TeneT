'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { MathUtils, type ShaderMaterial, Vector2, Vector3 } from 'three';
import { LADDER_PROFILES, type QualityLevel } from '@/lib/stage/tiers';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { hexToRgbNormalized, readPalette } from '@/lib/viz/palette';
import { createTenetComposer, type TenetComposerRig } from './effects/TenetPostEffect';

function SimplifiedLensQuad() {
  const { size } = useThree();
  const mode = useTenetStore((s) => s.mode);
  const matRef = useRef<ShaderMaterial | null>(null);
  const uniforms = useMemo(() => {
    const pal = readPalette();
    const [ar, ag, ab] = hexToRgbNormalized(pal.accent);
    return {
      uOrchid: { value: new Vector3(ar, ag, ab) },
      uCenter: { value: new Vector2(0.5, 0.5) },
      uAspect: { value: 1.77 },
      uRadiusS: { value: 0.1 },
      uHold: { value: 0 },
    };
  }, []);

  useFrame((_state, delta) => {
    const mat = matRef.current;
    if (!mat) return;
    const dt = Math.min(delta, 1 / 20);
    const aspect = size.width / Math.max(1, size.height);
    const targetX = mode === 'ritual' ? 0.82 : 0.5 + rig.doorHover * 0.16;
    const targetY = mode === 'ritual' ? 0.8 : 0.5;
    const center = mat.uniforms.uCenter.value as Vector2;
    center.x = MathUtils.damp(center.x, targetX, 5.5, dt);
    center.y = MathUtils.damp(center.y, targetY, 5.5, dt);
    mat.uniforms.uAspect.value = aspect;
    mat.uniforms.uRadiusS.value = mode === 'ritual' ? 0.052 : 0.1;
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
            float hole = 1.0 - smoothstep(s * 0.95, s * 1.03, r);
            gl_FragColor = vec4(uOrchid * ring * 0.6, max(hole * 0.9, ring * 0.72));
          }
        `}
      />
    </mesh>
  );
}

export function Postfx() {
  const { gl, scene, camera, size } = useThree();
  const level = useTenetStore((s) => s.quality.level) as QualityLevel;
  const density = useTenetStore((s) => s.density);
  const mode = useTenetStore((s) => s.mode);
  const profile = LADDER_PROFILES[level];
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

      const dt = Math.min(delta, 1 / 20);
      const aspect = size.width / Math.max(1, size.height);
      const isRitual = mode === 'ritual' && rig.recapBeat === 0;
      const baseStrength = isRitual ? 0.22 + rig.sealHold * 0.55 : 1 - 0.65 * density;
      const radiusS = isRitual ? 0.054 + rig.sealHold * 0.03 : 0.11 - 0.02 * density;

      const targetCenterX = isRitual ? 0.82 : 0.5 + rig.doorHover * 0.16;
      const targetCenterY = isRitual ? 0.8 : 0.5;

      const u = composerRig.tenet.uniforms;
      const center = u.get('uCenter')!.value as Vector2;
      center.x = MathUtils.damp(center.x, targetCenterX, 5.5, dt);
      center.y = MathUtils.damp(center.y, targetCenterY, 5.5, dt);

      u.get('uRadiusS')!.value = radiusS;
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
      u.get('uMirrorEnabled')!.value = profile.mirror && mode === 'fork' ? 1.0 : 0.0;
      u.get('uGrainEnabled')!.value = profile.grain ? 1.0 : 0.0;

      composerRig.renderFrame(delta);
    },
    composerActive ? 1 : 0,
  );

  if (profile.lensMode === 'none') return null;
  if (profile.lensMode === 'quad') return <SimplifiedLensQuad />;
  return null;
}
