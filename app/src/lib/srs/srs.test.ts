import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { Rating, State, createEmptyCard } from 'ts-fsrs';
import { child, epdOf, epdAfter, START_EPD, sans, moveOrder } from '../chess';
import type { Tree } from '../data';
import type { CardRow } from '../db';
import { makeCtx, generate, pathTo, coverage, moveId, otherOrders, type Mine } from './lines';
import { buildQueue, groupLines, withTwins, dayStart, type QueueInput } from './queue';
import { rate } from './grade';
import { grade, stageOf } from './fsrs';

/** A tree from weighted SAN lines; every move's games add up along the way. */
function treeFrom(lines: [number, string][]): Tree {
  const t: Tree = {};
  for (const [w, s] of lines) {
    const c = new Chess();
    for (const san of s.split(' ')) {
      const epd = epdOf(c);
      const mv = c.move(san);
      const uci = mv.from + mv.to + (mv.promotion ?? '');
      const n = (t[epd] ??= { g: 0, e: 0, d: '', m: [] });
      n.g += w;
      const row = n.m.find((r) => r[0] === uci);
      if (row) row[1] += w; else n.m.push([uci, w, 0, 0, 0]);
    }
    const end = epdOf(c);
    (t[end] ??= { g: 0, e: 0, d: '', m: [] }).g += w;
  }
  for (const n of Object.values(t)) { n.m.sort((a, b) => b[1] - a[1]); n.d = n.m[0]?.[0] ?? ''; }
  return t;
}

const TREE = treeFrom([
  [600, 'e4 e5 Nf3 Nc6 Bc4 Bc5'],
  [300, 'e4 e5 Nf3 Nc6 Bc4 Nf6'],
  [100, 'e4 e5 Nf3 d6 d4'],
  [500, 'e4 c5 Nf3 d6 d4'],
  [20, 'e4 a6 d4'], // 1.3%: below the 3% reply threshold
  [400, 'd4 d5 c4 e6'],
  [80, 'Nf3 d5 d4'],
  [10, 'b4 e5'] // under 50 games
]);
const ctx = makeCtx(TREE, [], []);
const none: Mine = () => undefined;

describe('chess helpers', () => {
  it('applies moves to EPDs like chess.js', () => {
    const c = new Chess();
    let e = START_EPD;
    for (const san of 'e4 d5 exd5 c5 dxc6 Nf6 cxb7 e5 bxa8=Q Bc5 Nf3 Ke7 Bb5 a6 O-O'.split(' ')) {
      const mv = c.move(san);
      e = child(e, mv.from + mv.to + (mv.promotion ?? ''));
      expect(e).toBe(epdOf(c));
    }
  });
  it('keeps en passant only when the capture is legal', () => {
    expect(epdAfter(['e2e4'])).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -');
    expect(epdAfter(['e2e4', 'a7a6', 'e4e5', 'd7d5']).endsWith(' w KQkq d6')).toBe(true);
  });
  it('writes move orders', () => {
    expect(moveOrder(sans(['e2e4', 'e7e5', 'g1f3']), true)).toBe('1.e4 e5 2.Nf3 ?');
    expect(moveOrder(sans(['d2d4', 'd7d5', 'c2c4', 'e7e6']), true)).toBe('1.d4 d5 2.c4 e6 3.?');
  });
});

describe('line generation', () => {
  it('follows the default move on your turn and every common reply', () => {
    const L = generate(ctx, none, { side: 'w', depth: 3, replyPct: 0.03 });
    const cards = [...L.cards.values()];
    // 1.e4, then 2.Nf3 after both e5 and c5, then 3.Bc4 / 3.d4
    expect(cards.map((c) => sans(pathTo(L, c.epd).concat(c.move)).join(' ')).sort()).toEqual(
      ['e4', 'e4 c5 Nf3', 'e4 e5 Nf3', 'e4 c5 Nf3 d6 d4', 'e4 e5 Nf3 Nc6 Bc4', 'e4 e5 Nf3 d6 d4'].sort()
    );
    // rare 1...a6 is not a line
    expect(L.pos.has(epdAfter(['e2e4', 'a7a6']))).toBe(false);
  });

  it('follows your own book: rare replies and moves past the end of the tree', () => {
    // 1...a6 is below the threshold; after 1.e4 a6 2.d4 b5 3.Bd3 the tree has no data at all
    const a6 = epdAfter(['e2e4', 'a7a6']), b5 = epdAfter(['e2e4', 'a7a6', 'd2d4']), bd3 = epdAfter(['e2e4', 'a7a6', 'd2d4', 'b7b5']);
    const mine: Mine = (side, epd) => (epd === bd3 ? ['f1d3'] : undefined);
    const book = (_s: string, epd: string) => (epd === epdAfter(['e2e4']) ? ['a7a6'] : epd === b5 ? ['b7b5'] : undefined);
    const L = generate(ctx, mine, { side: 'w', depth: 5, replyPct: 0.03 }, book);
    expect(L.pos.has(a6)).toBe(true);
    expect(L.cards.has(moveId('w', a6, 'd2d4'))).toBe(true);
    expect(TREE[bd3]).toBeUndefined();
    expect(L.cards.has(moveId('w', bd3, 'f1d3'))).toBe(true);
    // a book reply the tree knows keeps its real frequency; the line still ends where nothing goes on
    expect(L.pos.get(a6)!.prob).toBeCloseTo(L.pos.get(epdAfter(['e2e4']))!.prob * (20 / 1520), 5);
    expect(L.leaves.has(child(bd3, 'f1d3'))).toBe(true);
    // without the book none of it is a line
    expect(generate(ctx, mine, { side: 'w', depth: 5, replyPct: 0.03 }).pos.has(a6)).toBe(false);
  });

  it('stops at the depth limit', () => {
    const L = generate(ctx, none, { side: 'w', depth: 1, replyPct: 0.03 });
    expect(L.cards.size).toBe(1);
  });

  it('Black starts from every first move with ≥ 1% and ≥ 50 games', () => {
    const L = generate(ctx, none, { side: 'b', depth: 2, replyPct: 0.03 });
    const roots = new Set([...L.pos.values()].map((p) => p.root).filter(Boolean));
    expect([...roots].sort()).toEqual(['d2d4', 'e2e4', 'g1f3']);
  });

  it('branches when you have a second move, with separate card ids', () => {
    const e = epdAfter(['e2e4', 'e7e5', 'g1f3', 'b8c6']);
    const mine: Mine = (s, p) => (s === 'w' && p === e ? ['f1c4', 'f1b5'] : undefined);
    const L = generate(ctx, mine, { side: 'w', depth: 4, replyPct: 0.03 });
    expect(L.branches.has(e)).toBe(true);
    expect(L.cards.has(moveId('w', e, 'f1c4'))).toBe(true);
    expect(L.cards.has(moveId('w', e, 'f1b5'))).toBe(true);
    expect(moveId('w', e, 'f1c4')).not.toBe(moveId('w', e, 'f1b5'));
  });

  it('merges transpositions into one card and remembers the other order', () => {
    const t = treeFrom([[500, 'Nf3 Nf6 g3 g6'], [400, 'g3 Nf6 Nf3 g6']]);
    const c = makeCtx(t, [], []);
    const L = generate(c, none, { side: 'b', depth: 3, replyPct: 0.03 });
    const e = epdAfter(['g1f3', 'g8f6', 'g2g3']);
    const ids = [...L.cards.values()].filter((x) => x.epd === e);
    expect(ids.length).toBe(1);
    expect(otherOrders(L, e).length).toBe(1);
  });

  it('forces the punish answer where a trap starts', () => {
    const e = epdAfter(['e2e4', 'e7e5', 'g1f3', 'd7d6']);
    const c = makeCtx(TREE, [], [{ id: 't', kind: 'punish', epd: e, side: 'w', answer: ['f1c4'], line: ['f1c4'], loss: 20, freq: 0.1, o: 0 }]);
    const L = generate(c, none, { side: 'w', depth: 3, replyPct: 0.03 });
    expect(L.cards.has(moveId('w', e, 'f1c4'))).toBe(true);
    expect(L.cards.has(moveId('w', e, 'd2d4'))).toBe(false);
  });

  it('line probability is the product of reply frequencies', () => {
    const L = generate(ctx, none, { side: 'w', depth: 3, replyPct: 0.03 });
    const p = L.pos.get(epdAfter(['e2e4', 'e7e5', 'g1f3', 'b8c6']))!;
    const n1 = TREE[epdAfter(['e2e4'])], n2 = TREE[epdAfter(['e2e4', 'e7e5', 'g1f3'])];
    expect(p.prob).toBeCloseTo((n1.m[0][1] / n1.g) * (n2.m[0][1] / n2.g));
  });

  it('coverage counts the games that stay in your lines', () => {
    const cov = coverage(ctx, none, { side: 'w', depth: 3, replyPct: 0.03 });
    // after 1.e4 only 1...a6 (20 of 1520 games) leaves the lines
    expect(cov).toBeCloseTo(1500 / 1520, 2);
  });

  it('a line that runs out of reliable replies counts as covered', () => {
    const t = treeFrom([[40, 'e4 e5 Nf3 Nc6'], [30, 'e4 e5 Nf3 d6'], [20, 'e4 e5 Nf3 Nf6']]);
    const c = makeCtx(t, [], []);
    // after 2.Nf3 every reply has < 50 games: the line ends there, nothing is lost
    expect(coverage(c, none, { side: 'w', depth: 5, replyPct: 0.03, minGames: 50 })).toBeCloseTo(1, 5);
  });
});

function card(over: Partial<CardRow> & { id: string }): CardRow {
  return {
    type: 'move', side: 'w', epd: START_EPD, move: 'e2e4', answer: [], line: [], label: '', fsrs: { ...createEmptyCard(new Date(0)), state: State.Review, scheduled_days: 5 },
    due: 0, suspended: 0, created: 0, lapses: 0, ...over
  };
}

describe('queue', () => {
  const L = generate(ctx, none, { side: 'w', depth: 3, replyPct: 0.03 });
  const specs = [...L.cards.values()];
  const asCard = (i: number, extra: Partial<CardRow> = {}) => card({ id: specs[i].id, epd: specs[i].epd, move: specs[i].move, ...extra });
  const base = (over: Partial<QueueInput>): QueueInput => ({
    now: 1000, cards: [], lines: { w: L }, newMoves: [], newTraps: [], limits: { newMoves: 10, newTraps: 5, maxReviews: 150 },
    done: { newMoves: 0, newTraps: 0, reviews: 0 }, retrievability: () => 0.5, ...over
  });

  it('groups due cards on one path into one line, ending at the deepest', () => {
    const deep = specs.findIndex((s) => sans(pathTo(L, s.epd).concat(s.move)).join(' ') === 'e4 e5 Nf3 Nc6 Bc4');
    const mid = specs.findIndex((s) => sans(pathTo(L, s.epd).concat(s.move)).join(' ') === 'e4 e5 Nf3');
    const other = specs.findIndex((s) => sans(pathTo(L, s.epd).concat(s.move)).join(' ') === 'e4 c5 Nf3');
    const items = groupLines([asCard(deep), asCard(mid), asCard(other)], { w: L });
    expect(items.length).toBe(2);
    const first = items[0] as Extract<(typeof items)[0], { kind: 'line' }>;
    expect(sans(first.path).join(' ')).toBe('e4 e5 Nf3 Nc6 Bc4');
    expect(first.due.length).toBe(2);
  });

  it('takes the move order through the most due cards, then the most nearly due ones', () => {
    const t = treeFrom([[500, 'Nf3 Nf6 g3 g6'], [400, 'g3 Nf6 Nf3 g6']]);
    const B = generate(makeCtx(t, [], []), none, { side: 'b', depth: 3, replyPct: 0.03 });
    const at = (ms: string[]) => [...B.cards.values()].find((x) => x.epd === epdAfter(ms))!;
    const deep = at(['g1f3', 'g8f6', 'g2g3']), viaNf3 = at(['g1f3']), viaG3 = at(['g2g3']);
    const as = (s: typeof deep) => card({ id: s.id, side: 'b', epd: s.epd, move: s.move });
    const line = (items: ReturnType<typeof groupLines>) => items[0] as Extract<(typeof items)[0], { kind: 'line' }>;
    // alone, the most probable order
    expect(sans(line(groupLines([as(deep)], { b: B })).path).join(' ')).toBe('Nf3 Nf6 g3 g6');
    // with the other order's first move due, one line takes both
    const both = groupLines([as(deep), as(viaG3)], { b: B });
    expect(both.length).toBe(1);
    expect(sans(line(both).path).join(' ')).toBe('g3 Nf6 Nf3 g6');
    expect(line(both).due.length).toBe(2);
    // nothing else due: a nearly due move decides
    expect(sans(line(groupLines([as(deep)], { b: B }, [as(viaG3)])).path).join(' ')).toBe('g3 Nf6 Nf3 g6');
    expect(sans(line(groupLines([as(deep)], { b: B }, [as(viaNf3)])).path).join(' ')).toBe('Nf3 Nf6 g3 g6');
  });

  it('asks your other move at a branch right after its twin, once, and only when you know it', () => {
    const at = epdAfter(['e2e4', 'e7e5', 'g1f3', 'b8c6']);
    const two: Mine = (_s, e) => (e === at ? ['f1c4', 'f1b5'] : undefined);
    const T = generate(ctx, two, { side: 'w', depth: 3, replyPct: 0.03 });
    const c4 = moveId('w', at, 'f1c4'), b5 = moveId('w', at, 'f1b5');
    const due = card({ id: c4, epd: at, move: 'f1c4' });
    const lines = groupLines([due], { w: T });
    const out = withTwins(lines, { w: T }, new Set([c4, b5]));
    expect(out.length).toBe(2);
    const twin = out[1] as Extract<(typeof out)[0], { kind: 'line' }>;
    expect(sans(twin.path).join(' ')).toBe('e4 e5 Nf3 Nc6 Bb5');
    expect(twin).toMatchObject({ due: [], target: b5 });
    // not learned yet, or due anyway in its own line: nothing extra
    expect(withTwins(lines, { w: T }, new Set([c4])).length).toBe(1);
    const both = groupLines([due, card({ id: b5, epd: at, move: 'f1b5' })], { w: T });
    expect(withTwins(both, { w: T }, new Set([c4, b5])).length).toBe(both.length);
  });

  it('orders lines, traps, then new moves and new traps; puzzles and mistakes are never scheduled', () => {
    const items = buildQueue(base({
      cards: [
        card({ id: 'k1', type: 'mistake' }), asCard(0), card({ id: 'p1', type: 'punish' }), card({ id: 'z1', type: 'puzzle' }),
        card({ id: 'k2', type: 'mistake', fsrs: createEmptyCard(new Date(0)), created: 5 })
      ],
      newMoves: [specs[1]], newTraps: [{ id: 'p', type: 'punish', score: 9 }, { id: 'd', type: 'danger', score: 1 }]
    }));
    expect(items.map((i) => i.kind === 'card' ? i.card.id : i.kind === 'newtrap' ? i.spec.id : i.kind)).toEqual(['line', 'p1', 'new', 'p', 'd']);
  });

  it('respects every limit', () => {
    const many = specs.map((s) => s);
    const items = buildQueue(base({
      newMoves: many, newTraps: Array.from({ length: 9 }, (_, i) => ({ id: 't' + i, type: 'punish' as const, score: i })),
      limits: { newMoves: 2, newTraps: 3, maxReviews: 150 }, done: { newMoves: 1, newTraps: 0, reviews: 0 }
    }));
    expect(items.filter((i) => i.kind === 'new').length).toBe(1);
    expect(items.filter((i) => i.kind === 'newtrap').length).toBe(3);
  });

  it('caps reviews at the limit, lowest retrievability first', () => {
    const cards = Array.from({ length: 5 }, (_, i) => card({ id: 'p' + i, type: 'punish', lapses: i }));
    const items = buildQueue(base({ cards, limits: { newMoves: 0, newTraps: 0, maxReviews: 20 }, done: { newMoves: 0, newTraps: 0, reviews: 18 }, retrievability: (c) => -c.lapses }));
    expect(items.map((i) => (i.kind === 'card' ? i.card.id : ''))).toEqual(['p4', 'p3']);
  });

  it('ignores suspended and not-yet-due cards', () => {
    const items = buildQueue(base({ cards: [card({ id: 'a', type: 'punish', suspended: 1 }), card({ id: 'b', type: 'punish', due: 5000 })] }));
    expect(items.length).toBe(0);
  });

  it('new moves come highest probability first', () => {
    const items = buildQueue(base({ newMoves: [...specs].reverse(), limits: { newMoves: 2, newTraps: 0, maxReviews: 150 } }));
    const probs = items.map((i) => (i.kind === 'new' ? i.spec.prob : 0));
    expect(probs[0]).toBe(1);
    expect(probs[0]).toBeGreaterThanOrEqual(probs[1]);
  });

  it('gives half of the new moves to the focus opening, the rest by probability', () => {
    const order = [...specs].sort((a, b) => b.prob - a.prob || a.ply - b.ply);
    const focus = order.slice(-3);
    const items = buildQueue(base({ newMoves: specs, focus, limits: { newMoves: 4, newTraps: 0, maxReviews: 150 } }));
    const ids = items.map((i) => (i.kind === 'new' ? i.spec.id : ''));
    expect(ids.length).toBe(4);
    expect(ids).toContain(focus[0].id);
    expect(ids).toContain(focus[1].id);
    expect(ids).not.toContain(focus[2].id);
    expect(ids).toContain(order[0].id);
    expect(ids).toContain(order[1].id);
    // a focus opening with nothing left to learn leaves every place to probability
    const rest = order.slice(0, -3);
    const none = buildQueue(base({ newMoves: rest, focus, limits: { newMoves: 4, newTraps: 0, maxReviews: 150 } }));
    expect(none.map((i) => (i.kind === 'new' ? i.spec.id : ''))).toEqual(rest.slice(0, 4).map((s) => s.id));
  });

  it('rolls the day over at the set hour', () => {
    const at = new Date(2026, 10, 14, 3, 30).getTime();
    expect(dayStart(at, 4)).toBe(new Date(2026, 10, 13, 4).getTime());
    expect(dayStart(new Date(2026, 10, 14, 4, 0).getTime(), 4)).toBe(new Date(2026, 10, 14, 4).getTime());
  });
});

describe('grading', () => {
  const t = (s: number) => [s * 1000];
  it('follows the grading table', () => {
    expect(rate({ wrong: true, hinted: false, playable: false, times: t(1) }, 10)).toBe(Rating.Again);
    expect(rate({ wrong: false, hinted: false, playable: false, times: t(11) }, 10)).toBe(Rating.Hard);
    expect(rate({ wrong: false, hinted: false, playable: false, times: t(4) }, 10)).toBe(Rating.Good);
  });
  it('a hint or a playable retry caps at Hard', () => {
    expect(rate({ wrong: false, hinted: true, playable: false, times: t(1) }, 10)).toBe(Rating.Hard);
    expect(rate({ wrong: false, hinted: false, playable: true, times: t(1) }, 10)).toBe(Rating.Hard);
  });
  it('multi-move cards use the average time per move', () => {
    expect(rate({ wrong: false, hinted: false, playable: false, times: [2000, 17000] }, 10)).toBe(Rating.Good);
    expect(rate({ wrong: false, hinted: false, playable: false, times: [12000, 17000] }, 10)).toBe(Rating.Hard);
  });
  it('never gives Easy', () => {
    expect(rate({ wrong: false, hinted: false, playable: false, times: [1] }, 10)).not.toBe(Rating.Easy);
  });
  it('FSRS learning steps are 1 and 10 minutes, then days', () => {
    const now = new Date(2026, 0, 1);
    const a = grade(createEmptyCard(now), Rating.Again, now);
    expect(+a.due - +now).toBe(60_000);
    expect(stageOf(a)).toBe('learning');
    const b = grade(a, Rating.Good, new Date(+now + 60_000));
    expect(+b.due - (+now + 60_000)).toBe(600_000);
    const c = grade(b, Rating.Good, new Date(+now + 700_000));
    expect(c.state).toBe(State.Review);
  });
});
