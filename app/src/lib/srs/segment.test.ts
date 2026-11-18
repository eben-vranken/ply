import { describe, it, expect } from 'vitest';
import { START_EPD, child } from '../chess';
import { segment, deviationText, wholeLineToday } from './segment';

const epdsOf = (path: string[]) => { const out = [START_EPD]; for (const u of path.slice(0, -1)) out.push(child(out[out.length - 1], u)); return out; };
// 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6 4.d3 Be7 5.O-O: White's line in the Two Knights, the main reply being 3...Bc5
const path = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'd2d3', 'f8e7', 'e1g1'];
const epds = epdsOf(path);
const mainReply: Record<string, string> = { [epds[1]]: 'e7e5', [epds[3]]: 'b8c6', [epds[5]]: 'f8c5', [epds[7]]: 'f8e7' };
const top = (e: string) => mainReply[e];
const none = () => false;

describe('review segments', () => {
  it('starts at the reply that sets the line apart, and names it', () => {
    const s = segment({ side: 'w', path, epds, due: [6, 8], top, landmark: none });
    expect(s).toEqual({ scrub: 5, deviation: 5 });
  });

  it('without a deviation, starts at the last branch or transposition before the first due move', () => {
    const s = segment({ side: 'w', path, epds, due: [8], top: (e) => (e === epds[5] ? 'g8f6' : top(e)), landmark: (e) => e === epds[4] });
    expect(s).toEqual({ scrub: 4, deviation: undefined });
  });

  it('plays from move 1 when the landmark is too early, nothing is due, or it is a whole-line day', () => {
    expect(segment({ side: 'w', path, epds, due: [2], top: () => 'x', landmark: none }).scrub).toBe(0);
    expect(segment({ side: 'w', path, epds, due: [], top, landmark: none }).scrub).toBe(0);
    expect(segment({ side: 'w', path, epds, due: [8], top, landmark: none, full: true })).toEqual({ scrub: 0, deviation: 5 });
  });

  it('names the reply by how often it is played', () => {
    expect(deviationText('Nf6', 0.07, true)).toBe('Rare …Nf6: 7% at your level');
    expect(deviationText('Nf6', 0.31, true)).toBe('…Nf6: 31% at your level, not the main reply');
    expect(deviationText('c4', 0.002, false)).toBe('Rare c4: 1% at your level');
    expect(deviationText('h4', undefined, false)).toBe('h4: a reply from your own book');
  });

  it('plays about a fifth of lines whole, the same lines all day', () => {
    const day = new Date(2026, 10, 18, 4).getTime();
    const lines = Array.from({ length: 500 }, (_, i) => ['e2e4', 'x' + i]);
    const n = lines.filter((p) => wholeLineToday(p, day)).length;
    expect(n).toBeGreaterThan(70);
    expect(n).toBeLessThan(130);
    expect(lines.map((p) => wholeLineToday(p, day))).toEqual(lines.map((p) => wholeLineToday(p, day)));
  });
});
