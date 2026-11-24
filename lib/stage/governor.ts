import type { QualityLevel } from './tiers';

export type FrameSampleOptions = {
  hidden?: boolean;
  burstStart?: boolean;
  gap?: boolean;
};

export type GovernorStats = {
  level: QualityLevel;
  changed: boolean;
  p50: number;
  p95: number;
};

const BUFFER_SIZE = 120;
const WARMUP_FRAMES = 30;
const DOWN_THRESHOLD_MS = 18;
const UP_THRESHOLD_MS = 13;
const DOWN_SUSTAIN_MS = 2_000;
const UP_SUSTAIN_MS = 10_000;
const MIN_DWELL_MS = 10_000;
const MAX_FRAME_GAP_MS = 100;

function percentile(sorted: Float64Array, count: number, q: number): number {
  if (count === 0) return 0;
  const idx = Math.min(count - 1, Math.max(0, Math.floor((count - 1) * q)));
  return sorted[idx];
}

export class FrameGovernor {
  private level: QualityLevel;
  private ring = new Float64Array(BUFFER_SIZE);
  private scratch = new Float64Array(BUFFER_SIZE);
  private count = 0;
  private head = 0;
  private warmupRemaining = WARMUP_FRAMES;
  private lastChangeAt = 0;
  private highSince: number | null = null;
  private lowSince: number | null = null;
  private p50 = 0;
  private p95 = 0;

  constructor(initialLevel: QualityLevel = 1, nowMs: number = 0) {
    this.level = initialLevel;
    this.lastChangeAt = nowMs;
  }

  getLevel(): QualityLevel {
    return this.level;
  }

  setLevel(level: QualityLevel, nowMs: number) {
    this.level = level;
    this.lastChangeAt = nowMs;
    this.resetWindow();
  }

  markCompile(nowMs: number) {
    this.lastChangeAt = nowMs;
    this.resetWindow();
  }

  private resetWindow() {
    this.count = 0;
    this.head = 0;
    this.warmupRemaining = WARMUP_FRAMES;
    this.highSince = null;
    this.lowSince = null;
  }

  pushFrame(frameMs: number, nowMs: number, opts: FrameSampleOptions = {}): GovernorStats {
    if (opts.hidden || opts.burstStart || opts.gap || frameMs > MAX_FRAME_GAP_MS || frameMs <= 0) {
      return { level: this.level, changed: false, p50: this.p50, p95: this.p95 };
    }

    if (this.warmupRemaining > 0) {
      this.warmupRemaining--;
      return { level: this.level, changed: false, p50: this.p50, p95: this.p95 };
    }

    this.ring[this.head] = frameMs;
    this.head = (this.head + 1) % BUFFER_SIZE;
    if (this.count < BUFFER_SIZE) this.count++;

    for (let i = 0; i < this.count; i++) {
      this.scratch[i] = this.ring[i];
    }
    const view = this.scratch.subarray(0, this.count);
    view.sort();

    this.p50 = percentile(view, this.count, 0.5);
    this.p95 = percentile(view, this.count, 0.95);

    if (this.count < 20) {
      return { level: this.level, changed: false, p50: this.p50, p95: this.p95 };
    }

    const dwellElapsed = nowMs - this.lastChangeAt;
    let changed = false;

    if (this.p95 > DOWN_THRESHOLD_MS) {
      this.lowSince = null;
      if (this.highSince === null) this.highSince = nowMs;
      if (
        this.level < 4 &&
        dwellElapsed >= MIN_DWELL_MS &&
        nowMs - this.highSince >= DOWN_SUSTAIN_MS
      ) {
        this.level = (this.level + 1) as QualityLevel;
        this.lastChangeAt = nowMs;
        this.resetWindow();
        changed = true;
      }
    } else if (this.p95 < UP_THRESHOLD_MS) {
      this.highSince = null;
      if (this.lowSince === null) this.lowSince = nowMs;
      if (
        this.level > 0 &&
        dwellElapsed >= MIN_DWELL_MS &&
        nowMs - this.lowSince >= UP_SUSTAIN_MS
      ) {
        this.level = (this.level - 1) as QualityLevel;
        this.lastChangeAt = nowMs;
        this.resetWindow();
        changed = true;
      }
    } else {
      this.highSince = null;
      this.lowSince = null;
    }

    return { level: this.level, changed, p50: this.p50, p95: this.p95 };
  }
}
