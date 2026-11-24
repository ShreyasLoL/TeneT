import { describe, expect, it } from 'vitest';
import { buildReviewForDay } from './review';

describe('buildReviewForDay', () => {
  it('computes 7-night average, missed labels with key fallback, and delegates to generateReview', () => {
    const days = [
      {
        day: '2026-11-22',
        sealedAt: '2026-11-22T18:00:00.000Z',
        score: 60,
        results: [],
        reflection: null,
        streak: 1,
      },
      {
        day: '2026-11-23',
        sealedAt: '2026-11-23T18:00:00.000Z',
        score: 70,
        results: [],
        reflection: null,
        streak: 2,
      },
      {
        day: '2026-11-24',
        sealedAt: '2026-11-24T18:00:00.000Z',
        score: 90,
        results: [
          { key: 'known', version: 1, status: 'required' as const, satisfied: true, weight: 2, scored: true },
          { key: 'archived-k', version: 1, status: 'required' as const, satisfied: false, weight: 1, scored: true },
        ],
        reflection: null,
        streak: 3,
      },
    ];

    const review = buildReviewForDay({
      day: '2026-11-24',
      days,
      trackables: [{ key: 'known', label: 'Known Item' }],
    });

    expect(review).not.toBeNull();
    expect(review?.avgScoreLast7).toBe(65);
    expect(review?.missed).toEqual(['archived-k']);
    expect(review?.lines[0]).toBe('Near-perfect night.');
    expect(review?.lines.some((l) => l.includes('25 points above your 7-night average'))).toBe(true);
    expect(review?.lines.some((l) => l.includes('Missed: archived-k.'))).toBe(true);
    expect(review?.lines.some((l) => l.includes('3 nights sealed in a row.'))).toBe(true);
  });
});
