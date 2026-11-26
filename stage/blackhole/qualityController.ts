import type { BhTier } from './bhRenderer';
import { detectGpuCaps } from './gpuCaps';

type GpuTimerExt = {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
};

export type QualityStepResult = {
  tier: BhTier;
  tierChanged: boolean;
  renderScale: number;
  camMotion: number;
  recommendedDpr: number;
  emaMs: number;
  p50Ms: number;
  p95Ms: number;
  calibrated: boolean;
};

export async function detectInitialBhTier(gl: WebGL2RenderingContext): Promise<BhTier> {
  const caps = detectGpuCaps(gl);
  if (caps.isSoftwareRenderer || !caps.colorBufferHalfFloat) {
    return 0;
  }

  try {
    const mod = await import('detect-gpu');
    const res = await mod.getGPUTier({
      benchmarksURL: '/bh/gpu-benchmarks',
      glContext: gl,
    });
    if (res.tier <= 1) return 0;
    if (res.tier === 2) return 1;
    return res.isMobile ? 1 : 2;
  } catch {
    return 1;
  }
}

export class BootCalibrator {
  private maxDetectedTier: BhTier;
  private warmupLeft = 3;
  private elapsedMs = 0;
  private sampleCount = 0;
  private sumMs = 0;
  private maxMs = 0;
  private settled = false;
  private settledTier: BhTier = 0;

  constructor(maxDetectedTier: BhTier = 2) {
    this.maxDetectedTier = maxDetectedTier;
  }

  setMaxDetectedTier(tier: BhTier): void {
    this.maxDetectedTier = tier;
    if (this.settled && this.settledTier > tier) {
      this.settledTier = tier;
    }
  }

  get isSettled(): boolean {
    return this.settled;
  }

  get resultTier(): BhTier {
    return this.settledTier;
  }

  pushFrame(frameMs: number): { settledNow: boolean; tier: BhTier } {
    if (this.settled) return { settledNow: false, tier: this.settledTier };
    if (this.warmupLeft > 0) {
      this.warmupLeft -= 1;
      return { settledNow: false, tier: 0 };
    }

    const clamped = Math.max(1, Math.min(200, frameMs));
    this.elapsedMs += clamped;
    this.sampleCount += 1;
    this.sumMs += clamped;
    if (clamped > this.maxMs) this.maxMs = clamped;

    if (this.elapsedMs >= 300 && this.sampleCount >= 8) {
      const meanMs = this.sumMs / this.sampleCount;
      if (meanMs <= 12.5 && this.maxMs <= 26) {
        this.settledTier = this.maxDetectedTier;
      } else if (meanMs <= 17.5 && this.maxMs <= 34) {
        this.settledTier = Math.min(this.maxDetectedTier, 1) as BhTier;
      } else {
        this.settledTier = 0;
      }
      this.settled = true;
      return { settledNow: true, tier: this.settledTier };
    }

    return { settledNow: false, tier: 0 };
  }
}

export class CameraMotionTracker {
  private initialized = false;
  private prevX = 0;
  private prevY = 0;
  private prevZ = 0;
  private prevR = 1;
  private smoothed = 0;

  get value(): number {
    return this.smoothed;
  }

  update(x: number, y: number, z: number, dtSec: number): number {
    const r = Math.max(1e-4, Math.hypot(x, y, z));
    const safeDt = Math.max(1e-3, Math.min(0.1, dtSec));

    if (!this.initialized) {
      this.initialized = true;
      this.prevX = x / r;
      this.prevY = y / r;
      this.prevZ = z / r;
      this.prevR = r;
      this.smoothed = 0;
      return 0;
    }

    const dx = x / r;
    const dy = y / r;
    const dz = z / r;
    const dot = Math.max(-1, Math.min(1, dx * this.prevX + dy * this.prevY + dz * this.prevZ));
    const angSpeed = Math.acos(dot) / safeDt;
    const zoomSpeed = Math.abs(Math.log(r / this.prevR)) / safeDt;

    this.prevX = dx;
    this.prevY = dy;
    this.prevZ = dz;
    this.prevR = r;

    const raw = Math.max(0, Math.min(1, angSpeed * 0.55 + zoomSpeed * 0.45));
    const lambda = raw > this.smoothed ? 14.0 : 3.2;
    this.smoothed += (raw - this.smoothed) * (1 - Math.exp(-lambda * safeDt));
    return this.smoothed;
  }
}

export class GpuTimerRing {
  private readonly gl: WebGL2RenderingContext | null;
  private readonly ext: GpuTimerExt | null;
  private readonly queries: Array<WebGLQuery | null> = [null, null, null, null];
  private readonly inFlight = [false, false, false, false];
  private writeSlot = 0;
  private readSlot = 0;
  private activeSlot = -1;
  private lastGpuMs = 0;

  constructor(gl: WebGL2RenderingContext | null, supported: boolean) {
    this.gl = gl;
    this.ext =
      gl && supported
        ? (gl.getExtension('EXT_disjoint_timer_query_webgl2') as GpuTimerExt | null)
        : null;
  }

  get latestMs(): number {
    return this.lastGpuMs;
  }

  beginFrame(): void {
    const gl = this.gl;
    const ext = this.ext;
    if (!gl || !ext) return;

    this.pollCompleted();
    if (this.inFlight[this.writeSlot]) return;

    let q = this.queries[this.writeSlot];
    if (!q) {
      q = gl.createQuery();
      this.queries[this.writeSlot] = q;
    }
    if (!q) return;

    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    this.activeSlot = this.writeSlot;
  }

  endFrame(): void {
    const gl = this.gl;
    const ext = this.ext;
    if (!gl || !ext || this.activeSlot < 0) return;

    gl.endQuery(ext.TIME_ELAPSED_EXT);
    this.inFlight[this.activeSlot] = true;
    this.writeSlot = (this.writeSlot + 1) & 3;
    this.activeSlot = -1;
  }

  private pollCompleted(): void {
    const gl = this.gl;
    const ext = this.ext;
    if (!gl || !ext) return;

    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      this.inFlight.fill(false);
      return;
    }

    for (let k = 0; k < 4; k++) {
      const idx = (this.readSlot + k) & 3;
      if (!this.inFlight[idx]) continue;
      const q = this.queries[idx];
      if (!q) {
        this.inFlight[idx] = false;
        continue;
      }
      const avail = gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE);
      if (!avail) break;
      const ns = Number(gl.getQueryParameter(q, gl.QUERY_RESULT) ?? 0);
      if (ns > 0) this.lastGpuMs = ns / 1_000_000;
      this.inFlight[idx] = false;
      this.readSlot = (idx + 1) & 3;
    }
  }

  dispose(): void {
    if (!this.gl) return;
    for (let i = 0; i < 4; i++) {
      const q = this.queries[i];
      if (q) this.gl.deleteQuery(q);
      this.queries[i] = null;
      this.inFlight[i] = false;
    }
  }
}

export class QualityController {
  readonly calibrator: BootCalibrator;
  readonly motionTracker = new CameraMotionTracker();
  readonly gpuTimer: GpuTimerRing;

  private tier: BhTier = 0;
  private maxAllowedTier: BhTier = 2;
  private renderScale = 1.0;
  private integral = 0;
  private emaMs = 8.0;
  private warmupFrames = 3;
  private overloadMs = 0;
  private consecutiveSlow = 0;
  private cooldownUntilMs = 0;
  private upgradeLockUntilMs = 0;
  private totalTimeMs = 0;
  private baseDprMax: number;

  private readonly statsRing = new Float64Array(64);
  private readonly statsScratch = new Float64Array(64);
  private statsHead = 0;
  private statsCount = 0;

  constructor(
    gl: WebGL2RenderingContext | null,
    disjointSupported: boolean,
    maxAllowedTier: BhTier = 2,
    baseDprMax = 1.5,
  ) {
    this.maxAllowedTier = maxAllowedTier;
    this.baseDprMax = baseDprMax;
    this.calibrator = new BootCalibrator(maxAllowedTier);
    this.gpuTimer = new GpuTimerRing(gl, disjointSupported);
  }

  setMaxAllowedTier(maxTier: BhTier, currentUserTier?: BhTier): void {
    this.maxAllowedTier = maxTier;
    this.calibrator.setMaxDetectedTier(maxTier);
    if (currentUserTier !== undefined) {
      this.tier = currentUserTier;
    }
  }

  forceTier(tier: BhTier, lockMs = 5000): void {
    this.tier = tier;
    this.upgradeLockUntilMs = this.totalTimeMs + lockMs;
    this.overloadMs = 0;
    this.consecutiveSlow = 0;
  }

  beginGpuMeasure(): void {
    this.gpuTimer.beginFrame();
  }

  endGpuMeasure(): void {
    this.gpuTimer.endFrame();
  }

  step(params: {
    cpuFrameMs: number;
    gpuFrameMs?: number;
    dtSec: number;
    camX: number;
    camY: number;
    camZ: number;
    lowPower: boolean;
    manualTierOverride: boolean;
    hidden?: boolean;
  }): QualityStepResult {
    const camMotion = this.motionTracker.update(params.camX, params.camY, params.camZ, params.dtSec);

    if (params.hidden || params.lowPower) {
      const lowTier: BhTier = params.lowPower ? 0 : this.tier;
      return {
        tier: lowTier,
        tierChanged: lowTier !== this.tier,
        renderScale: params.lowPower ? 0.55 : this.renderScale,
        camMotion,
        recommendedDpr: params.lowPower ? 1.0 : this.computeDpr(),
        emaMs: this.emaMs,
        p50Ms: this.percentile(0.5),
        p95Ms: this.percentile(0.95),
        calibrated: this.calibrator.isSettled,
      };
    }

    const rawCpu = this.warmupFrames > 0 ? Math.min(params.cpuFrameMs, 16.7) : Math.max(1, params.cpuFrameMs);
    if (this.warmupFrames > 0) this.warmupFrames -= 1;

    this.totalTimeMs += rawCpu;
    const gpuMs = params.gpuFrameMs && params.gpuFrameMs > 0 ? params.gpuFrameMs : this.gpuTimer.latestMs;
    const measuredMs = gpuMs > 0 ? Math.max(gpuMs, rawCpu) : rawCpu;

    this.emaMs = this.emaMs * 0.78 + measuredMs * 0.22;
    this.recordStats(rawCpu);

    let tierChanged = false;
    const prevTier = this.tier;

    if (!params.manualTierOverride && !this.calibrator.isSettled) {
      const cal = this.calibrator.pushFrame(measuredMs);
      if (cal.settledNow && cal.tier !== this.tier) {
        this.tier = cal.tier;
        tierChanged = true;
      }
    }

    // PI controller around 15.6 ms target frame budget
    const err = this.emaMs - 15.6;
    this.integral = Math.max(-12, Math.min(12, this.integral + err * Math.min(0.05, params.dtSec)));
    const adjustment = 0.018 * err + 0.005 * this.integral;
    this.renderScale = Math.max(0.5, Math.min(1.0, 1.0 - Math.max(0, adjustment)));

    // Ordered degrade ladder on sustained overload after warmup
    if (!params.manualTierOverride && this.warmupFrames === 0 && this.calibrator.isSettled) {
      if (this.emaMs > 22.0) {
        this.overloadMs += rawCpu;
      } else {
        this.overloadMs = Math.max(0, this.overloadMs - rawCpu * 0.5);
      }

      if (measuredMs > 38.0) {
        this.consecutiveSlow += 1;
      } else {
        this.consecutiveSlow = 0;
      }

      const overloaded = this.overloadMs >= 360 || this.consecutiveSlow >= 3;
      if (overloaded && this.totalTimeMs >= this.cooldownUntilMs) {
        if (this.renderScale > 0.54) {
          this.renderScale = 0.5;
          this.integral = 10;
        }
        if (this.tier > 0) {
          this.tier = (this.tier - 1) as BhTier;
          tierChanged = this.tier !== prevTier;
          this.cooldownUntilMs = this.totalTimeMs + 280;
          this.upgradeLockUntilMs = this.totalTimeMs + 3000;
          this.overloadMs = 0;
          this.consecutiveSlow = 0;
        }
      } else if (
        this.tier < this.maxAllowedTier &&
        this.emaMs < 10.5 &&
        this.totalTimeMs >= this.upgradeLockUntilMs &&
        this.totalTimeMs >= this.cooldownUntilMs
      ) {
        this.tier = (this.tier + 1) as BhTier;
        tierChanged = this.tier !== prevTier;
        this.cooldownUntilMs = this.totalTimeMs + 600;
      }
    }

    return {
      tier: this.tier,
      tierChanged,
      renderScale: this.renderScale,
      camMotion,
      recommendedDpr: this.computeDpr(),
      emaMs: this.emaMs,
      p50Ms: this.percentile(0.5),
      p95Ms: this.percentile(0.95),
      calibrated: this.calibrator.isSettled,
    };
  }

  private computeDpr(): number {
    return this.tier === 0 || this.renderScale < 0.78 ? 1.0 : this.baseDprMax;
  }

  private recordStats(ms: number): void {
    this.statsRing[this.statsHead] = ms;
    this.statsHead = (this.statsHead + 1) & 63;
    if (this.statsCount < 64) this.statsCount += 1;
  }

  private percentile(q: number): number {
    if (this.statsCount === 0) return 0;
    for (let i = 0; i < this.statsCount; i++) {
      this.statsScratch[i] = this.statsRing[i];
    }
    const sub = this.statsScratch.subarray(0, this.statsCount);
    sub.sort();
    const idx = Math.min(this.statsCount - 1, Math.max(0, Math.floor((this.statsCount - 1) * q)));
    return sub[idx];
  }

  dispose(): void {
    this.gpuTimer.dispose();
  }
}
