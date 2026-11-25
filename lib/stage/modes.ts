import type { Mode } from '@/lib/store';

export type CameraPose = {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
};

/**
 * Every route sits strictly on the x = 0 origin axis looking at [0, 0, 0]
 * so the black hole + particle disk stay at exact viewport center across all widths.
 */
export const MODE_CAMERA_POSES: Record<Mode, CameraPose> = {
  fork: {
    position: [0, 0, 10.6],
    target: [0, 0, 0],
    fov: 45,
  },
  ritual: {
    position: [0, 2.55, 12.2],
    target: [0, 0, 0],
    fov: 45,
  },
  orbit: {
    position: [0, 5.2, 9.8],
    target: [0, 0, 0],
    fov: 44,
  },
  week: {
    position: [0, 3.8, 8.6],
    target: [0, 0, 0],
    fov: 42,
  },
  time: {
    position: [0, 5.0, 10.0],
    target: [0, 0, 0],
    fov: 45,
  },
  area: {
    position: [0, 4.4, 9.2],
    target: [0, 0, 0],
    fov: 43,
  },
};
