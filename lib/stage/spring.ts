import { stageClock } from './clock';

export type SpringState = {
  value: number;
  velocity: number;
  done: boolean;
};

/**
 * Critically damped 1D spring step (damping ratio zeta = 1.0 -> zero overshoot / zero bounce).
 * Exact analytical solution for constant target over `dtSec`, so it stays unconditionally stable
 * at 30Hz, 60Hz, 120Hz, or 144Hz and preserves velocity across mid-flight retargets.
 */
export function stepCriticallyDampedSpring(
  value: number,
  velocity: number,
  target: number,
  omega: number,
  dtSec: number,
  restEpsilon: number = 1e-3,
): SpringState {
  const dt = Math.min(0.05, Math.max(0, dtSec));
  if (dt === 0) {
    return { value, velocity, done: Math.abs(target - value) <= restEpsilon && Math.abs(velocity) <= restEpsilon };
  }

  const x0 = value - target;
  const expTerm = Math.exp(-omega * dt);
  const c2 = velocity + omega * x0;
  const nextX = (x0 + c2 * dt) * expTerm;
  const nextV = (velocity - omega * c2 * dt) * expTerm;
  const nextVal = target + nextX;

  if (Math.abs(nextX) <= restEpsilon && Math.abs(nextV) <= restEpsilon * omega) {
    return { value: target, velocity: 0, done: true };
  }

  return { value: nextVal, velocity: nextV, done: false };
}

/**
 * Apple UIScrollView rubber-band resistance past bounds (`c = 0.55`).
 * Monotonic, odd, zero kink at 0, asymptotically bounded by `dimension`.
 */
export function rubberBand(offset: number, dimension: number, constant: number = 0.55): number {
  if (offset === 0 || dimension <= 0) return 0;
  const sign = offset < 0 ? -1 : 1;
  const abs = Math.abs(offset);
  return sign * ((abs * dimension * constant) / (dimension + constant * abs));
}

export class DrivenSpring {
  private val: number;
  private vel = 0;
  private target: number;
  private omega: number;
  private unsub: (() => void) | null = null;
  private onUpdate: (value: number) => void;

  constructor(initial: number, omega: number, onUpdate: (value: number) => void) {
    this.val = initial;
    this.target = initial;
    this.omega = omega;
    this.onUpdate = onUpdate;
  }

  getValue(): number {
    return this.val;
  }

  getVelocity(): number {
    return this.vel;
  }

  snap(next: number) {
    this.stop();
    this.val = next;
    this.target = next;
    this.vel = 0;
    this.onUpdate(next);
  }

  to(nextTarget: number, initialVelocity?: number) {
    this.target = nextTarget;
    if (initialVelocity !== undefined) {
      this.vel = initialVelocity;
    }
    if (this.unsub !== null) return;
    this.unsub = stageClock.subscribe((_now, dtSec) => {
      const next = stepCriticallyDampedSpring(this.val, this.vel, this.target, this.omega, dtSec);
      this.val = next.value;
      this.vel = next.velocity;
      this.onUpdate(this.val);
      if (next.done) {
        this.unsub = null;
        return false;
      }
      return true;
    });
  }

  stop() {
    if (this.unsub) {
      this.unsub();
      this.unsub = null;
    }
  }
}
