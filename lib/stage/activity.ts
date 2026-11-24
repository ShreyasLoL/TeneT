export type ActivityLevel = 'burst' | 'ambient' | 'still';

export const DESKTOP_IDLE_MS = 45_000;
export const TOUCH_IDLE_MS = 10_000;
export const AMBIENT_FPS = 24;
export const AMBIENT_STEP_MS = 1000 / AMBIENT_FPS;

export class StageActivity {
  private leases = new Map<number, string>();
  private nextLeaseId = 1;
  private lastInputAt = 0;
  private hidden = false;
  private lowPower = false;
  private reducedMotion = false;
  private alwaysAlive = false;
  private touch = false;
  private listeners = new Set<() => void>();
  private demandRequests = new Set<() => void>();

  constructor(nowMs: number = 0) {
    this.lastInputAt = nowMs;
  }

  configure(opts: {
    hidden?: boolean;
    lowPower?: boolean;
    reducedMotion?: boolean;
    alwaysAlive?: boolean;
    touch?: boolean;
  }) {
    if (opts.hidden !== undefined) this.hidden = opts.hidden;
    if (opts.lowPower !== undefined) this.lowPower = opts.lowPower;
    if (opts.reducedMotion !== undefined) this.reducedMotion = opts.reducedMotion;
    if (opts.alwaysAlive !== undefined) this.alwaysAlive = opts.alwaysAlive;
    if (opts.touch !== undefined) this.touch = opts.touch;
    this.emit();
  }

  notifyInput(nowMs: number) {
    this.lastInputAt = nowMs;
    this.emit();
  }

  acquire(reason: string): () => void {
    const id = this.nextLeaseId++;
    this.leases.set(id, reason);
    this.emit();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.leases.delete(id);
      this.emit();
    };
  }

  leaseCount(): number {
    return this.leases.size;
  }

  getLevel(nowMs: number): ActivityLevel {
    if (this.hidden) return 'still';
    if (this.leases.size > 0) return 'burst';
    if (this.lowPower || this.reducedMotion) return 'still';
    if (this.alwaysAlive) return 'ambient';
    const grace = this.touch ? TOUCH_IDLE_MS : DESKTOP_IDLE_MS;
    return nowMs - this.lastInputAt <= grace ? 'ambient' : 'still';
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  onDemandFrame(cb: () => void): () => void {
    this.demandRequests.add(cb);
    return () => {
      this.demandRequests.delete(cb);
    };
  }

  requestSingleFrame() {
    for (const cb of this.demandRequests) cb();
  }

  private emit() {
    for (const cb of this.listeners) cb();
  }
}

export const stageActivity = new StageActivity(typeof performance !== 'undefined' ? performance.now() : 0);

export function acquireFrames(reason: string): () => void {
  return stageActivity.acquire(reason);
}
