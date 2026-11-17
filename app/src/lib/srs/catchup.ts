// Catching up after time away. A big backlog of due reviews is spread over a few days instead of
// one long queue: each day takes an even share (most at risk of being forgotten first, as always),
// and new cards wait until you are through. Nothing is hidden: the due count stays the real one.
// Pure, so it is tested.

export interface CatchUp {
  /** start of the study day it began */
  start: number;
  days: number;
  /** reviews a day while it runs */
  perDay: number;
}

const DAY = 864e5;

/** A backlog worth spreading: at least 50 due, and more than a day's limit or after 3+ days away. */
export function shouldOffer(backlog: number, maxReviews: number, daysAway: number): boolean {
  return backlog >= 50 && (backlog > maxReviews || daysAway >= 3);
}

/** About 40 reviews a day, over 3 to 7 days. */
export const suggestDays = (backlog: number) => Math.max(3, Math.min(7, Math.ceil(backlog / 40)));

export function planCatchUp(backlog: number, days: number, today: number): CatchUp {
  return { start: today, days, perDay: Math.max(1, Math.ceil(backlog / days)) };
}

/** Which day of the plan today is (0-based), or null once it is over. */
export function dayOf(c: CatchUp | null, today: number): number | null {
  if (!c) return null;
  const d = Math.round((today - c.start) / DAY);
  return d >= 0 && d < c.days ? d : null;
}

/** The day's limits while catching up: reviews capped at the share, no new cards. */
export function limitsFor<T extends { newMoves: number; newTraps: number; maxReviews: number }>(limits: T, c: CatchUp | null, today: number): T {
  if (dayOf(c, today) === null) return limits;
  return { ...limits, newMoves: 0, newTraps: 0, maxReviews: Math.min(limits.maxReviews, c!.perDay) };
}

/** Whole days since the last study day (0 = studied today). `history` is reviews per day, today last. */
export function daysAway(history: number[]): number {
  for (let i = history.length - 1, d = 0; i >= 0; i--, d++) if (history[i]) return d;
  return Infinity;
}
