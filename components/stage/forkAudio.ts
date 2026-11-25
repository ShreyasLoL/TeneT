type ActiveTension = {
  ctx: AudioContext;
  osc: OscillatorNode;
  gain: GainNode;
  filter: BiquadFilterNode;
};

let sharedCtx: AudioContext | null = null;
let activeTension: ActiveTension | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!sharedCtx) sharedCtx = new Ctor();
    if (sharedCtx.state === 'suspended') {
      void sharedCtx.resume().catch(() => undefined);
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

export function startHoldTensionAudio(side: 'left' | 'right', durationSec: number) {
  stopHoldTensionAudio(false);
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    const isPrograde = side === 'right';
    osc.type = isPrograde ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isPrograde ? 64 : 108, now);
    osc.frequency.exponentialRampToValueAtTime(isPrograde ? 132 : 56, now + durationSec);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(isPrograde ? 160 : 260, now);
    filter.frequency.exponentialRampToValueAtTime(isPrograde ? 540 : 120, now + durationSec);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(isPrograde ? 0.03 : 0.026, now + durationSec * 0.85);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);

    activeTension = { ctx, osc, gain, filter };
  } catch {
    activeTension = null;
  }
}

export function stopHoldTensionAudio(committed: boolean) {
  const cur = activeTension;
  activeTension = null;
  if (!cur) return;

  try {
    const now = cur.ctx.currentTime;
    cur.gain.gain.cancelScheduledValues(now);
    cur.gain.gain.setValueAtTime(Math.max(0.0001, cur.gain.gain.value), now);
    const fadeSec = committed ? 0.36 : 0.16;
    if (committed) {
      cur.osc.frequency.exponentialRampToValueAtTime(
        cur.osc.type === 'triangle' ? 196 : 82,
        now + fadeSec,
      );
    }
    cur.gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeSec);
    cur.osc.stop(now + fadeSec + 0.02);
  } catch {
    // ignore audio teardown errors
  }
}
