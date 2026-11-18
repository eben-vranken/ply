import { describe, it, expect } from 'vitest';
import { logCheck, formatLogCheck } from './logcheck';
import type { CardRow, RepRow, ReviewRow } from './db';

const DAY = 864e5;
const c = (id: string, epd: string, move: string): CardRow => ({ id, type: 'move', side: 'w', epd, move, answer: [], line: [], label: '', fsrs: {} as never, due: 0, suspended: 0, created: 0, lapses: 0 });
const r = (cardId: string, day: number, rating: 1 | 2 | 3, over: Partial<ReviewRow> = {}): ReviewRow => ({ cardId, at: day * DAY, rating, ms: 2000, mode: 'today', stage: 'young', ...over });

describe('log check', () => {
  const cards = [c('a', 'E1', 'e2e4'), c('b1', 'E2', 'f1c4'), c('b2', 'E2', 'f1b5')];
  const rep: RepRow[] = [{ side: 'w', epd: 'E2', moves: ['f1c4', 'f1b5'] }];

  it('measures credit on the way, the A/B arms and the branches', () => {
    const reviews = [
      // a: credited on the way, then a lapse at its next due review; a miss while not due
      r('a', 1, 3, { implicit: 1 }), r('a', 5, 1, { seg: 1 }), r('a', 6, 1, { implicit: 1, played: 'd2d4' }), r('a', 10, 3, { seg: 1 }),
      // b1 and b2: twins at a branch; b2 missed by playing b1's move the day after b1's review
      r('b1', 1, 3, { seg: 0 }), r('b2', 2, 1, { seg: 0, played: 'f1c4', sib: 1 }), r('b2', 4, 3, { seg: 0, sibling: 1 }), r('b1', 9, 3, { seg: 0 })
    ];
    const k = logCheck(reviews, cards, rep);
    expect(k.credit.againNotDue).toEqual({ n: 3, rate: 1 / 3 });
    expect(k.credit.implicitSuccesses).toBe(1);
    expect(k.credit.lapseAfterImplicit).toEqual({ n: 1, rate: 1 });
    expect(k.segments.firstTry.landmark).toEqual({ n: 2, rate: 0.5 });
    expect(k.segments.firstTry.move1).toEqual({ n: 4, rate: 0.75 });
    expect(k.branches.lapseAtBranch).toEqual({ n: 4, rate: 0.25 });
    expect(k.branches.siblingMisses).toEqual({ n: 1, rate: 1 });
    expect(k.branches.siblingAttempts).toBe(1);
    expect(k.branches.lapseTwinRecent).toEqual({ n: 2, rate: 0.5 });
    expect(k.branches.lapseTwinNot).toEqual({ n: 2, rate: 0 });
    expect(formatLogCheck(k)).toContain('misses at a branch that were your other move: 100.0% (n=1)');
  });
});
