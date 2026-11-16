// The landing page shows numbers and moves from demo.json. This keeps that file in step with the
// opening data it was built from (rebuild it with `npm run landing-data` after the pipeline runs).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import demo from './demo.json';

const data = (f: string) => readFileSync(new URL(`../../../public/data/${f}`, import.meta.url), 'utf8');

describe('landing demo data', () => {
  it('was built from the opening data that ships', () => {
    const manifest = JSON.parse(data('manifest.json'));
    expect(demo.version).toBe(manifest.version);
    expect(demo.counts.bands).toEqual(manifest.bands);
    expect(demo.counts.openings).toBe(JSON.parse(data('openings.json')).length);
  });
  it('plays a legal line in the hero, ending where the next position starts', () => {
    const c = new Chess();
    for (const p of demo.hero) {
      const m = c.move({ from: p.uci.slice(0, 2), to: p.uci.slice(2, 4) });
      expect(m.san).toBe(p.san);
      expect(c.fen().split(' ')[0]).toBe(p.fen.split(' ')[0]);
    }
  });
  it('shows a trap whose bait and refutation are legal, and a safe move that is not the bait', () => {
    const c = new Chess(demo.trap.fen);
    expect(c.move({ from: demo.trap.bait.uci.slice(0, 2), to: demo.trap.bait.uci.slice(2, 4) }).san).toBe(demo.trap.bait.san);
    for (const r of demo.trap.refute) expect(c.move({ from: r.uci.slice(0, 2), to: r.uci.slice(2, 4) }).san).toBe(r.san);
    expect(demo.trap.safe.uci).not.toBe(demo.trap.bait.uci);
    expect(demo.trap.freq).toBeGreaterThan(5);
    expect(demo.trap.loss).toBeGreaterThanOrEqual(15);
  });
  it('gives every band its own replies, as shares that stay under 100%', () => {
    for (const b of demo.counts.bands) {
      const moves = (demo.fan.bands as Record<string, { moves: { pct: number }[] }>)[b].moves;
      expect(moves.length).toBeGreaterThan(3);
      expect(moves.reduce((s, m) => s + m.pct, 0)).toBeLessThanOrEqual(100.5);
    }
  });
});
