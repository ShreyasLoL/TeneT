import type { Mode } from '@/lib/store';
import { sphericalPoseToCartesian } from '@/stage/blackhole/cameraSpline';
import {
  BH_CAMERA_INCLINATION_REST_RAD,
  BH_CAMERA_ORBIT_R,
  BH_CAMERA_REST_R,
  BH_CAMERA_RITUAL_R,
} from '@/stage/blackhole/constants';

export type CameraPose = {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
};

const DEG = Math.PI / 180;

/**
 * Schwarzschild camera poses (G=c=1, rs=1) keeping origin black hole centered.
 */
export const MODE_CAMERA_POSES: Record<Mode, CameraPose> = {
  fork: {
    position: sphericalPoseToCartesian(BH_CAMERA_REST_R, BH_CAMERA_INCLINATION_REST_RAD, 0),
    target: [0, 0, 0],
    fov: 42,
  },
  ritual: {
    position: sphericalPoseToCartesian(BH_CAMERA_RITUAL_R, 80 * DEG, 0.12),
    target: [0, 0, 0],
    fov: 42,
  },
  orbit: {
    position: sphericalPoseToCartesian(BH_CAMERA_ORBIT_R, 56 * DEG, 0),
    target: [0, 0, 0],
    fov: 44,
  },
  week: {
    position: sphericalPoseToCartesian(30.0, 62 * DEG, -0.08),
    target: [0, 0, 0],
    fov: 42,
  },
  time: {
    position: sphericalPoseToCartesian(33.0, 58 * DEG, 0.08),
    target: [0, 0, 0],
    fov: 44,
  },
  area: {
    position: sphericalPoseToCartesian(31.0, 60 * DEG, 0),
    target: [0, 0, 0],
    fov: 43,
  },
};
