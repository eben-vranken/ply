// The streak, with freezes. A freeze is earned by playing: every 7 study days in a row earn one,
// and you hold at most 2. A day without study while you hold one uses it: the streak survives that
// day (it does not grow). Freezes are never bought; they come from the review log alone, so they
// need no storage and a backup restores them exactly. Pure, so it is tested.

export const FREEZE_EVERY = 7;
export const FREEZE_MAX = 2;

export interface Streak {
  /** study days in the current streak (frozen days keep it alive but do not count) */
  streak: number;
  longest: number;
  /** freezes held now */
  held: number;
  /** days (indexes into history) a freeze covered */
  frozen: Set<number>;
  /** freezes earned in all */
  earned: number;
}

/** `history`: reviews per study day, oldest first, the last entry today (still open). */
export function streakOf(history: number[]): Streak {
  let run = 0, longest = 0, held = 0, earned = 0;
  const frozen = new Set<number>();
  const last = history.length - 1;
  for (let i = 0; i <= last; i++) {
    if (history[i] > 0) {
      run++;
      longest = Math.max(longest, run);
      if (run % FREEZE_EVERY === 0 && held < FREEZE_MAX) { held++; earned++; }
    } else if (i === last) {
      // today is still open: no study yet does not break anything
    } else if (run > 0 && held > 0) {
      held--;
      frozen.add(i);
    } else {
      run = 0;
    }
  }
  return { streak: run, longest, held, frozen, earned };
}
