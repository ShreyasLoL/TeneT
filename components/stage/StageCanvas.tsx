'use client';

import { Canvas } from '@react-three/fiber';
import { useEffect } from 'react';
import { LADDER_PROFILES, type QualityLevel } from '@/lib/stage/tiers';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { Scene } from './Scene';

export default function StageCanvas() {
  const level = useTenetStore((s) => s.quality.level) as QualityLevel;
  const setQuality = useTenetStore((s) => s.setQuality);
  const profile = LADDER_PROFILES[level];

  useEffect(() => {
    rig.mountCount += 1;
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
      <Canvas
        dpr={[1, profile.dprMax]}
        frameloop="demand"
        camera={{ position: [0, 0.3, 11.4], fov: 44, near: 0.1, far: 120 }}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        onCreated={({ gl, invalidate }) => {
          const bg = getComputedStyle(document.documentElement)
            .getPropertyValue('--bg')
            .trim();
          if (bg) gl.setClearColor(bg, 1);

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
    </div>
  );
}
