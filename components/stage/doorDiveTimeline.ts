import { notifyForkTransition, rig } from '@/lib/store/rig';
import {
  CAMERA_DISTANCE_DEFAULT,
  CAMERA_FOV_DEG,
  CAMERA_INCLINATION_RAD,
  CAMERA_ROLL_RAD,
} from './blackhole/constants';
import { expoBezierEase } from './expoBezier';

export type GsapInstance = (typeof import('gsap'))['gsap'];

export function resetForkRigState() {
  rig.forkActive = false;
  rig.forkMode = 0;
  rig.forkWarp = 0;
  rig.forkHue = 0;
  rig.forkFlash = 0;
  rig.sealHold = 0;
  rig.uDir = 1;
  rig.doorHover = 0;
  rig.cameraOverride.active = false;
  rig.bhCam.distance = CAMERA_DISTANCE_DEFAULT;
  rig.bhCam.fov = CAMERA_FOV_DEG;
  rig.bhCam.inclination = CAMERA_INCLINATION_RAD;
  rig.bhCam.azimuth = 0;
  rig.bhCam.roll = CAMERA_ROLL_RAD;
  notifyForkTransition();
}

export function tweenDiveInterrupt(gsapInstance: GsapInstance, onComplete: () => void) {
  gsapInstance.to(rig, {
    forkMode: 0,
    forkWarp: 0,
    forkHue: 0,
    forkFlash: 0,
    sealHold: 0,
    duration: 0.35,
    ease: expoBezierEase,
  });
  gsapInstance.to(rig.cameraOverride, {
    px: 0,
    py: 0,
    pz: 10.6,
    tx: 0,
    ty: 0,
    tz: 0,
    fov: 45,
    duration: 0.35,
    ease: expoBezierEase,
  });
  gsapInstance.to(rig.bhCam, {
    distance: CAMERA_DISTANCE_DEFAULT,
    fov: CAMERA_FOV_DEG,
    inclination: CAMERA_INCLINATION_RAD,
    azimuth: 0,
    roll: CAMERA_ROLL_RAD,
    duration: 0.35,
    ease: expoBezierEase,
    onComplete,
  });
}

export function buildDoorDiveTimeline({
  gsapInstance,
  side,
  onRoute,
  onComplete,
}: {
  gsapInstance: GsapInstance;
  side: 'left' | 'right';
  onRoute: () => void;
  onComplete: () => void;
}) {
  const isRetro = side === 'left';
  const totalSec = isRetro ? 2.0 : 1.55;
  const peakSec = totalSec * 0.72;
  const startZ = 10.6 + Math.sin(rig.elapsedTime * 0.28) * 0.28;

  rig.forkActive = true;
  rig.cameraOverride.active = true;
  rig.cameraOverride.px = 0;
  rig.cameraOverride.py = 0;
  rig.cameraOverride.pz = startZ;
  rig.cameraOverride.tx = 0;
  rig.cameraOverride.ty = 0;
  rig.cameraOverride.tz = 0;
  rig.cameraOverride.fov = 45;
  notifyForkTransition();

  const tl = gsapInstance.timeline({ onComplete });

  if (isRetro) {
    tl.to(
      rig,
      { forkMode: -1, forkHue: 1, sealHold: 0.25, duration: totalSec * 0.4, ease: expoBezierEase },
      0,
    );
    tl.to(rig, { forkWarp: 1, duration: peakSec, ease: 'power2.in' }, 0);
    tl.to(
      rig.cameraOverride,
      { py: 0.28, pz: 2.15, fov: 50, duration: peakSec, ease: 'power2.in' },
      0,
    );
    tl.to(
      rig.bhCam,
      {
        distance: 6.8,
        fov: 54,
        inclination: CAMERA_INCLINATION_RAD - 0.12,
        azimuth: -0.26,
        roll: CAMERA_ROLL_RAD - 0.16,
        duration: peakSec,
        ease: 'power2.in',
      },
      0,
    );
  } else {
    const startAt = totalSec * 0.05;
    tl.to(
      rig,
      { forkMode: 1, forkHue: 1, sealHold: 0.65, duration: totalSec * 0.28, ease: expoBezierEase },
      0,
    );
    tl.to(rig, { forkWarp: 1, duration: peakSec - startAt, ease: 'power2.in' }, startAt);
    tl.to(
      rig.cameraOverride,
      { py: 0.14, pz: 1.55, fov: 62, duration: peakSec - startAt, ease: 'power2.in' },
      startAt,
    );
    tl.to(
      rig.bhCam,
      {
        distance: 5.8,
        fov: 62,
        inclination: CAMERA_INCLINATION_RAD + 0.04,
        azimuth: 0.22,
        roll: CAMERA_ROLL_RAD + 0.14,
        duration: peakSec - startAt,
        ease: 'power2.in',
      },
      startAt,
    );
  }

  // Horizon veil peak covers the route swap cleanly
  tl.to(
    rig,
    { forkFlash: 1, duration: totalSec * 0.16, ease: expoBezierEase },
    peakSec - totalSec * 0.16,
  );
  tl.call(
    () => {
      rig.cameraOverride.active = false;
      rig.bhCam.distance = 32.0;
      rig.bhCam.fov = 40.0;
      rig.bhCam.inclination = CAMERA_INCLINATION_RAD;
      rig.bhCam.azimuth = 0;
      rig.bhCam.roll = CAMERA_ROLL_RAD;
      onRoute();
    },
    undefined,
    peakSec,
  );

  // Smooth second-half emergence out of the horizon on the destination route
  const emergeAt = peakSec + 0.04;
  tl.to(
    rig,
    { forkFlash: 0, duration: Math.max(0.34, (totalSec - peakSec) * 0.72), ease: expoBezierEase },
    emergeAt,
  );
  tl.to(
    rig.bhCam,
    { distance: CAMERA_DISTANCE_DEFAULT, fov: CAMERA_FOV_DEG, duration: 0.9, ease: expoBezierEase },
    emergeAt,
  );
  tl.to(
    rig,
    { forkWarp: 0, forkHue: 0, forkMode: 0, sealHold: 0, duration: 0.85, ease: expoBezierEase },
    peakSec + 0.12,
  );

  return tl;
}
