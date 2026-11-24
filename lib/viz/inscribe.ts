export const INSCRIPTION_NOTCHES = 128;
export const INSCRIPTION_MAX_CHARS = 500;

/**
 * Deterministic notch pattern (<=128 bytes, 0..255) inscribed onto a sealed ring's outer edge
 * from the reflection text. Empty or whitespace-only text yields a flat all-zero ring.
 */
export function inscription(text: string | null | undefined): Uint8Array {
  const out = new Uint8Array(INSCRIPTION_NOTCHES);
  if (!text) return out;
  const trimmed = text.trim().slice(0, INSCRIPTION_MAX_CHARS);
  if (trimmed.length === 0) return out;

  const bytes = new TextEncoder().encode(trimmed);
  for (let i = 0; i < INSCRIPTION_NOTCHES; i++) {
    const start = Math.floor((i * bytes.length) / INSCRIPTION_NOTCHES);
    const end = Math.max(start + 1, Math.floor(((i + 1) * bytes.length) / INSCRIPTION_NOTCHES));
    let hash = (0x811c9dc5 ^ i) >>> 0;
    for (let j = start; j < end; j++) {
      hash ^= bytes[j % bytes.length];
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    // Keep notches clearly legible (40..255) whenever reflection is non-empty
    out[i] = 40 + (hash % 216);
  }
  return out;
}
