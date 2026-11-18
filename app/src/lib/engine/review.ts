// Running a game review: the engine's two best lines in every position of a game, book moves read
// from the band's opening data instead. Results are cached on this device (the `meta` table, which
// is not synced), so a game reviewed once opens at once.
import { db } from '../db';
import { data } from '../model.svelte';
import { child, epdOf } from '../chess';
import { Engine } from './stockfish';
import type { PosEval } from '../review';

const VERSION = 3;
const MS = 600; // per position: about 35 s for a 40-move game (80 positions) on three engines
const key = (id: string) => `review:${id}`;

/** a pasted PGN on its way to the review screen */
export const pending = { pgn: '' };

/** the accuracy of each side, kept for the games list */
export async function saveAccuracy(id: string, w: number | null, b: number | null) {
  await db.meta.put({ key: 'reviewacc:' + id, value: { w, b } });
}
export async function accuracies(): Promise<Map<string, { w: number | null; b: number | null }>> {
  const rows = await db.meta.where('key').startsWith('reviewacc:').toArray();
  return new Map(rows.map((r) => [r.key.slice(10), r.value as { w: number | null; b: number | null }]));
}

export async function cachedReview(id: string, n: number): Promise<(PosEval | undefined)[] | null> {
  const r = (await db.meta.get(key(id)))?.value as { v: number; evals: (PosEval | null)[] } | undefined;
  if (!r || r.v !== VERSION || r.evals.length !== n) return null;
  return r.evals.map((e) => e ?? undefined);
}

/** is `played` a book move here: the position is in the tree, and the move has 50+ games and 2%+ of them */
function isBook(fen: string, played: string | undefined): boolean {
  const tree = data()?.tree;
  const e = epdOf(fen), node = tree?.[e];
  if (!node || !played) return false;
  const m = node.m.find(([u]) => u === played);
  return !!m && m[1] >= 50 && m[1] / Math.max(1, node.g) >= 0.02 && !!tree![child(e, played)];
}

export interface ReviewRun { cancel: () => void; done: Promise<void> }

/**
 * Analyse `fens` (every position of the game, the final one included), calling `onpos` as each
 * one is done. Up to three engines work in parallel.
 */
export function runReview(id: string, fens: string[], moves: string[], onpos: (i: number, e: PosEval) => void): ReviewRun {
  const evals: (PosEval | null)[] = new Array(fens.length).fill(null);
  let stop = false;
  const engines: Engine[] = [];
  const done = (async () => {
    // every position gets the engine (the better move is shown even where the game was still in
    // the book); a book move is only marked as such
    const todo = fens.map((_, i) => i);
    const book = fens.map((f, i) => isBook(f, moves[i]));
    const n = Math.min(3, Math.max(1, (navigator.hardwareConcurrency ?? 2) - 1), todo.length);
    for (let k = 0; k < n; k++) engines.push(new Engine());
    let next = 0;
    await Promise.all(engines.map(async (eng) => {
      while (!stop && next < todo.length) {
        const i = todo[next++];
        const lines = await eng.analyse(fens[i], MS, 2);
        if (stop) return;
        const e: PosEval = { lines: lines.map((l) => ({ cp: l.cp, pv: l.pv.slice(0, 12) })), ...(book[i] ? { book: true } : {}) };
        evals[i] = e; onpos(i, e);
      }
    }));
    if (!stop) await db.meta.put({ key: key(id), value: { v: VERSION, evals } });
  })().finally(() => { for (const e of engines) e.quit(); });
  return { cancel: () => { stop = true; for (const e of engines) e.quit(); }, done };
}

/** a short look at one position for exploring a variation: the best three lines */
let live: Engine | null = null;
let liveSeq = 0;
let liveBusy: Promise<unknown> = Promise.resolve();
export async function analyseLive(fen: string, ms = 900): Promise<PosEval | null> {
  const seq = ++liveSeq;
  live ??= new Engine();
  const eng = live;
  // one search at a time: a newer position stops the one running
  eng.stop();
  const run = liveBusy.then(() => (seq === liveSeq ? eng.analyse(fen, ms, 3) : []));
  liveBusy = run.catch(() => {});
  const lines = await run;
  if (seq !== liveSeq || !lines.length) return null;
  return { lines: lines.map((l) => ({ cp: l.cp, pv: l.pv.slice(0, 14) })) };
}
export function stopLive() { live?.quit(); live = null; liveSeq++; }
