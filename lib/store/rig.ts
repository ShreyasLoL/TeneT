export type CameraOverride = {
  active: boolean;
  px: number;
  py: number;
  pz: number;
  tx: number;
  ty: number;
  tz: number;
  fov: number;
};

/**
 * Mutable high-frequency scene rig.
 * Scene components read this inside useFrame; UI/GSAP writers mutate directly.
 * Never store these values in React state.
 */
export const rig = {
  elapsedTime: 0,
  sealHold: 0,
  cursorVelocity: 0,
  cursorIndex: 0,
  uDir: 1,
  doorHover: 0 as -1 | 0 | 1,
  focusAreaIndex: -1,
  cohortPhases: new Float32Array(16),
  cohortDirSmooth: new Float32Array(16).fill(1),
  introProgress: 1,
  transitionProgress: 0,
  transitionTarget: null as string | null,
  turnstileProgress: 0,
  turnstilePulse: 0,
  recapBeat: 0,
  recapProgress: 0,
  recapJudgeIndex: -1,
  recapItemIndex: -1,
  recapVisibleLines: 0,
  recapCanSkip: false,
  recapSpike: 0,
  ringShift: 0,
  cameraOverride: {
    active: false,
    px: 0,
    py: 0,
    pz: 10,
    tx: 0,
    ty: 0,
    tz: 0,
    fov: 45,
  } as CameraOverride,
  mountCount: 0,
  drawCalls: 0,
  triangles: 0,
  jsFrameMs: 0,
  p50FrameMs: 0,
  p95FrameMs: 0,
  activityLevel: 'still' as 'burst' | 'ambient' | 'still',
  rendererName: 'unknown',
  isSoftwareRenderer: false,
  injectedFrameMs: 0,
};

export function setRigScrub(velocity: number, dir: number, pulse?: number) {
  rig.cursorVelocity = velocity;
  rig.uDir = dir;
  if (pulse !== undefined) {
    rig.turnstilePulse = pulse;
  }
}

export function setRigTurnstilePulse(pulse: number) {
  rig.turnstilePulse = pulse;
}

export function clearRigCursorVelocity() {
  rig.cursorVelocity = 0;
}

const recapListeners = new Set<() => void>();

export function subscribeRecapRig(cb: () => void): () => void {
  recapListeners.add(cb);
  return () => {
    recapListeners.delete(cb);
  };
}

export function notifyRecapRig() {
  for (const cb of recapListeners) cb();
}
