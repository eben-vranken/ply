import { describe, it, expect } from 'vitest';
import { findMistakes, parsePgn, splitPgns, sideOf, type PlyAnalysis } from './mistakes';
import { parseBackup, backupName } from '../backup';
import { monthsToSync, windowStart, lastMonths } from './chesscom';
import { createEmptyCard } from 'ts-fsrs';

const ply = (cps: number[], played: string, afterCp: number, n = 0): PlyAnalysis => ({
  ply: n, lines: cps.map((cp, i) => ({ cp, pv: ['m' + i, 'r' + i] })), played, afterCp, reply: ['a', 'b', 'c', 'd']
});

describe('mistake rule', () => {
  it('flags a loss of 20 win% points or more', () => {
    const [m] = findMistakes([ply([50, 30, -40], 'x', -300)]);
    expect(m.loss).toBeGreaterThanOrEqual(20);
    expect(m.best).toBe('m0');
    // every MultiPV move within 30 cp of the best is accepted
    expect(m.accepted).toEqual(['m0', 'm1']);
    expect(m.refute).toEqual(['a', 'b', 'c']);
  });
  it('ignores small losses', () => {
    expect(findMistakes([ply([50], 'x', -50)])).toEqual([]);
  });
  it('ignores games already decided (win% outside 10–90)', () => {
    expect(findMistakes([ply([900], 'x', 0)])).toEqual([]);
    expect(findMistakes([ply([-900], 'x', -3000)])).toEqual([]);
  });
  it('keeps at most 3 per game, the largest losses', () => {
    const plies = [ply([0], 'a', -200, 1), ply([0], 'b', -500, 2), ply([0], 'c', -300, 3), ply([0], 'd', -400, 4)];
    expect(findMistakes(plies).map((m) => m.ply)).toEqual([2, 4, 3]);
  });
  it('a move the engine also likes is not a mistake', () => {
    expect(findMistakes([{ ...ply([50, 40], 'm1', -300) }])).toEqual([]);
  });
});

const PGN = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.11.02"]
[White "alice"]
[Black "Bob"]
[Result "0-1"]
[Link "https://www.chess.com/game/live/1"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`;

describe('PGN import', () => {
  it('parses moves to UCI with the position before each', () => {
    const g = parsePgn(PGN)!;
    expect(g.moves.slice(0, 3)).toEqual(['e2e4', 'e7e5', 'd1h5']);
    expect(g.fens.length).toBe(g.moves.length + 1);
    expect(g.url).toBe('https://www.chess.com/game/live/1');
    expect(sideOf(g, 'BOB')).toBe('b');
    expect(sideOf(g, 'carol')).toBe(null);
  });
  it('splits a paste of several games', () => {
    expect(splitPgns(PGN + '\n\n' + PGN).length).toBe(2);
  });
});

describe('backup format', () => {
  const card = { id: 'm1', fsrs: createEmptyCard(new Date(2026, 0, 1)) };
  const good = { app: 'ply', schemaVersion: 1, exportedAt: '2026-11-14T00:00:00Z', tables: { settings: [], repertoire: [], cards: [card], reviews: [], games: [] } };
  it('round-trips through JSON with dates restored', () => {
    const b = parseBackup(JSON.stringify(good));
    expect(b.tables.cards[0].fsrs.due).toBeInstanceOf(Date);
    expect(+b.tables.cards[0].fsrs.due).toBe(+card.fsrs.due);
  });
  it('rejects other files and newer schemas', () => {
    expect(() => parseBackup('{"hello":1}')).toThrow();
    expect(() => parseBackup(JSON.stringify({ ...good, schemaVersion: 99 }))).toThrow(/newer/);
    expect(() => parseBackup(JSON.stringify({ ...good, tables: { ...good.tables, cards: undefined } }))).toThrow(/cards/);
  });
  it("still imports a backup with Keep going's 'extra' reviews, as Today reviews", () => {
    const review = { id: 1, cardId: 'm1', at: 1, rating: 3, ms: 900, mode: 'extra', stage: 'young' };
    const b = parseBackup(JSON.stringify({ ...good, tables: { ...good.tables, reviews: [review] } }));
    expect(b.tables.reviews[0].mode).toBe('today');
  });
  it('names the file by date', () => {
    expect(backupName(new Date('2026-11-14T10:00:00Z'))).toBe('ply-backup-2026-11-14.json');
  });
});

describe('chess.com months', () => {
  const all = ['2024/03', '2025/12', '2026/09', '2026/10', '2026/11'].map((m) => 'https://api.chess.com/pub/player/x/games/' + m);
  it('the first sync takes three months, later syncs never reach back into older history', () => {
    const first = lastMonths(all, 3);
    expect(first).toEqual(all.slice(2));
    const synced = first.slice(0, -1);
    expect(monthsToSync(all, synced, '2026/09')).toEqual([all[4]]);
    // an install that already recorded the whole history still only takes the window
    expect(monthsToSync(all, all.slice(0, -1), '2026/09')).toEqual([all[4]]);
    expect(monthsToSync([...all, all[4].replace('11', '12')], synced, '2026/09')).toEqual([all[4], all[4].replace('11', '12')]);
  });
  it('the window starts two months back', () => {
    expect(windowStart(new Date(Date.UTC(2026, 10, 14)))).toBe('2026/09');
    expect(windowStart(new Date(Date.UTC(2026, 0, 5)))).toBe('2025/11');
  });
});
