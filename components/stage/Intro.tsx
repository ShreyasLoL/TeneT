'use client';

import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';

export function Intro() {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    if (typeof gl.compileAsync === 'function') {
      void gl.compileAsync(scene, camera).catch(() => undefined);
    }
  }, [camera, gl, scene]);

  return null;
}
