import { Color } from 'three';

const scratchColor = new Color();

/**
 * Converts a CSS hex token (sRGB) into linear-sRGB [r, g, b] for WebGL2 shaders
 * rendered through EffectComposer's linear HalfFloat pipeline -> sRGB output.
 */
export function hexToLinearRgb(hex: string): [number, number, number] {
  scratchColor.set(hex.trim() || '#0B0910');
  return [scratchColor.r, scratchColor.g, scratchColor.b];
}

export function readAmberLinear(): [number, number, number] {
  if (typeof window === 'undefined') return hexToLinearRgb('#EF9F27');
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--status-warning')
    .trim();
  return hexToLinearRgb(raw || '#EF9F27');
}
