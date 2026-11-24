export type MotionTokens = {
  easeOutCss: string;
  easeOutBezier: [number, number, number, number];
  microMs: number;
  uiMs: number;
  sceneMs: number;
  heroMs: number;
  reduced: boolean;
};

function parseDurationMs(value: string, fallback: number): number {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (trimmed.endsWith('ms')) {
    const n = parseFloat(trimmed.slice(0, -2));
    return Number.isFinite(n) ? n : fallback;
  }
  if (trimmed.endsWith('s')) {
    const n = parseFloat(trimmed.slice(0, -1));
    return Number.isFinite(n) ? n * 1000 : fallback;
  }
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? n : fallback;
}

/** Read motion tokens at use time so prefers-reduced-motion overrides apply live. */
export function readMotionTokens(): MotionTokens {
  const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined';
  const reduced = hasDom
    ? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    : false;
  const styles = hasDom ? getComputedStyle(document.documentElement) : null;

  const easeOutCss =
    styles?.getPropertyValue('--ease-out').trim() || 'cubic-bezier(0.16, 1, 0.3, 1)';
  const microMs = parseDurationMs(styles?.getPropertyValue('--duration-micro') ?? '', 160);
  const uiMs = parseDurationMs(styles?.getPropertyValue('--duration-ui') ?? '', 280);
  const sceneMs = parseDurationMs(
    styles?.getPropertyValue('--duration-scene') ?? '',
    reduced ? 200 : 900,
  );
  const heroMs = parseDurationMs(
    styles?.getPropertyValue('--duration-hero') ?? '',
    reduced ? 280 : 3500,
  );

  return {
    easeOutCss,
    easeOutBezier: [0.16, 1, 0.3, 1],
    microMs,
    uiMs,
    sceneMs,
    heroMs,
    reduced,
  };
}

/** Single project easing curve: cubic-bezier(0.16, 1, 0.3, 1) (expo-out). */
export function expoOut(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - Math.pow(2, -10 * t);
}
