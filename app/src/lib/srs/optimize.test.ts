/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { histories, runOptimizer } from './optimize';

const DAY = 864e5;
const t0 = new Date(2026, 0, 1, 12).getTime();

describe('FSRS optimisation', () => {
  it('turns the review log into one history per card, in study days', () => {
    const rows = [
      { cardId: 'a', at: t0 + 3 * DAY, rating: 3 },
      { cardId: 'a', at: t0, rating: 1 },
      { cardId: 'a', at: t0 + 60_000, rating: 3 }, // same day
      { cardId: 'b', at: t0, rating: 1 },
      { cardId: 'b', at: t0 + DAY, rating: 2 }
    ];
    expect([...histories(rows, 4)]).toEqual([2, 3, 1, 0, 3, 0, 3, 3, 2, 1, 0, 2, 1]);
  });

  it('a review after the rollover hour counts as the next study day', () => {
    const night = new Date(2026, 0, 1, 23).getTime(), early = new Date(2026, 0, 2, 3).getTime(), late = new Date(2026, 0, 2, 5).getTime();
    expect([...histories([{ cardId: 'a', at: night, rating: 1 }, { cardId: 'a', at: early, rating: 3 }, { cardId: 'a', at: late, rating: 3 }], 4)]).toEqual([1, 3, 1, 0, 3, 0, 3, 1]);
  });

  it('fits weights in the shipped WebAssembly', async () => {
    const wasm = readFileSync(fileURLToPath(new URL('../../../public/fsrs/ply_optimizer.wasm', import.meta.url)));
    const rows: { cardId: string; at: number; rating: number }[] = [];
    let seed = 7;
    const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 16) % 100; };
    for (let c = 0; c < 500; c++) {
      let t = t0;
      rows.push({ cardId: 'c' + c, at: t, rating: 1 });
      for (const g of [1, 3, 8, 20]) { t += g * DAY; rows.push({ cardId: 'c' + c, at: t, rating: rnd() < 5 + g * 2 ? 1 : 3 }); }
    }
    const fit = await runOptimizer(wasm, histories(rows, 4));
    expect(fit.status).toBe('fitted');
    expect(fit.weights.length).toBe(21);
    const none = await runOptimizer(wasm, histories(rows.slice(0, 1), 4));
    expect(none.status).toBe('too-little');
  });
});

describe('fitted weights in the scheduler', () => {
  it('change the intervals, and the defaults come back', async () => {
    const { grade, setWeights, Rating, createEmptyCard } = await import('./fsrs');
    const now = new Date(2026, 0, 1);
    const after = () => grade(grade(createEmptyCard(now), Rating.Good, now), Rating.Good, new Date(+now + 864e5)).scheduled_days;
    const base = after();
    const { default_w } = await import('ts-fsrs');
    setWeights([...default_w].map((w, i) => (i < 4 ? w * 4 : w)));
    expect(after()).toBeGreaterThan(base);
    setWeights(null);
    expect(after()).toBe(base);
  });
});
