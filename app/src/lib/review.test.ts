import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { MoveTree } from './tree.svelte';
import { classify, sacrifices, moveAccuracy, gameAccuracy, summarise, type PosEval } from './review';

describe('MoveTree', () => {
  it('goes back and forward again, as on Lichess', () => {
    const t = new MoveTree();
    t.play('e2e4'); t.play('e7e5'); t.play('g1f3');
    expect(t.path).toEqual(['e2e4', 'e7e5', 'g1f3']);
    t.back(); t.back();
    expect(t.path).toEqual(['e2e4']);
    t.fwd(); t.fwd();
    expect(t.path).toEqual(['e2e4', 'e7e5', 'g1f3']);
    t.first(); expect(t.path).toEqual([]);
    t.last(); expect(t.path).toEqual(['e2e4', 'e7e5', 'g1f3']);
  });
  it('keeps the old line when a different move is played, as a variation', () => {
    const t = new MoveTree();
    t.play('e2e4'); t.play('e7e5'); t.back();
    t.play('c7c5');
    expect(t.cur.parent!.children.map((c) => c.san)).toEqual(['e5', 'c5']);
    t.back(); t.fwd();
    expect(t.cur.san).toBe('e5'); // forward follows the mainline
    // playing a move that is already there walks into it
    t.back(); const n = t.play('c7c5');
    expect(n).toBe(t.cur.parent!.children[1]);
  });
  it('setPath reuses what is there and adds what is not', () => {
    const t = MoveTree.of(['e2e4', 'e7e5', 'g1f3']);
    t.setPath(['e2e4', 'c7c5']);
    expect(t.cur.san).toBe('c5');
    expect(t.mainline.map((n) => n.san)).toEqual(['e4', 'e5', 'Nf3']);
  });
  it('removes a variation and steps out of it', () => {
    const t = MoveTree.of(['e2e4', 'e7e5']);
    t.setPath(['e2e4', 'c7c5', 'g1f3']);
    t.remove(t.cur.parent!);
    expect(t.path).toEqual(['e2e4']);
    expect(t.cur.children.map((c) => c.san)).toEqual(['e5']);
  });
  it('promotes a variation to the mainline', () => {
    const t = MoveTree.of(['e2e4', 'e7e5']);
    t.setPath(['e2e4', 'c7c5']);
    t.promote(t.cur);
    expect(t.mainline.map((n) => n.san)).toEqual(['e4', 'c5']);
  });
});

/** a game's positions with made-up evals (cp from the side to move) */
function game(ucis: string[], cps: number[], best: string[] = [], second: (number | undefined)[] = []) {
  const c = new Chess();
  const fens = [c.fen()];
  for (const u of ucis) { c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); fens.push(c.fen()); }
  const evals: PosEval[] = cps.map((cp, i) => ({ lines: [{ cp, pv: [best[i] ?? 'a2a3'] }, ...(second[i] !== undefined ? [{ cp: second[i]!, pv: ['h2h3'] }] : [])] }));
  return { fens, evals };
}

describe('classify', () => {
  it('grades by the win% given away', () => {
    // 1.e4 (best), 1...e5 drops from 0 to −300 for Black
    const { fens, evals } = game(['e2e4', 'e7e5'], [30, -30, 300], ['e2e4', 'c7c5']);
    const v = classify(fens, ['e2e4', 'e7e5'], evals);
    expect(v[0]!.kind).toBe('best');
    expect(v[1]!.kind).toBe('blunder');
    expect(v[1]!.best).toBe('c7c5');
  });
  it('marks a book move', () => {
    const { fens, evals } = game(['e2e4'], [30, -30]);
    evals[0].book = true;
    expect(classify(fens, ['e2e4'], evals)[0]!.kind).toBe('book');
  });
  it('the only good move is a great move', () => {
    const { fens, evals } = game(['e2e4'], [50, -50], ['e2e4'], [-250]);
    expect(classify(fens, ['e2e4'], evals)[0]!.kind).toBe('great');
  });
  it('leaves unanalysed moves out', () => {
    const { fens, evals } = game(['e2e4', 'e7e5'], [30, -30]);
    expect(classify(fens, ['e2e4', 'e7e5'], evals)[1]).toBeNull();
  });
  it('scores a mate on the board', () => {
    const ucis = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
    const { fens, evals } = game(ucis, [0, 0, -50, 9999], ['e2e4', 'e7e5', 'e2e4', 'd8h4']);
    expect(classify(fens, ucis, evals)[3]!.kind).toBe('best');
  });
});

describe('sacrifices', () => {
  it('sees a piece left en prise', () => {
    // 1.e4 e5 2.Bc4 Nc6 3.Bxf7+?! the bishop is taken by the king
    expect(sacrifices('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 2 3', 'c4f7')).toBe(true);
    // a quiet developing move is not
    expect(sacrifices('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 2 3', 'g1f3')).toBe(false);
  });
});

describe('accuracy', () => {
  it('is 100 for no loss and falls with it', () => {
    expect(moveAccuracy(0)).toBeCloseTo(100, 0);
    expect(moveAccuracy(20)).toBeLessThan(45);
    expect(gameAccuracy([100, 100, 10])!).toBeLessThan(70);
  });
  it('counts per side', () => {
    const { fens, evals } = game(['e2e4', 'e7e5'], [30, -30, 300], ['e2e4', 'c7c5']);
    const s = summarise(classify(fens, ['e2e4', 'e7e5'], evals), true);
    expect(s.w.counts.best).toBe(1);
    expect(s.b.counts.blunder).toBe(1);
    expect(s.w.accuracy!).toBeGreaterThan(s.b.accuracy!);
  });
});
