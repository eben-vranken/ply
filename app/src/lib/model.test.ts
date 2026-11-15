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

  it('a second move creates a branch; changing a move retires the cards below the old one', async () => {
    const e = chess.epdAfter(['e2e4', 'e7e5', 'g1f3', 'b8c6']);
    await m.setMoves('w', e, ['f1c4', 'f1b5']);
    expect(m.lines().w!.branches.has(e)).toBe(true);
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
    expect(JSON.stringify(again.tables.cards)).toBe(JSON.stringify(b.tables.cards));
  });
});
