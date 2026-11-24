import type { Mode } from '@/lib/store';

export type CameraPose = {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
};

export const MODE_CAMERA_POSES: Record<Mode, CameraPose> = {
  fork: {
    position: [0, 0.3, 11.4],
    target: [0, 0, 0],
    fov: 44,
  },
  ritual: {
    position: [-2.4, -0.65, 13.6],
    target: [-1.9, -0.45, 0],
    fov: 46,
  },
  orbit: {
    position: [0, 7.6, 8.8],
    target: [0, 0, 0],
    fov: 44,
  },
  week: {
    position: [0, 4.3, 5.1],
    target: [0, 0, 0],
    fov: 40,
  },
  time: {
    position: [0, 7.4, 9.2],
    target: [0, 0, 0],
    fov: 45,
  },
  area: {
    position: [1.4, 6.2, 8.1],
    target: [0, 0, 0],
    fov: 42,
  },
};
