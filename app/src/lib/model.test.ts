/// <reference types="node" />
// The model end to end on a small real data sample (src/lib/__fixtures__, made by
// `ply-data build` on a slice of the Lichess files) with an in-memory IndexedDB.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const store = new Map<string, string>();
Object.assign(globalThis, {
  location: { hash: '' },
  addEventListener: () => {},
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) }
});

const fx = (n: string) => readFileSync(fileURLToPath(new URL(`./__fixtures__/${n}`, import.meta.url)));
type M = typeof import('./model.svelte');
let m: M;
let dbm: typeof import('./db');
let chess: typeof import('./chess');

beforeAll(async () => {
  dbm = await import('./db');
  chess = await import('./chess');
  const manifest = fx('manifest.json').toString();
  const version = JSON.parse(manifest).version;
  for (const name of ['openings.json', 'puzzles.json.gz', 'tree-1200.json.gz', 'traps-1200.json.gz']) {
    const b = fx(name);
    await dbm.db.data.put({ name, bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), sha256: JSON.parse(manifest).files.find((f: { name: string }) => f.name === name).sha256, version });
  }
  await dbm.db.data.put({ name: 'manifest.json', text: manifest, sha256: '', version });
  // an install from before backup format 2 kept Arcade's memory in localStorage
  store.set('ply-arcade-v1', JSON.stringify({ miss: { 'z:legacy': 1 }, recent: ['z:legacy'] }));
  m = await import('./model.svelte');
  await m.boot();
});

describe('model on real data', () => {
  it('boots offline from stored data and names positions', () => {
    expect(m.model.status).toBe('ready');
    expect(m.model.band).toBe(1200);
    const it = chess.epdAfter(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4']);
    expect(m.nameOf(it)).toEqual(['C50', 'Italian Game']);
  });

  it('writes the starter repertoire: 1.e4 Italian, 1...e5, 1...d5 QGD, d5/e5 elsewhere', () => {
    expect(m.movesAt('w', chess.START_EPD)).toEqual(['e2e4']);
    expect(m.movesAt('w', chess.epdAfter(['e2e4', 'e7e5', 'g1f3', 'b8c6']))).toEqual(['f1c4']);
    expect(m.movesAt('b', chess.epdAfter(['e2e4']))).toEqual(['e7e5']);
    expect(m.movesAt('b', chess.epdAfter(['d2d4']))).toEqual(['d7d5']);
    expect(m.movesAt('b', chess.epdAfter(['d2d4', 'd7d5', 'c2c4']))).toEqual(['e7e6']);
    const vsC4 = m.movesAt('b', chess.epdAfter(['c2c4']));
    expect(['d7d5', 'e7e5']).toContain(vsC4[0]);
  });

  it('builds a Today queue within the limits', () => {
    const c = m.todayCounts();
    expect(c.queue.filter((i) => i.kind === 'new').length).toBe(10);
    expect(c.due).toBe(0);
    expect(m.itemsFor(c.queue).length).toBe(c.queue.length);
  });

  it('a new move enters learning step 1, Undo grade removes it', async () => {
    const [it] = m.itemsFor(m.todayCounts().queue.filter((i) => i.kind === 'new').slice(0, 1));
    const k = Object.entries(it.asks).find(([, a]) => a.intro)!;
    const idx = +k[0];
    const epd = chess.epdAfter(it.moves.slice(0, idx));
    const res = await m.applyOutcome({ item: it, results: { [idx]: { wrong: false, hinted: false, playable: false, ms: 2000, uci: it.moves[idx], epd } } }, 'today');
    const card = m.allCards().get(k[1].card!)!;
    expect(card.fsrs.state).toBe(1); // Learning
    expect(card.due - Date.now()).toBeLessThan(61_000);
    expect(m.doneToday().newMoves).toBe(1);
    await res.undo();
    expect(m.allCards().has(k[1].card!)).toBe(false);
    expect(m.doneToday().newMoves).toBe(0);
  });

  it('wrong on a review card gives Again; a slow correct one gives Hard', async () => {
    const [it] = m.itemsFor(m.todayCounts().queue.filter((i) => i.kind === 'new').slice(0, 1));
    const idx = +Object.entries(it.asks).find(([, a]) => a.intro)![0];
    const epd = chess.epdAfter(it.moves.slice(0, idx));
    await m.applyOutcome({ item: it, results: { [idx]: { wrong: false, hinted: false, playable: false, ms: 1, uci: it.moves[idx], epd } } }, 'today');
    const id = it.asks[idx].card!;
    // make it due and review it in a line
    const c = m.allCards().get(id)!;
    c.due = Date.now() - 1; c.fsrs = { ...c.fsrs, due: new Date(Date.now() - 1) };
    const q = m.todayCounts().queue.find((x) => x.kind === 'line')!;
    expect(q && q.kind === 'line' && q.due.includes(id)).toBe(true);
    const [line] = m.itemsFor([q]);
    const at = +Object.entries(line.asks).find(([, a]) => a.card === id)![0];
    const r1 = await m.applyOutcome({ item: line, results: { [at]: { wrong: false, hinted: false, playable: false, ms: 15_000, uci: line.moves[at], epd } } }, 'today');
    expect(r1.rating).toBe(2); // Hard
    await r1.undo();
    const r2 = await m.applyOutcome({ item: line, results: { [at]: { wrong: true, hinted: false, playable: false, ms: 1000, uci: line.moves[at], epd } } }, 'today');
    expect(r2.rating).toBe(1); // Again
  });

  it('a move that is not due is credited on the way along a line, once a day; hard cards only on a miss', async () => {
    const { moveId } = await import('./srs/lines');
    const eA = chess.epdAfter(['e2e4']), eB = chess.epdAfter(['e2e4', 'e7e5', 'g1f3']);
    const uB = m.movesAt('b', eB)[0];
    const now = Date.now(), DAY = 864e5;
    const row = (epd: string, move: string, dueIn: number) => ({
      id: moveId('b', epd, move), type: 'move' as const, side: 'b' as const, epd, move, answer: [], line: [], label: '', path: [],
      fsrs: { due: new Date(now + dueIn), stability: 20, difficulty: 5, elapsed_days: 0, scheduled_days: 20, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: new Date(now - 10 * DAY) },
      due: now + dueIn, suspended: 0 as const, created: now - 30 * DAY, lapses: 0
    });
    const a = row(eA, 'e7e5', 10 * DAY), b = row(eB, uB, -1000);
    expect(m.allCards().has(a.id) || m.allCards().has(b.id)).toBe(false);
    await m.addCards([a, b]);
    const play = async (wrongAt?: string) => {
      const q = m.todayCounts().queue.find((x) => x.kind === 'line' && x.due.includes(b.id))!;
      expect(q).toBeTruthy();
      const [line] = m.itemsFor([q]);
      const results: Record<number, { wrong: boolean; hinted: boolean; playable: boolean; ms: number; uci: string; epd: string }> = {};
      let e = chess.START_EPD;
      line.moves.forEach((u, i) => { if (line.asks[i]) results[i] = { wrong: line.asks[i].card === wrongAt, hinted: false, playable: false, ms: 1000, uci: u, epd: e }; e = chess.child(e, u); });
      return m.applyOutcome({ item: line, results }, 'today');
    };
    const rowsOf = async (id: string) => (await dbm.db.reviews.toArray()).filter((r) => r.cardId === id);
    const before = m.doneToday().reviews;
    const r1 = await play();
    const got = await rowsOf(a.id);
    expect(got.map((r) => [r.rating, r.implicit])).toEqual([[3, 1]]);
    expect(m.allCards().get(a.id)!.due).toBeGreaterThan(now + 10 * DAY);
    expect(m.doneToday().reviews).toBe(before + 1); // only the due card uses up the limit
    // the same line again today: the move on the way is not credited twice
    const cb = m.allCards().get(b.id)!; cb.due = now - 1000; cb.fsrs = { ...cb.fsrs, due: new Date(now - 1000) };
    const r2 = await play();
    expect((await rowsOf(a.id)).length).toBe(1);
    await r2.undo(); await r1.undo();
    expect((await rowsOf(a.id)).length).toBe(0);
    // a hard card gets nothing from a correct answer, but a miss still gives Again
    const ca = m.allCards().get(a.id)!; ca.fsrs = { ...ca.fsrs, difficulty: 9 };
    const r3 = await play();
    expect((await rowsOf(a.id)).length).toBe(0);
    await r3.undo();
    await play(a.id);
    expect((await rowsOf(a.id)).map((r) => [r.rating, r.implicit])).toEqual([[1, 1]]);
  });

  it('a line carries the colour of its branch in the skill tree', () => {
    const root = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'];
    const next = (ms: import('./model.svelte').TreeMove[]) => ms.flatMap((r) => (r.mine ? [r] : r.children.filter((c) => c.mine)));
    const top = next(m.openingTree('w', root));
    expect(top.length).toBeGreaterThan(1);
    top.slice(0, 3).forEach((n, i) => {
      const [it] = m.learnItemsFor([{ side: 'w', epd: n.epd, uci: n.uci }]);
      expect(it.tint).toEqual({ from: n.path.length, colour: m.LINE_COLOURS[i] });
    });
  });

  it('a second move creates a branch; changing a move retires the cards below the old one', async () => {
    const e = chess.epdAfter(['e2e4', 'e7e5', 'g1f3', 'b8c6']);
    await m.setMoves('w', e, ['f1c4', 'f1b5']);
    expect(m.lines().w!.branches.has(e)).toBe(true);
    // each of the two moves is asked with its own cue, and knows the other one
    const cueOf = (uci: string) => { const [it] = m.learnItemsFor([{ side: 'w', epd: e, uci }]); return Object.values(it.asks).find((a) => a.intro)!; };
    const c4 = cueOf('f1c4'), b5 = cueOf('f1b5');
    expect(c4.cue).toBeTruthy();
    expect(b5.cue).toBeTruthy();
    expect(c4.cue).not.toBe(b5.cue);
    expect(c4.other).toEqual(['f1b5']);
    // learn the Bc4 move, then switch the position to Bb5 only
    const spec = [...m.lines().w!.cards.values()].find((s) => s.epd === e && s.move === 'f1c4')!;
    const [intro] = m.learnItemsFor([{ side: 'w', epd: e, uci: 'f1c4' }]);
    const idx = +Object.entries(intro.asks).find(([, a]) => a.intro)![0];
    await m.applyOutcome({ item: intro, results: { [idx]: { wrong: false, hinted: false, playable: false, ms: 1, uci: 'f1c4', epd: e } } }, 'learn');
    expect(m.allCards().get(spec.id)!.suspended).toBe(0);
    await m.setMoves('w', e, ['f1b5']);
    expect(m.allCards().get(spec.id)!.suspended).toBe(1);
    await m.resetSection('White');
    expect(m.movesAt('w', e)).toEqual(['f1c4']);
  });

  it('a review line from its landmark: the trunk plays fast, the reply that sets it apart is named', async () => {
    const { moveId, pathTo } = await import('./srs/lines');
    const { app } = await import('./state.svelte');
    const W = m.lines().w!, D = m.data()!;
    const topOf = (e: string) => D.tree[e]?.m.reduce((b, r) => (r[1] > b[1] ? r : b))[0];
    // a White line at least four of your moves long whose last reply is not the main one
    const spec = [...W.cards.values()].find((s) => {
      if (s.ply < 6 || W.branches.has(s.epd)) return false;
      const p = pathTo(W, s.epd);
      const before = chess.epdAfter(p.slice(0, -1));
      return !!topOf(before) && topOf(before) !== p[p.length - 1] && !m.allCards().has(s.id);
    })!;
    expect(spec).toBeTruthy();
    const path = [...pathTo(W, spec.epd), spec.move];
    const now = Date.now(), DAY = 864e5;
    const rows: Parameters<typeof m.addCards>[0] = [];
    let e = chess.START_EPD;
    path.forEach((u, i) => {
      if (i % 2 === 0) {
        const id = moveId('w', e, u), last = i === path.length - 1;
        if (!m.allCards().has(id)) rows.push({ id, type: 'move', side: 'w', epd: e, move: u, answer: [], line: [], label: '', path: [],
          fsrs: { due: new Date(last ? now - 1000 : now + 60 * DAY), stability: last ? 20 : 400, difficulty: 4, elapsed_days: 0, scheduled_days: 20, learning_steps: 0, reps: 5, lapses: 0, state: 2, last_review: new Date(now - DAY) } as never,
          due: last ? now - 1000 : now + 60 * DAY, suspended: 0, created: now - 90 * DAY, lapses: 0 });
      }
      e = chess.child(e, u);
    });
    await m.addCards(rows);
    const id = moveId('w', spec.epd, spec.move);
    const q = m.todayCounts().queue.find((x) => x.kind === 'line' && x.due.includes(id))!;
    app.segments = 'on';
    const [seg] = m.itemsFor([q]);
    app.segments = 'off';
    const [plain] = m.itemsFor([q]);
    app.segments = 'auto';
    expect(plain.scrub).toBeUndefined();
    expect(plain.seg).toBe(0);
    expect(seg.seg).toBe(1);
    expect(seg.why).toBe('1 move due on this line');
    expect(seg.callout!.text).toMatch(/at your level/);
    expect(seg.callout!.at).toBe(path.length - 2);
    // a whole-line day plays from move 1; otherwise nothing before the landmark is asked
    const mine = new Set(rows.map((r) => r.id));
    if (seg.scrub) for (const [k, a] of Object.entries(seg.asks)) if (+k < seg.scrub) expect(mine.has(a.card!)).toBe(false);
    expect(Object.keys(seg.asks).length).toBeLessThanOrEqual(Object.keys(plain.asks).length);
    // the review is logged with its arm
    const at = path.length - 1;
    await m.applyOutcome({ item: seg, results: { [at]: { wrong: false, hinted: false, playable: false, ms: 900, uci: spec.move, epd: spec.epd } } }, 'today');
    const logged = (await dbm.db.reviews.toArray()).filter((r) => r.cardId === id);
    expect(logged.map((r) => r.seg)).toEqual([1]);
  });

  it('the first chess.com rating sets the band and depth at once', async () => {
    const { app } = await import('./state.svelte');
    expect(app.bandSet).toBe(false);
    await m.noteRating(850); // + 350 = 1200: the band it is already on
    expect(m.currentBand()).toBe(1200);
    expect(app.pendingBand).toBe(0);
    await m.noteRating(1700); // a later change waits for 7 days
    expect(m.currentBand()).toBe(1200);
    expect(app.pendingBand).toBe(2000);
    expect(m.depthLimit()).toBe(14);
  });

  it("moves Arcade's memory from localStorage into IndexedDB, and a miss is stored there", async () => {
    expect(m.arcadeMemory().miss['z:legacy']).toBe(1);
    expect(store.has('ply-arcade-v1')).toBe(false);
    expect(((await dbm.db.settings.get('arcade'))?.value as { miss: Record<string, number> }).miss['z:legacy']).toBe(1);
    const a = m.arcade();
    const it = a.next().find((i) => !i.arcade!.back)!;
    a.result(it, false);
    await new Promise((r) => setTimeout(r, 30));
    const row = (await dbm.db.settings.get('arcade'))?.value as { miss: Record<string, number> };
    expect(row.miss[it.arcade!.key]).toBeGreaterThanOrEqual(1);
  });

  it('Arcade serves only Lichess puzzles, and Today schedules none', () => {
    const a = m.arcade();
    const items = [...a.next(), ...a.next(), ...a.next(), ...a.next()];
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) { expect(i.kind).toBe('puzzle'); expect(i.arcade!.key.startsWith('z:')).toBe(true); expect(i.card).toBeUndefined(); }
    expect(m.candidates().traps.every((t) => t.type === 'punish' || t.type === 'danger')).toBe(true);
  });

  it('imports a PGN repertoire, following it past the end of the tree', async () => {
    const { readPgn } = await import('./pgn');
    const { plan, rows } = await import('./import/repertoire');
    const { moveId } = await import('./srs/lines');
    const pgn = '[Orientation "white"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 h5 { A rare one. } 5. d4 h4 6. d5 *';
    const D = m.data()!;
    const P = (s: string) => s.split(' ');
    const h5 = chess.epdAfter(P('e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 h7h5'));
    const h4 = chess.epdAfter(P('e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 h7h5 d2d4 h5h4'));
    expect(D.tree[h4]).toBeUndefined(); // past the band's tree
    const p = plan({ games: readPgn(pgn), side: null, current: m.currentAt, note: m.noteAt, inTree: (e) => !!D.tree[e], depth: m.depthLimit() });
    expect(p.outside).toBeGreaterThan(0);
    const r = await m.importRepertoire(rows(p, { choices: {}, branches: false, current: m.currentAt, note: m.noteAt }));
    expect(r.replies).toBeGreaterThan(0);
    const L = m.lines().w!;
    expect(L.cards.has(moveId('w', h5, 'd2d4'))).toBe(true);
    expect(L.cards.has(moveId('w', h4, 'd4d5'))).toBe(true);
    expect(m.noteAt('w', h5)).toBe('A rare one.');
    expect(m.bookAt('w', chess.epdAfter(P('e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3')))).toContain('h7h5');
    expect((await dbm.db.book.toArray()).length).toBeGreaterThan(0);
    // the off-tree positions are part of the Italian, not a stray group
    expect(m.summaries().some((o) => o.name === 'First moves' && o.side === 'w' && o.total > 1)).toBe(false);
  });

  it('exports the repertoire as PGN that imports back to the same moves and notes', async () => {
    const { exportRepertoire, exportOpening } = await import('./export');
    const { readPgn } = await import('./pgn');
    const { plan } = await import('./import/repertoire');
    const text = exportRepertoire('w');
    expect(text).toContain('[Orientation "white"]');
    const games = readPgn(text);
    expect(games.length).toBe(1);
    expect(games[0].error).toBeUndefined();
    const p = plan({ games, side: null, current: () => ({ moves: [], own: false }), note: () => undefined, inTree: () => true, depth: 99 });
    // every move of yours in the lines is in the file, with your note
    const L = m.lines().w!;
    for (const s of L.cards.values()) expect(p.picks.get('w|' + s.epd)?.moves).toContain(s.move);
    const h5 = chess.epdAfter('e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 h7h5'.split(' '));
    expect(p.picks.get('w|' + h5)?.note).toBe('A rare one.');
    // one opening starts with the moves that lead to it
    const it = exportOpening('w', ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4']);
    expect(it).toContain('[Opening "Italian Game"]');
    expect(it.replace(/\s+/g, ' ')).toMatch(/1\. e4 e5 2\. Nf3 Nc6 3\. Bc4/);
  });

  it('syncs Lichess games through the same pipeline as chess.com', async () => {
    const { app } = await import('./state.svelte');
    const { syncNow, sync } = await import('./import/sync.svelte');
    const now = Date.now();
    const game = (id: string, moves: string, at: number) => ({ id, rated: true, variant: 'standard', speed: 'rapid', createdAt: at, lastMoveAt: at, status: 'resign', winner: 'white',
      players: { white: { user: { name: 'Me', id: 'me' }, rating: 1500 }, black: { user: { name: 'Them', id: 'them' }, rating: 1500 } }, pgn: `[White "Me"]
[Black "Them"]

${moves} 1-0` });
    const asked: string[] = [];
    const fetchStub = async (u: string) => {
      asked.push(u);
      if (u.includes('/api/user/')) return new Response(JSON.stringify({ perfs: { rapid: { rating: 1550, games: 40 } } }));
      // 1.e4 a6 is not in your lines: an uncovered reply
      return new Response([game('g1', '1. e4 a6 2. d4', now - 864e5), game('g2', '1. e4 e5 2. Nf3', now - 2 * 864e5)].map((x) => JSON.stringify(x)).join('\n'));
    };
    const real = globalThis.fetch;
    globalThis.fetch = fetchStub as typeof fetch;
    try {
      app.username = ''; app.lichessUser = 'Me';
      await syncNow();
    } finally { globalThis.fetch = real; }
    expect(asked[0]).toContain('/api/user/Me');
    expect(asked[1]).toContain('/api/games/user/Me?');
    expect(asked[1]).toContain('rated=true');
    expect(sync.summary!.imported).toBe(2);
    const g1 = await dbm.db.games.get('https://lichess.org/g1');
    expect(g1?.colour).toBe('w');
    expect(g1?.uncovered).toEqual(['e2e4', 'a7a6']);
    expect(app.lichessSince).toBe(now - 864e5);
    // the next sync asks only for newer games
    globalThis.fetch = fetchStub as typeof fetch;
    try { asked.length = 0; await syncNow(); } finally { globalThis.fetch = real; }
    expect(asked.find((u) => u.includes('/games/'))).toContain(`since=${now - 864e5 + 1}`);
    app.lichessUser = '';
  });

  it('catching up spreads a backlog without hiding it', async () => {
    // 50 learned cards, all overdue
    const specs = [...m.lines().w!.cards.values(), ...m.lines().b!.cards.values()].filter((s) => !m.allCards().has(s.id)).slice(0, 50);
    const { createEmptyCard } = await import('ts-fsrs');
    const past = Date.now() - 5 * 864e5;
    await m.addCards(specs.map((s) => ({ id: s.id, type: 'move' as const, side: s.side, epd: s.epd, move: s.move, answer: [], line: [], label: '', fsrs: { ...createEmptyCard(new Date(past)), state: 2, scheduled_days: 3, stability: 3, reps: 2, due: new Date(past), last_review: new Date(past - 3 * 864e5) }, due: past, suspended: 0 as const, created: past, lapses: 0 })));
    const before = m.todayCounts();
    expect(before.dueAll).toBeGreaterThanOrEqual(50);
    m.startCatchUp(before.dueAll, 4);
    const c = m.todayCounts();
    expect(m.catchUpDay()).toBe(0);
    expect(c.dueAll).toBe(before.dueAll); // the real number stays
    expect(c.due).toBeLessThanOrEqual(Math.ceil(before.dueAll / 4));
    expect(c.queue.some((i) => i.kind === 'new' || i.kind === 'newtrap')).toBe(false);
    m.stopCatchUp();
    expect(m.todayCounts().due).toBeGreaterThan(c.due);
  });

  it('backup round-trips every user table', async () => {
    const { makeBackup, parseBackup, restoreBackup } = await import('./backup');
    const b = await makeBackup();
    const n = b.tables.cards.length;
    expect(n).toBeGreaterThan(0);
    expect(b.tables.reviews.length).toBeGreaterThan(0);
    expect(b.schemaVersion).toBe(dbm.BACKUP_VERSION);
    expect(b.tables.settings.some((s) => s.key === 'arcade')).toBe(true);
    await dbm.db.cards.clear();
    await dbm.db.settings.delete('arcade');
    await restoreBackup(parseBackup(JSON.stringify(b)));
    expect(await dbm.db.cards.count()).toBe(n);
    expect(await dbm.db.settings.get('arcade')).toBeTruthy();
    expect(b.tables.book!.length).toBeGreaterThan(0);
    expect(await dbm.db.book.count()).toBe(b.tables.book!.length);
    const again = await makeBackup();
    // restored rows count as changed now (sync); reviews get new local ids
    const bare = (rows: object[], dropId = false) => JSON.stringify(rows.map((r) => { const { updatedAt: _u, ...rest } = r as Record<string, unknown>; if (dropId) delete rest.id; return rest; }));
    expect(bare(again.tables.cards)).toBe(bare(b.tables.cards));
    expect(bare(again.tables.reviews, true)).toBe(bare(b.tables.reviews, true));
  });
});
