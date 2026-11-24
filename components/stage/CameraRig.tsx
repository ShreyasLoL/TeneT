'use client';

import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MODE_CAMERA_POSES } from '@/lib/stage/modes';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';

const targetPos = new THREE.Vector3();
const targetLook = new THREE.Vector3();
const currentLook = new THREE.Vector3(0, 0, 0);

export function CameraRig() {
  const mode = useTenetStore((s) => s.mode);
  const reducedMotion = useTenetStore((s) => s.quality.reducedMotion);

  useFrame((state, delta) => {
    const cam = state.camera;
    const dt = Math.min(delta, 1 / 20);
    const pose = MODE_CAMERA_POSES[mode];

    if (rig.cameraOverride.active) {
      targetPos.set(rig.cameraOverride.px, rig.cameraOverride.py, rig.cameraOverride.pz);
      targetLook.set(rig.cameraOverride.tx, rig.cameraOverride.ty, rig.cameraOverride.tz);
    } else {
      const areaOffset =
        mode === 'area' && rig.focusAreaIndex >= 0 ? (rig.focusAreaIndex - 1) * 1.4 : 0;
      targetPos.set(pose.position[0] + areaOffset, pose.position[1], pose.position[2]);
      targetLook.set(pose.target[0], pose.target[1], pose.target[2]);
    }

    if (reducedMotion) {
      cam.position.copy(targetPos);
      currentLook.copy(targetLook);
    } else {
      const lambda = rig.cameraOverride.active ? 7.5 : 4.2;
      cam.position.x = THREE.MathUtils.damp(cam.position.x, targetPos.x, lambda, dt);
      cam.position.y = THREE.MathUtils.damp(cam.position.y, targetPos.y, lambda, dt);
      cam.position.z = THREE.MathUtils.damp(cam.position.z, targetPos.z, lambda, dt);
      currentLook.x = THREE.MathUtils.damp(currentLook.x, targetLook.x, lambda, dt);
      currentLook.y = THREE.MathUtils.damp(currentLook.y, targetLook.y, lambda, dt);
      currentLook.z = THREE.MathUtils.damp(currentLook.z, targetLook.z, lambda, dt);
    }

    cam.lookAt(currentLook);
    if (cam instanceof THREE.PerspectiveCamera) {
      const nextFov = rig.cameraOverride.active ? rig.cameraOverride.fov : pose.fov;
      if (Math.abs(cam.fov - nextFov) > 0.05) {
        cam.fov = THREE.MathUtils.damp(cam.fov, nextFov, 5.0, dt);
        cam.updateProjectionMatrix();
      }
    }
  });

  return null;
}
