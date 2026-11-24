'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { LADDER_PROFILES, type QualityLevel } from '@/lib/stage/tiers';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { hexToRgbNormalized, readPalette } from '@/lib/viz/palette';
import { GrainEffectImpl } from './effects/GrainEffect';
import { LensEffectImpl } from './effects/LensEffect';
import { MirrorEffectImpl } from './effects/MirrorEffect';

function SimplifiedLensQuad() {
  const matRef = useRef<THREE.ShaderMaterial | null>(null);
  const uniforms = useMemo(() => {
    const pal = readPalette();
    const [ar, ag, ab] = hexToRgbNormalized(pal.accent);
    return {
      uOrchid: { value: new THREE.Vector3(ar, ag, ab) },
      uHold: { value: 0 },
    };
  }, []);

  useFrame(() => {
    if (matRef.current) {
      matRef.current.uniforms.uHold.value = rig.sealHold;
    }
  });

  return (
    <mesh renderOrder={99}>
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
          uniform vec3 uOrchid;
          uniform float uHold;
          varying vec2 vUv;
          void main() {
            float r = length(vUv - vec2(0.5)) * 2.0;
            float s = 0.22 * (1.0 + uHold * 0.08);
            float ring = exp(-pow((r - s) / 0.015, 2.0));
            float hole = 1.0 - smoothstep(s * 0.95, s * 1.02, r);
            gl_FragColor = vec4(uOrchid * ring * 0.7, max(hole, ring * 0.85));
          }
        `}
      />
    </mesh>
  );
}

export function Postfx() {
  const { size } = useThree();
  const level = useTenetStore((s) => s.quality.level) as QualityLevel;
  const density = useTenetStore((s) => s.density);
  const mode = useTenetStore((s) => s.mode);
  const profile = LADDER_PROFILES[level];

  const effects = useMemo(
    () => ({
      lens: new LensEffectImpl(),
      mirror: new MirrorEffectImpl(),
      grain: new GrainEffectImpl(),
    }),
    [],
  );

  const lensRef = useRef<LensEffectImpl | null>(null);
  const mirrorRef = useRef<MirrorEffectImpl | null>(null);
  const grainRef = useRef<GrainEffectImpl | null>(null);

  useEffect(() => {
    const lens = lensRef.current;
    if (!lens) return;
    const pal = readPalette();
    const [ar, ag, ab] = hexToRgbNormalized(pal.accent);
    const [abr, abg, abb] = hexToRgbNormalized(pal.accentAbyss);
    const [hr, hg, hb] = hexToRgbNormalized(pal.accentHot);
    (lens.uniforms.get('uOrchid')?.value as THREE.Vector3).set(ar, ag, ab);
    (lens.uniforms.get('uOrchidAbyss')?.value as THREE.Vector3).set(abr, abg, abb);
    (lens.uniforms.get('uOrchidHot')?.value as THREE.Vector3).set(hr, hg, hb);
  }, []);

  useEffect(() => {
    return () => {
      effects.lens.dispose();
      effects.mirror.dispose();
      effects.grain.dispose();
    };
  }, [effects]);

  useFrame((state, delta) => {
    const lens = lensRef.current;
    const mirror = mirrorRef.current;
    const grain = grainRef.current;
    if (!lens || !mirror || !grain) return;

    const dt = Math.min(delta, 1 / 20);
    const aspect = size.width / Math.max(1, size.height);
    const baseStrength = 1 - 0.65 * density;
    const radiusS = 0.11 - 0.02 * density;

    const targetCenterX = mode === 'ritual' ? 0.68 : 0.5 + rig.doorHover * 0.16;
    const targetCenterY = mode === 'ritual' ? 0.66 : 0.5;

    const center = lens.uniforms.get('uCenter')?.value as THREE.Vector2;
    center.x = THREE.MathUtils.damp(center.x, targetCenterX, 5.5, dt);
    center.y = THREE.MathUtils.damp(center.y, targetCenterY, 5.5, dt);

    lens.uniforms.get('uRadiusS')!.value = radiusS;
    lens.uniforms.get('uStrength')!.value = THREE.MathUtils.damp(
      lens.uniforms.get('uStrength')!.value as number,
      baseStrength,
      6.0,
      dt,
    );
    lens.uniforms.get('uHold')!.value = rig.sealHold;
    lens.uniforms.get('uAspect')!.value = aspect;
    lens.uniforms.get('uSpike')!.value = rig.recapSpike + rig.turnstilePulse * 0.4;

    mirror.uniforms.get('uTime')!.value = state.clock.elapsedTime;
    mirror.uniforms.get('uEnabled')!.value = profile.mirror && mode === 'fork' ? 1.0 : 0.0;

    grain.uniforms.get('uTime')!.value = state.clock.elapsedTime;
    grain.uniforms.get('uEnabled')!.value = profile.grain ? 1.0 : 0.0;
  });

  if (profile.lensMode === 'none') return null;

  if (profile.lensMode === 'quad') {
    return <SimplifiedLensQuad />;
  }

  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom
        mipmapBlur
        luminanceThreshold={profile.bloom ? 0.6 : 99}
        luminanceSmoothing={0.2}
        intensity={profile.bloom ? 0.68 : 0}
        resolutionScale={0.5}
      />
      <primitive ref={lensRef} object={effects.lens} />
      <primitive ref={mirrorRef} object={effects.mirror} />
      <primitive ref={grainRef} object={effects.grain} />
    </EffectComposer>
  );
}
