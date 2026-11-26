'use client';

import { Canvas } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { stageClock } from '@/lib/stage/clock';
import { MODE_CAMERA_POSES } from '@/lib/stage/modes';
import { isTouchDevice, profileForLevel, type QualityLevel } from '@/lib/stage/tiers';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { Scene } from './Scene';

export default function StageCanvas() {
  const level = useTenetStore((s) => s.quality.level) as QualityLevel;
  const lowPower = useTenetStore((s) => s.quality.lowPower);
  const setQuality = useTenetStore((s) => s.setQuality);
  const [, setHidden] = useState(false);

  const profile = profileForLevel(level, isTouchDevice(), lowPower);
  const forkPose = MODE_CAMERA_POSES.fork;

  useEffect(() => {
    rig.mountCount += 1;
    const onVis = () => {
      const h = document.hidden;
      setHidden(h);
      stageClock.setHidden(h);
    };
    onVis();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return (
    <Canvas
      dpr={[1, profile.dprMax]}
      frameloop="demand"
      camera={{ position: forkPose.position, fov: forkPose.fov, near: 0.1, far: 400 }}
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
