import { describe, expect, it } from 'vitest';
import { INSCRIPTION_NOTCHES, inscription } from './inscribe';

describe('inscribe', () => {
  it('returns flat all-zero array for empty or whitespace reflection', () => {
    expect(inscription('')).toEqual(new Uint8Array(INSCRIPTION_NOTCHES));
    expect(inscription('   \n  ')).toEqual(new Uint8Array(INSCRIPTION_NOTCHES));
    expect(inscription(null)).toEqual(new Uint8Array(INSCRIPTION_NOTCHES));
  });

  it('is deterministic and trims + caps to 500 chars like the domain', () => {
    const a = inscription('  cold air after midnight.  ');
    const b = inscription('cold air after midnight.');
    expect(a).toEqual(b);
    expect(a.length).toBe(INSCRIPTION_NOTCHES);
    expect(a.some((v) => v > 0)).toBe(true);

    const longA = inscription(`${'a'.repeat(500)}extra`);
    const longB = inscription('a'.repeat(500));
    expect(longA).toEqual(longB);
  });
});
