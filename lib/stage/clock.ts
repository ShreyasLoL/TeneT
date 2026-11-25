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
 * Drives GSAP timelines, Lenis smooth scroll, UI gesture springs, and R3F demand frames.
 * Guarantees 0 rAF callbacks when there are no active subscribers or when `document.hidden` is true.
 */
export class SharedClock {
  private subscribers = new Map<number, ClockSubscriber>();
  private nextId = 1;
  private rafId: number | null = null;
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
      this.stopLoop();
    } else {
      this.lastNowMs = 0;
      this.ensureLoop();
    }
  }

  subscribe(fn: ClockSubscriber): () => void {
    const id = this.nextId++;
    this.subscribers.set(id, fn);
    this.ensureLoop();
    return () => {
      this.subscribers.delete(id);
      if (this.subscribers.size === 0) {
        this.stopLoop();
      }
    };
  }

  subscriberCount(): number {
    return this.subscribers.size;
  }

  isRunning(): boolean {
    return this.rafId !== null;
  }

  getElapsedSec(): number {
    return this.elapsedSec;
  }

  /** Exposed for deterministic unit testing without browser rAF. */
  stepManual(nowMs: number) {
    if (this.hidden || this.subscribers.size === 0) return;
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
  }

  private tick(nowMs: number) {
    this.rafId = null;
    if (this.hidden || this.subscribers.size === 0) {
      this.lastNowMs = 0;
      return;
    }

    this.stepManual(nowMs);

    if (!this.hidden && this.subscribers.size > 0) {
      this.scheduleNext();
    } else {
      this.lastNowMs = 0;
    }
  }

  private ensureLoop() {
    if (this.hidden || this.subscribers.size === 0 || this.rafId !== null) return;
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
