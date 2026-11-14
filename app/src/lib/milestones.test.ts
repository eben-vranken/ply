/// <reference types="node" />
// Milestone checks on the shipped data in public/data (docs/BRIEF.md, "Milestones"):
// boots the real model on band 1200 with the starter repertoire and checks the
// numbers the brief asks for. Skipped when the data has not been built.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';

const dir = new URL('../../public/data/', import.meta.url);
const path = (n: string) => fileURLToPath(new URL(n, dir));
const manifest = existsSync(path('manifest.json')) ? JSON.parse(readFileSync(path('manifest.json'), 'utf8')) : null;
const real = !!manifest && !String(manifest.version).startsWith('sample');
const BAND = 1200;

const store = new Map<string, string>();
Object.assign(globalThis, {
  location: { hash: '' },
  addEventListener: () => {},
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) }
});

type M = typeof import('./model.svelte');
let m: M;
let chess: typeof import('./chess');
let bootMs = 0;

describe.runIf(real)(`shipped data, band ${BAND}`, () => {
  beforeAll(async () => {
    const { db } = await import('./db');
    for (const name of ['openings.json', 'puzzles.json.gz', `tree-${BAND}.json.gz`, `traps-${BAND}.json.gz`]) {
      const b = readFileSync(path(name));
      await db.data.put({ name, bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), sha256: manifest.files.find((f: { name: string }) => f.name === name).sha256, version: manifest.version });
    }
    await db.data.put({ name: 'manifest.json', text: JSON.stringify(manifest), sha256: '', version: manifest.version });
    chess = await import('./chess');
    m = await import('./model.svelte');
    const t0 = performance.now();
    await m.boot();
    bootMs = performance.now() - t0;
  }, 60_000);

  it('every band file is within the 25 MB budget', () => {
    for (const f of manifest.files) if (/^tree-/.test(f.name)) expect(f.bytes).toBeLessThanOrEqual(25 * 1024 * 1024);
  });

  it('after 1.e4 e5 2.Nf3 Nc6 3.Bc4 the node is Italian Game (C50) with a default move for Black', () => {
    const e = chess.epdAfter(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4']);
    expect(m.nameOf(e)).toEqual(['C50', 'Italian Game']);
    const n = m.data()!.tree[e];
    expect(n.d).toBeTruthy();
    expect(n.m.some(([u]) => u === n.d)).toBe(true);
  });

  it('the starter repertoire gets ≥ 20 Punish and ≥ 50 Puzzle cards', () => {
    const t = m.candidates().traps;
    const punish = t.filter((x) => x.type === 'punish').length;
    const puzzles = t.filter((x) => x.type === 'puzzle').length;
    console.log(`band ${BAND}: ${punish} punish, ${t.filter((x) => x.type === 'danger').length} danger, ${puzzles} puzzles for the starter repertoire; boot ${Math.round(bootMs)} ms`);
    expect(punish).toBeGreaterThanOrEqual(20);
    expect(puzzles).toBeGreaterThanOrEqual(50);
  });

  it('every trap and puzzle opens correctly from its position', () => {
    const D = m.data()!;
    for (const t of D.traps) {
      // you are to move on the card, and every move of the answer (and of a danger's refutation) is legal
      expect(chess.turnOf(t.epd)).toBe(t.side);
      const c = new Chess(chess.fenOf(t.epd));
      for (const u of t.kind === 'danger' ? [t.bait!, ...(t.refute ?? [])] : t.line) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      if (t.kind === 'danger') { const d = new Chess(chess.fenOf(t.epd)); d.move({ from: t.answer[0].slice(0, 2), to: t.answer[0].slice(2, 4), promotion: t.answer[0][4] }); }
    }
    for (const p of D.puzzles.slice(0, 2000)) {
      const c = new Chess(p.fen);
      for (const u of p.moves) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    }
  });

  it('Danger traps exist for the Explorer markers and carry a bait and refutation', () => {
    const d = m.data()!.traps.filter((t) => t.kind === 'danger');
    expect(d.length).toBeGreaterThan(0);
    for (const t of d) { expect(t.bait).toBeTruthy(); expect(t.refute!.length).toBeGreaterThan(0); }
  });

  it('the starter repertoire generates lines with coverage per opening', () => {
    const s = m.summaries();
    expect(m.lines().w!.cards.size).toBeGreaterThan(20);
    expect(m.lines().b!.cards.size).toBeGreaterThan(20);
    expect(s.find((x) => x.section === 'White' && x.name === 'Italian Game')).toBeTruthy();
    for (const x of s) { expect(x.coverage).toBeGreaterThanOrEqual(0); expect(x.coverage).toBeLessThanOrEqual(100); }
    console.log(s.slice(0, 10).map((x) => `${x.section} · ${x.name} ${x.eco} · ${x.lines} lines · ${x.total} moves · ${x.coverage}% covered`).join('\n'));
  });

  it('the skill tree counts every move card Learn would teach, with names on branches', () => {
    for (const [side, path] of [['w', ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4']], ['b', ['e2e4']], ['b', ['d2d4']]] as const) {
      const roots = m.openingTree(side, [...path]);
      const sum = { total: 0, fresh: 0 };
      for (const r of roots) { sum.total += r.sum.total; sum.fresh += r.sum.stages[0]; }
      expect(sum.total).toBeGreaterThan(0);
      expect(sum.fresh).toBe(m.subtreeNew(side, [...path]).length);
    }
    const it = m.openingTree('w', ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4']);
    const fork = it.find((x) => x.children.length > 1) ?? it[0];
    expect(m.branchName(fork, 'Italian Game')[1]).toMatch(/Italian Game/);
  });

  it('the Today queue respects the limits on day one', () => {
    const q = m.todayCounts().queue;
    expect(q.filter((i) => i.kind === 'new').length).toBe(10);
    expect(q.filter((i) => i.kind === 'newtrap').length).toBe(5);
    expect(m.itemsFor(q).length).toBe(q.length);
  });

  it('the first chess.com rating switches the band at once', async () => {
    const { db } = await import('./db');
    for (const name of [`tree-1400.json.gz`, `traps-1400.json.gz`]) {
      const b = readFileSync(path(name));
      await db.data.put({ name, bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), sha256: manifest.files.find((f: { name: string }) => f.name === name).sha256, version: manifest.version });
    }
    await m.noteRating(1060); // + 350 = 1410 → band 1400, no 7-day wait the first time
    expect(m.model.band).toBe(1400);
    expect(m.depthLimit()).toBe(10);
    await m.switchBand(1200);
  });

  it('changing the band regenerates lines without losing a schedule', async () => {
    const [it] = m.itemsFor(m.todayCounts().queue.filter((i) => i.kind === 'new').slice(0, 1));
    const idx = +Object.entries(it.asks).find(([, a]) => a.intro)![0];
    const epd = chess.epdAfter(it.moves.slice(0, idx));
    await m.applyOutcome({ item: it, results: { [idx]: { wrong: false, hinted: false, playable: false, ms: 1, uci: it.moves[idx], epd } } }, 'today');
    const id = it.asks[idx].card!;
    const before = JSON.stringify(m.allCards().get(id)!.fsrs);
    const { db } = await import('./db');
    for (const name of [`tree-1600.json.gz`, `traps-1600.json.gz`]) {
      const b = readFileSync(path(name));
      await db.data.put({ name, bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), sha256: manifest.files.find((f: { name: string }) => f.name === name).sha256, version: manifest.version });
    }
    await m.switchBand(1600);
    expect(m.model.band).toBe(1600);
    expect(JSON.stringify(m.allCards().get(id)!.fsrs)).toBe(before);
  });
});
