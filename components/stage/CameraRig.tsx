'use client';

import { useFrame } from '@react-three/fiber';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { MODE_CAMERA_POSES } from '@/lib/stage/modes';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { type CameraSplineSample, evalIntroCameraSpline } from '@/stage/blackhole/cameraSpline';
import { BH_CAMERA_TILT_ROLL_RAD } from '@/stage/blackhole/constants';

const targetPos = new Vector3();
const targetLook = new Vector3();
const currentLook = new Vector3(0, 0, 0);
const splineScratch: CameraSplineSample = {
  x: 0,
  y: 3.9,
  z: 27.7,
  fov: 42,
  r: 28,
  theta: 1.43,
  phi: 0,
};
let currentRoll = BH_CAMERA_TILT_ROLL_RAD;

export function CameraRig() {
  const mode = useTenetStore((s) => s.mode);
  const reducedMotion = useTenetStore((s) => s.quality.reducedMotion);

  useFrame((state, delta) => {
    const cam = state.camera;
    const dt = Math.min(delta, 1 / 30);
    const pose = MODE_CAMERA_POSES[mode];

    let desiredFov = pose.fov;
    if (rig.cameraOverride.active) {
      targetPos.set(rig.cameraOverride.px, rig.cameraOverride.py, rig.cameraOverride.pz);
      targetLook.set(rig.cameraOverride.tx, rig.cameraOverride.ty, rig.cameraOverride.tz);
      desiredFov = rig.cameraOverride.fov;
    } else if (rig.introActive) {
      evalIntroCameraSpline(rig.introCameraProgress, splineScratch);
      targetPos.set(splineScratch.x, splineScratch.y, splineScratch.z);
      targetLook.set(0, 0, 0);
      desiredFov = splineScratch.fov;
    } else {
      const zDrift =
        mode === 'fork' && !reducedMotion ? Math.sin(rig.elapsedTime * 0.22) * 0.42 : 0;
      const xDrift =
        mode === 'fork' && !reducedMotion ? Math.cos(rig.elapsedTime * 0.16) * 0.28 : 0;
      targetPos.set(pose.position[0] + xDrift, pose.position[1], pose.position[2] + zDrift);
      targetLook.set(pose.target[0], pose.target[1], pose.target[2]);
    }

    const desiredRoll =
      reducedMotion ? 0 : mode === 'fork' || rig.introActive ? BH_CAMERA_TILT_ROLL_RAD : 0;
    currentRoll = reducedMotion ? desiredRoll : MathUtils.damp(currentRoll, desiredRoll, 4.2, dt);
    cam.up.set(Math.sin(currentRoll), Math.cos(currentRoll), 0);

    const directFollow =
      reducedMotion || (rig.forkActive && rig.cameraOverride.active);
    if (directFollow) {
      cam.position.copy(targetPos);
      currentLook.copy(targetLook);
    } else {
      const lambda = rig.introActive ? 5.8 : rig.cameraOverride.active ? 7.5 : 4.2;
      cam.position.x = MathUtils.damp(cam.position.x, targetPos.x, lambda, dt);
      cam.position.y = MathUtils.damp(cam.position.y, targetPos.y, lambda, dt);
      cam.position.z = MathUtils.damp(cam.position.z, targetPos.z, lambda, dt);
      currentLook.x = MathUtils.damp(currentLook.x, targetLook.x, lambda, dt);
      currentLook.y = MathUtils.damp(currentLook.y, targetLook.y, lambda, dt);
      currentLook.z = MathUtils.damp(currentLook.z, targetLook.z, lambda, dt);
    }

    cam.lookAt(currentLook);
    if (cam instanceof PerspectiveCamera) {
      if (Math.abs(cam.fov - desiredFov) > 0.02) {
        cam.fov = directFollow ? desiredFov : MathUtils.damp(cam.fov, desiredFov, 4.8, dt);
        cam.updateProjectionMatrix();
      }
    }
  });

  return null;
}
