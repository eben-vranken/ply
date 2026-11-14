// Automatic grading (docs/BRIEF.md, "Grading"). No Anki buttons.
import { Rating } from 'ts-fsrs';

export interface Attempt {
  /** a wrong move was played before the right one */
  wrong: boolean;
  /** Hint was used */
  hinted: boolean;
  /** a playable-but-not-yours move was played first (Move cards) */
  playable: boolean;
  /** time per move, ms, for the moves of this card */
  times: number[];
}

/**
 * Wrong on the first try → Again. Correct but slower than the Hard threshold
 * (average per move for multi-move cards), or after a hint or a "playable"
 * retry → Hard. Otherwise Good. Easy is never given.
 */
export function rate(a: Attempt, hardSeconds: number): Rating.Again | Rating.Hard | Rating.Good {
  if (a.wrong) return Rating.Again;
  const avg = a.times.length ? a.times.reduce((s, t) => s + t, 0) / a.times.length : 0;
  if (a.hinted || a.playable || avg > hardSeconds * 1000) return Rating.Hard;
  return Rating.Good;
}

export const ratingName = (r: number) => (['', 'Again', 'Hard', 'Good', 'Easy'][r] ?? '');
