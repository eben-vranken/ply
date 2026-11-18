import { describe, it, expect } from 'vitest';
import { epdAfter, START_EPD } from './chess';
import { teach, passed } from './teach';
import type { TreeNode } from './data';

const at = (sans: string[]) => epdAfter(sans);

describe('teaching a move', () => {
  it('says one line for an obvious move', () => {
    const e = at(['e2e4', 'd7d5', 'e4d5']);
    expect(teach({ epd: e, uci: 'd8d5', last: { to: 'd5', captured: true } })).toEqual({ plain: true, text: 'Recapture on d5.' });
    // taking the piece that just moved is not a recapture when it took nothing
    expect(teach({ epd: e, uci: 'd8d5', last: { to: 'd5', captured: false } }).text).not.toBe('Recapture on d5.');
    // the only legal move: the king has one square
    expect(teach({ epd: '7k/8/6Q1/8/8/8/8/K7 b - -', uci: 'h8h7' }).plain).toBe(true);
    // mate needs no idea
    expect(teach({ epd: at(['f2f3', 'e7e5', 'g2g4']), uci: 'd8h4', idea: { t: 'g4g5', g: 300, s: ['d8h4'] } })).toEqual({ plain: true, text: 'Checkmate.' });
  });

  it('names the threat a move stops, and what it would do', () => {
    const e = at(['e2e4', 'e7e5', 'g1f3', 'd7d6']);
    const t = teach({ epd: e, uci: 'h2h3', idea: { t: 'c8g4', g: 120, s: ['h2h3'] } });
    expect(t.plain).toBe(false);
    expect(t.text).toContain('Stops …Bg4, which would pin the knight on f3 to your queen.');
    expect(t.threat).toBe('c8g4');
    // a move that does not stop it says nothing about it
    expect(teach({ epd: e, uci: 'b1c3', idea: { t: 'c8g4', g: 120, s: ['h2h3'] } }).threat).toBeUndefined();
    expect(passed(e).split(' ')[1]).toBe('b');
  });

  it('says what a move prepares when it is what makes the next one work', () => {
    const giuoco = at(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5']);
    const c3 = teach({ epd: giuoco, uci: 'c2c3', next: { reply: 'g8f6', move: 'd2d4' } });
    expect(c3.text).toContain('Prepares d4: the pawn on c3 will support it.');
    expect(c3.prepares).toEqual(['c2c3', 'g8f6', 'd2d4']);
    const bc4 = teach({ epd: at(['e2e4', 'e7e5', 'g1f3', 'b8c6']), uci: 'f1c4', next: { reply: 'f8c5', move: 'e1g1' } });
    expect(bc4.text).toContain('Clears the way to castle.');
    // backing up a square nobody contests is no reason: 2.Bf4 and then e3 in the London
    expect(teach({ epd: at(['d2d4', 'd7d5']), uci: 'c1f4', next: { reply: 'g8f6', move: 'e2e3' } }).text).not.toContain('Prepares');
    // a next move that owes nothing to this one
    expect(teach({ epd: START_EPD, uci: 'e2e4', next: { reply: 'e7e5', move: 'b1c3' } }).plain).toBe(true);
  });

  it('calls a move the only good one when everything else played here loses at least a pawn', () => {
    const e = at(['e2e4', 'e7e5', 'g1f3', 'd7d6']);
    const node: TreeNode = { g: 1000, e: 40, d: 'd2d4', m: [['d2d4', 600, 0, 0, 0], ['f1c4', 300, 0, 0, 0], ['b1c3', 100, 0, 0, 0]] };
    const evals: Record<string, number> = { d2d4: 50, f1c4: -80, b1c3: -100 };
    const child = (u: string) => (u in evals ? { g: 1, e: evals[u], d: '', m: [] } : undefined);
    expect(teach({ epd: e, uci: 'd2d4', node, childNode: child }).text).toContain('The only good move here: the others played at your level lose about 1.5 pawns.');
    expect(teach({ epd: e, uci: 'd2d4', node, childNode: (u) => ({ g: 1, e: u === 'd2d4' ? 50 : 0, d: '', m: [] }) }).plain).toBe(true);
  });

  it('falls back to reading the board', () => {
    const t = teach({ epd: START_EPD, uci: 'e2e4' });
    expect(t.plain).toBe(true);
    expect(t.text).toMatch(/centre/);
  });
});
