export type ForkDoorSpec = {
  id: 'back' | 'forward';
  href: '/dashboard' | '/log';
  x: number;
  y: number;
  width: number;
  height: number;
  flowDir: -1 | 1;
};

export function forkLayout(): {
  axisX: 0;
  left: ForkDoorSpec;
  right: ForkDoorSpec;
} {
  const xOffset = 2.65;
  const yCenter = 0.0;
  const width = 2.15;
  const height = 3.55;

  return {
    axisX: 0,
    left: {
      id: 'back',
      href: '/dashboard',
      x: -xOffset,
      y: yCenter,
      width,
      height,
      flowDir: -1,
    },
    right: {
      id: 'forward',
      href: '/log',
      x: xOffset,
      y: yCenter,
      width,
      height,
      flowDir: 1,
    },
  };
}
