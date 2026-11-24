type Segment = [number, number, number, number];

// Half-wordmark segments in normalized coordinates: left 'T', 'E', and left half of 'N'.
// Mirrored across x = 0 to produce the full palindrome 'TENET'.
const LEFT_SEGMENTS: Segment[] = [
  // T (centered around x = -3.1)
  [-3.65, 0.72, -2.55, 0.72],
  [-3.1, 0.72, -3.1, -0.72],
  // E (centered around x = -1.6)
  [-2.05, 0.72, -2.05, -0.72],
  [-2.05, 0.72, -1.18, 0.72],
  [-2.05, 0.0, -1.32, 0.0],
  [-2.05, -0.72, -1.18, -0.72],
  // Left half of N (left vertical + diagonal from (-0.65, 0.72) to axis (0, 0))
  [-0.65, 0.72, -0.65, -0.72],
  [-0.65, 0.72, 0.0, 0.0],
];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates `count` target positions (3 floats per particle) forming a strictly
 * symmetric TENET wordmark by sampling the left half and mirroring x -> -x.
 */
export function buildWordmarkTargets(count: number = 6000, seed: number = 7): Float32Array {
  const half = Math.floor(count / 2);
  const out = new Float32Array(half * 2 * 3);
  const rng = mulberry32(seed);

  const lengths = LEFT_SEGMENTS.map(([x1, y1, x2, y2]) => Math.hypot(x2 - x1, y2 - y1));
  const totalLen = lengths.reduce((a, b) => a + b, 0);

  for (let i = 0; i < half; i++) {
    let pick = ((i + rng() * 0.9) / half) * totalLen;
    let segIdx = 0;
    while (segIdx < lengths.length - 1 && pick > lengths[segIdx]) {
      pick -= lengths[segIdx];
      segIdx++;
    }
    const [x1, y1, x2, y2] = LEFT_SEGMENTS[segIdx];
    const t = lengths[segIdx] > 0 ? pick / lengths[segIdx] : 0;
    const jitterX = (rng() - 0.5) * 0.055;
    const jitterY = (rng() - 0.5) * 0.055;
    const x = x1 + (x2 - x1) * t + jitterX;
    const y = y1 + (y2 - y1) * t + jitterY;
    const z = 0;

    // Left half particle
    const li = i * 3;
    out[li] = x;
    out[li + 1] = y;
    out[li + 2] = z;

    // Exact mirrored counterpart
    const ri = (half + i) * 3;
    out[ri] = -x;
    out[ri + 1] = y;
    out[ri + 2] = z;
  }

  return out;
}
