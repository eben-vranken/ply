import { describe, it, expect } from 'vitest';
import { readPgn, writePgn, cleanComment, walk } from './pgn';
import { plan, rows, sideOfGame } from './import/repertoire';
import { epdAfter, START_EPD, type Side } from './chess';

const STUDY = `[Event "My Italian: Main line"]
[Site "https://lichess.org/study/abcd1234/efgh5678"]
[Orientation "white"]
[Result "*"]

{ The plan is d4 in one go. }
1. e4 e5 2. Nf3 Nc6 3. Bc4 { [%cal Gf7f5] Aim at f7. } 3... Bc5 (3... Nf6 4. d3 $1 { Quiet and solid. } (4. Ng5?! d5) 4... Be7) 4. c3 Nf6 5. d4 exd4 6. cxd4 *

[Event "My Italian: Two knights"]
[Orientation "white"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 h6 5. O-O *`;

describe('reading PGN', () => {
  it('reads every game of a study with variations, comments and NAGs', () => {
    const [g, g2] = readPgn(STUDY);
    expect(g.headers.Event).toBe('My Italian: Main line');
    expect(g.comment).toBe('The plan is d4 in one go.');
    expect(g.error).toBeUndefined();
    const bc4 = g.moves[0].children[0].children[0].children[0].children[0];
    expect(bc4.san).toBe('Bc4');
    expect(bc4.comment).toBe('Aim at f7.');
    // 3...Bc5 is the main line, 3...Nf6 the variation
    expect(bc4.children.map((n) => n.san)).toEqual(['Bc5', 'Nf6']);
    const nf6 = bc4.children[1];
    expect(nf6.children.map((n) => n.san)).toEqual(['d3', 'Ng5']);
    expect(nf6.children[0].comment).toBe('Quiet and solid.');
    expect(nf6.children[0].children[0].san).toBe('Be7');
    expect(g2.moves[0].children[0].children[0].children[0].children[0].children[0].children[0].children[0].children[0].san).toBe('O-O');
  });
  it('takes move numbers glued to moves, 0-0 and annotation marks', () => {
    const [g] = readPgn('1.e4 e5 2.Nf3!? Nc6 3.Bc4 Bc5 4.0-0 Nf6 *');
    let n = g.moves[0];
    const sans: string[] = [];
    while (n) { sans.push(n.san); n = n.children[0]; }
    expect(sans).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O', 'Nf6']);
  });
  it('splits games without headers on their results', () => {
    expect(readPgn('1. e4 e5 1-0\n\n1. d4 d5 0-1').length).toBe(2);
  });
  it('reports an illegal move with where it happened, and keeps the other lines', () => {
    const [g] = readPgn('1. e4 e5 2. Nf3 (2. Nf6) Nc6 *');
    expect(g.error).toMatch(/Illegal move Nf6 after 1\.e4 e5/);
    expect(g.moves[0].children[0].children.map((n) => n.san)).toEqual(['Nf3']);
  });
  it('marks a game that starts from a set-up position', () => {
    const [g] = readPgn('[SetUp "1"]\n[FEN "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2"]\n\n2. Nf3 *');
    expect(g.setup).toBe(true);
    expect(g.moves[0].san).toBe('Nf3');
  });
  it('cleans Lichess commands out of comments', () => {
    expect(cleanComment(' [%clk 0:05:00] Good [%csl Rd4] move ')).toBe('Good move');
  });
});

describe('writing PGN', () => {
  it('writes variations and comments that read back the same', () => {
    const [g] = readPgn(STUDY);
    const out = (list: typeof g.moves): import('./pgn').OutNode[] => list.map((n) => ({ san: n.san, comment: n.comment, children: out(n.children) }));
    const text = writePgn({ headers: { Event: 'Copy', Result: '*' }, comment: g.comment, moves: out(g.moves) });
    expect(text.replace(/\s+/g, ' ')).toContain('3. Bc4 { Aim at f7. } 3... Bc5 (3... Nf6 4. d3 { Quiet and solid. } (4. Ng5 d5) 4... Be7) 4. c3');
    const [back] = readPgn(text);
    const flat = (gg: typeof g) => { const s: string[] = []; walk(gg, (p, n) => s.push(p.join(' ') + '|' + n.uci + '|' + (n.comment ?? ''))); return s.sort(); };
    expect(flat(back)).toEqual(flat(g));
  });
});

describe('planning a repertoire import', () => {
  const games = readPgn(STUDY);
  const none = { moves: [] as string[], own: false };
  it('collects your moves, the replies and the notes, merging the games', () => {
    const p = plan({ games, side: null, current: () => none, note: () => undefined, inTree: () => true, depth: 10 });
    expect(p.games.map((g) => g.side)).toEqual(['w', 'w']);
    expect(sideOfGame(games[0])).toBe('w');
    const at = (path: string[]) => p.picks.get('w|' + epdAfter(path));
    expect(at([])!.moves).toEqual(['e2e4']);
    expect(at(['e2e4', 'e7e5', 'g1f3', 'b8c6'])!.moves).toEqual(['f1c4']);
    expect(at(['e2e4', 'e7e5', 'g1f3', 'b8c6'])!.note).toBe('Aim at f7.');
    // 4.d3 is the main line against 3...Nf6 and 4.Ng5 a variation: two moves of yours there
    expect(at(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6'])!.moves).toEqual(['d2d3', 'f3g5']);
    expect(p.branchy.length).toBe(1);
    expect(p.replies.get('w|' + epdAfter(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4']))!.replies).toEqual(['f8c5', 'g8f6']);
  });
  it('reports conflicts with your own choices, not with the defaults', () => {
    const e = epdAfter(['e2e4', 'e7e5', 'g1f3', 'b8c6']);
    const current = (_s: Side, epd: string) => (epd === e ? { moves: ['f1b5'], own: true } : epd === START_EPD ? { moves: ['d2d4'], own: false } : none);
    const p = plan({ games, side: null, current, note: () => undefined, inTree: () => true, depth: 10 });
    expect(p.conflicts.map((c) => [c.mine, c.theirs])).toEqual([[['f1b5'], ['f1c4']]]);
    expect(p.added).toBeGreaterThan(0);
    expect(p.same).toBe(0);
    const key = p.conflicts[0].key;
    const keep = rows(p, { choices: { [key]: 'mine' }, branches: false, current, note: () => undefined });
    expect(keep.rep.find((r) => r.epd === e)).toBeUndefined();
    const both = rows(p, { choices: { [key]: 'both' }, branches: false, current, note: () => undefined });
    expect(both.rep.find((r) => r.epd === e)!.moves).toEqual(['f1b5', 'f1c4']);
    const pgn = rows(p, { choices: {}, branches: false, current, note: () => undefined });
    expect(pgn.rep.find((r) => r.epd === e)!.moves).toEqual(['f1c4']);
    // only the main line move where the PGN gives two, unless branches are kept
    const at = epdAfter(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6']);
    expect(pgn.rep.find((r) => r.epd === at)!.moves).toEqual(['d2d3']);
    expect(rows(p, { choices: {}, branches: true, current, note: () => undefined }).rep.find((r) => r.epd === at)!.moves).toEqual(['d2d3', 'f3g5']);
  });
  it('never replaces a note of yours', () => {
    const e = epdAfter(['e2e4', 'e7e5', 'g1f3', 'b8c6']);
    const note = (_s: Side, epd: string) => (epd === e ? 'Mine' : undefined);
    const p = plan({ games, side: null, current: () => none, note, inTree: () => true, depth: 10 });
    expect(p.notesKept).toBe(1);
    expect(rows(p, { choices: {}, branches: false, current: () => none, note }).rep.find((r) => r.epd === e)!.note).toBeUndefined();
  });
  it('counts moves outside the tree and deeper than your lines, and skips what cannot be read', () => {
    const p = plan({ games: [...games, ...readPgn('1. e4 e5 2. Ke2 Nf6 *'), ...readPgn('[SetUp "1"]\n[FEN "8/8/8/8/8/8/k7/K7 w - - 0 1"]\n\n1. Kb1 *')], side: 'w', current: () => none, note: () => undefined, inTree: (epd) => epd === START_EPD, depth: 3 });
    expect(p.outside).toBeGreaterThan(0);
    expect(p.deep).toBeGreaterThan(0);
    expect(p.games[3].skipped).toMatch(/set-up position/);
    const q = plan({ games: readPgn('1. e4 e5 *'), side: null, current: () => none, note: () => undefined, inTree: () => true, depth: 10 });
    expect(q.games[0].skipped).toMatch(/side/);
  });
});
