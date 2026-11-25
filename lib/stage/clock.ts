export type ClockSubscriber = (nowMs: number, dtSec: number) => boolean | void;

type GsapLike = {
  ticker: {
    remove: (fn: (time: number) => void) => void;
    lagSmoothing: (threshold: number, adjustedLag?: number) => void;
  };
  updateRoot: (timeSec: number) => void;
};

const MAX_DT_SEC = 0.05;

/**
 * Single shared requestAnimationFrame hub for Tenet.
 * Executes in two deterministic phases per VSync:
 *   1. GSAP + physics/UI subscribers (`subscribe`)
 *   2. WebGL render subscribers (`subscribeRender`, i.e. R3F `advance(elapsedSec)`)
 * Guarantees 0 rAF callbacks when idle or when `document.hidden` is true.
 */
export class SharedClock {
  private subscribers = new Map<number, ClockSubscriber>();
  private renderSubscribers = new Map<number, ClockSubscriber>();
  private nextId = 1;
  private rafId: number | null = null;
  private pendingSingleRender = false;
  private lastNowMs = 0;
  private elapsedSec = 0;
  private hidden = false;
  private gsapInstance: GsapLike | null = null;
  private boundTick: (nowMs: number) => void;

  constructor() {
    this.boundTick = (nowMs: number) => this.tick(nowMs);
    if (typeof document !== 'undefined') {
      this.hidden = document.hidden;
      document.addEventListener('visibilitychange', () => {
        this.setHidden(document.hidden);
      });
    }
  }

  bindGsap(gsap: GsapLike) {
    if (this.gsapInstance === gsap) return;
    this.gsapInstance = gsap;
    gsap.ticker.remove(gsap.updateRoot);
    gsap.ticker.lagSmoothing(0);
  }

  setHidden(hidden: boolean) {
    if (this.hidden === hidden) return;
    this.hidden = hidden;
    if (hidden) {
      this.pendingSingleRender = false;
      this.stopLoop();
    } else {
      this.lastNowMs = 0;
      this.ensureLoop();
    }
  }

  subscribe(fn: ClockSubscriber): () => void {
    const id = this.nextId++;
    this.subscribers.set(id, fn);
    this.pendingSingleRender = false;
    this.ensureLoop();
    return () => {
      this.subscribers.delete(id);
      if (!this.hasContinuousSubscribers()) {
        this.stopLoop();
      }
    };
  }

  subscribeRender(fn: ClockSubscriber): () => void {
    const id = this.nextId++;
    this.renderSubscribers.set(id, fn);
    this.ensureLoop();
    return () => {
      this.renderSubscribers.delete(id);
      if (!this.hasContinuousSubscribers()) {
        this.stopLoop();
      }
    };
  }

  /** Schedules a single render-phase paint on the next VSync without keeping a loop alive. */
  requestRender() {
    if (this.hidden || this.renderSubscribers.size === 0) return;
    if (this.hasContinuousSubscribers() || this.rafId !== null) return;
    this.pendingSingleRender = true;
    this.scheduleNext();
  }

  subscriberCount(): number {
    return this.subscribers.size + this.renderSubscribers.size;
  }

  isRunning(): boolean {
    return this.rafId !== null;
  }

  getElapsedSec(): number {
    return this.elapsedSec;
  }

  /** Exposed for deterministic unit testing without browser rAF. */
  stepManual(nowMs: number) {
    if (this.hidden || !this.hasContinuousSubscribers()) return;
    const rawDtSec = this.lastNowMs > 0 ? Math.max(0, (nowMs - this.lastNowMs) / 1000) : 1 / 60;
    const dtSec = Math.min(MAX_DT_SEC, rawDtSec);
    this.lastNowMs = nowMs;
    this.elapsedSec += dtSec;

    if (this.gsapInstance) {
      this.gsapInstance.updateRoot(this.elapsedSec);
    }

    for (const [id, cb] of this.subscribers) {
      const keep = cb(nowMs, dtSec);
      if (keep === false) {
        this.subscribers.delete(id);
      }
    }

    this.flushRenderPhase(nowMs, dtSec);
  }

  private hasContinuousSubscribers(): boolean {
    return this.subscribers.size > 0 || this.renderSubscribers.size > 0;
  }

  private flushRenderPhase(nowMs: number, dtSec: number) {
    for (const [id, cb] of this.renderSubscribers) {
      const keep = cb(nowMs, dtSec);
      if (keep === false) {
        this.renderSubscribers.delete(id);
      }
    }
  }

  private tick(nowMs: number) {
    this.rafId = null;
    if (this.hidden) {
      this.pendingSingleRender = false;
      this.lastNowMs = 0;
      return;
    }

    if (this.hasContinuousSubscribers()) {
      this.pendingSingleRender = false;
      this.stepManual(nowMs);
      if (!this.hidden && this.hasContinuousSubscribers()) {
        this.scheduleNext();
      } else {
        this.lastNowMs = 0;
      }
      return;
    }

    if (this.pendingSingleRender) {
      this.pendingSingleRender = false;
      this.lastNowMs = 0;
      this.flushRenderPhase(nowMs, 0);
    }
  }

  private ensureLoop() {
    if (this.hidden || !this.hasContinuousSubscribers() || this.rafId !== null) return;
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return;
    this.scheduleNext();
  }

  private scheduleNext() {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return;
    this.rafId = window.requestAnimationFrame(this.boundTick);
  }

  private stopLoop() {
    if (this.rafId !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.lastNowMs = 0;
  }
}

export const stageClock = new SharedClock();
