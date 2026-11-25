'use client';

import { Canvas } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { isTouchDevice, profileForLevel, type QualityLevel } from '@/lib/stage/tiers';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { Scene } from './Scene';

export default function StageCanvas() {
  const level = useTenetStore((s) => s.quality.level) as QualityLevel;
  const lowPower = useTenetStore((s) => s.quality.lowPower);
  const reducedMotion = useTenetStore((s) => s.quality.reducedMotion);
  const setQuality = useTenetStore((s) => s.setQuality);
  const [hidden, setHidden] = useState(false);
  const mediaReduced =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const isReduced = reducedMotion || mediaReduced;

  const profile = profileForLevel(level, isTouchDevice(), lowPower);
  const frameloop = isReduced || hidden ? 'demand' : 'always';

  useEffect(() => {
    rig.mountCount += 1;
    const onVis = () => setHidden(document.hidden);
    onVis();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return (
    <Canvas
      dpr={[1, profile.dprMax]}
      frameloop={frameloop}
      camera={{ position: [0, 2.35, 11.4], fov: 44, near: 0.1, far: 120 }}
      gl={{ alpha: true, antialias: false, powerPreference: 'high-performance', stencil: false }}
      onCreated={({ gl, invalidate }) => {
        gl.setClearColor(0x000000, 0);

        const canvas = gl.domElement;
        const onLost = (e: Event) => {
          e.preventDefault();
          setQuality({ webgl: 'lost' });
        };
        const onRestored = () => {
          setQuality({ webgl: 'ok' });
          invalidate();
        };
        canvas.addEventListener('webglcontextlost', onLost, false);
        canvas.addEventListener('webglcontextrestored', onRestored, false);
        invalidate();
      }}
    >
      <Scene />
    </Canvas>
  );
}
