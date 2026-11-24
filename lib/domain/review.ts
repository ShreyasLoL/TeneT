import type { PaceStatus } from './goals';
import type { DayKey } from './types';

export type ReviewInput = {
  score: number | null;
  streak: number;
  /** Average score of the previous 7 sealed nights, if known. */
  avgScoreLast7?: number;
  /** Labels of required trackables that were missed tonight. */
  missed: string[];
  goals?: { label: string; status: PaceStatus; etaDay?: DayKey }[];
};

/**
 * Rule-based review text. No ML. This is the single seam where a model can be
 * swapped in later: same input, same string[] output.
 */
export function generateReview(input: ReviewInput): string[] {
  const lines: string[] = [];
  const { score, streak, avgScoreLast7, missed, goals = [] } = input;

  if (score === null) {
    lines.push('Nothing was scheduled tonight.');
  } else {
    lines.push(
      score >= 90
        ? 'Near-perfect night.'
        : score >= 70
          ? 'Solid night.'
          : score >= 40
            ? 'Uneven night.'
            : "Rough night, and it's sealed. Tomorrow starts clean.",
    );
    if (avgScoreLast7 !== undefined) {
      const diff = Math.round(score - avgScoreLast7);
      if (Math.abs(diff) >= 10) {
        lines.push(`That's ${Math.abs(diff)} points ${diff > 0 ? 'above' : 'below'} your 7-night average.`);
      }
    }
  }

  if (missed.length > 0) {
    const shown = missed.slice(0, 3).join(', ');
    const extra = missed.length > 3 ? ` and ${missed.length - 3} more` : '';
    lines.push(`Missed: ${shown}${extra}.`);
  }

  lines.push(streak >= 2 ? `${streak} nights sealed in a row.` : 'Streak: 1 night.');

  for (const g of goals) {
    if (g.status === 'achieved') lines.push(`${g.label}: reached.`);
    else if (g.status === 'behind') lines.push(`${g.label} is behind pace.`);
    else if (g.status === 'stalled') lines.push(`${g.label} has stalled.`);
    else if (g.status === 'on_track' && g.etaDay) lines.push(`${g.label}: on pace for ${g.etaDay}.`);
  }
  return lines;
}
