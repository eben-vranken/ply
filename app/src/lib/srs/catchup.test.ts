import { describe, it, expect } from 'vitest';
import { shouldOffer, suggestDays, planCatchUp, dayOf, limitsFor, daysAway } from './catchup';

const DAY = 864e5;
const L = { newMoves: 10, newTraps: 5, newMistakes: 10, maxReviews: 150 };

describe('catching up', () => {
  it('is offered for a real backlog only', () => {
    expect(shouldOffer(40, 150, 10)).toBe(false); // small
    expect(shouldOffer(120, 150, 1)).toBe(false); // fits in a day, not away long
    expect(shouldOffer(120, 150, 3)).toBe(true); // three days away
    expect(shouldOffer(300, 150, 0)).toBe(true); // over the daily limit
  });
  it('spreads the backlog evenly over 3 to 7 days', () => {
    expect(suggestDays(60)).toBe(3);
    expect(suggestDays(200)).toBe(5);
    expect(suggestDays(2000)).toBe(7);
    expect(planCatchUp(301, 5, 0).perDay).toBe(61);
  });
  it('caps reviews at the share and pauses new cards while it runs, then ends', () => {
    const c = planCatchUp(300, 5, 10 * DAY);
    expect(dayOf(c, 10 * DAY)).toBe(0);
    expect(limitsFor(L, c, 12 * DAY)).toEqual({ newMoves: 0, newTraps: 0, newMistakes: 0, maxReviews: 60 });
    expect(dayOf(c, 15 * DAY)).toBe(null);
    expect(limitsFor(L, c, 15 * DAY)).toEqual(L);
    expect(limitsFor(L, null, 0)).toEqual(L);
    // never above the daily limit you set
    expect(limitsFor({ ...L, maxReviews: 40 }, c, 10 * DAY).maxReviews).toBe(40);
  });
  it('counts the days since you last studied', () => {
    expect(daysAway([0, 3, 0, 0, 0])).toBe(3);
    expect(daysAway([1, 0, 2])).toBe(0);
    expect(daysAway([0, 0])).toBe(Infinity);
  });
});
