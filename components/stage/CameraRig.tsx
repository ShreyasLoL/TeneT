'use client';

import { useFrame } from '@react-three/fiber';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { MODE_CAMERA_POSES } from '@/lib/stage/modes';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';

const targetPos = new Vector3();
const targetLook = new Vector3();
const currentLook = new Vector3(0, 0, 0);

export function CameraRig() {
  const mode = useTenetStore((s) => s.mode);
  const reducedMotion = useTenetStore((s) => s.quality.reducedMotion);

  useFrame((state, delta) => {
    const cam = state.camera;
    const dt = Math.min(delta, 1 / 30);
    const pose = MODE_CAMERA_POSES[mode];

    if (rig.cameraOverride.active) {
      targetPos.set(rig.cameraOverride.px, rig.cameraOverride.py, rig.cameraOverride.pz);
      targetLook.set(rig.cameraOverride.tx, rig.cameraOverride.ty, rig.cameraOverride.tz);
    } else {
      const zDrift =
        mode === 'fork' && !reducedMotion ? Math.sin(rig.elapsedTime * 0.32) * 0.18 : 0;
      targetPos.set(pose.position[0], pose.position[1], pose.position[2] + zDrift);
      targetLook.set(pose.target[0], pose.target[1], pose.target[2]);
    }

    const directFollow = reducedMotion || (rig.introActive && rig.cameraOverride.active);
    if (directFollow) {
      cam.position.copy(targetPos);
      currentLook.copy(targetLook);
    } else {
      const lambda = rig.cameraOverride.active ? 7.5 : 4.6;
      cam.position.x = MathUtils.damp(cam.position.x, targetPos.x, lambda, dt);
      cam.position.y = MathUtils.damp(cam.position.y, targetPos.y, lambda, dt);
      cam.position.z = MathUtils.damp(cam.position.z, targetPos.z, lambda, dt);
      currentLook.x = MathUtils.damp(currentLook.x, targetLook.x, lambda, dt);
      currentLook.y = MathUtils.damp(currentLook.y, targetLook.y, lambda, dt);
      currentLook.z = MathUtils.damp(currentLook.z, targetLook.z, lambda, dt);
    }

    cam.lookAt(currentLook);
    if (cam instanceof PerspectiveCamera) {
      const nextFov = rig.cameraOverride.active ? rig.cameraOverride.fov : pose.fov;
      if (Math.abs(cam.fov - nextFov) > 0.02) {
        cam.fov = directFollow ? nextFov : MathUtils.damp(cam.fov, nextFov, 5.0, dt);
        cam.updateProjectionMatrix();
      }
    }
  });

  return null;
}
