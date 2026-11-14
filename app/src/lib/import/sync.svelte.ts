// chess.com sync and on-phone analysis (docs/BRIEF.md, "Mistake import").
import { app, save } from '../state.svelte';
import { db, type CardRow, type GameRow } from '../db';
import { archives, monthGames, rapidRating, lastMonths, monthOf, monthStart, windowStart, monthsToSync } from './chesscom';
import { parsePgn, splitPgns, sideOf, findMistakes, type PlyAnalysis, type ParsedGame } from './mistakes';
import { Engine } from '../engine/stockfish';
import { epdOf, hashId, sans, moveOrder, child, START_EPD, turnOf, winPct, type Side } from '../chess';
import { lines, movesAt, labelOf, lapse, addCards, noteRating, openingAt, data } from '../model.svelte';
import { moveId } from '../srs/lines';
import { createEmptyCard } from '../srs/fsrs';

export const sync = $state({
  running: false,
  analysing: false,
  text: '',
  done: 0,
  total: 0,
  error: '',
  summary: null as null | { imported: number; lapsed: string[]; uncovered: number; mistakes: number }
});

const CLASS: Record<string, string> = { Rapid: 'rapid', Blitz: 'blitz', Daily: 'daily' };


export async function autoSync() {
  if (!app.username || Date.now() - app.lastSync < 24 * 36e5) { void analysePending(); return; }
  await syncNow();
}

export async function syncNow() {
  if (sync.running) return;
  if (!app.username) { sync.error = 'Add your chess.com username first.'; return; }
  sync.running = true; sync.error = ''; sync.summary = null; sync.text = 'Reading your chess.com rating';
  try {
    const r = await rapidRating(app.username);
    if (r) await noteRating(r);
    sync.text = 'Fetching your games';
    const all = await archives(app.username);
    // the first sync takes the last three months; later syncs only newer months, never older history
    if (!app.syncedArchives.length) app.syncFrom = monthOf(lastMonths(all, 3)[0] ?? '') || windowStart();
    else if (!app.syncFrom) app.syncFrom = windowStart();
    const months = monthsToSync(all, app.syncedArchives, app.syncFrom);
    const want = new Set(app.timeClasses.map((c) => CLASS[c]));
    const fresh: GameRow[] = [];
    for (const m of months) {
      for (const g of await monthGames(m)) {
        if (!g.rated || !want.has(g.time_class) || (g.rules && g.rules !== 'chess')) continue;
        if (await db.games.get(g.url)) continue;
        const colour: Side = g.white.username.toLowerCase() === app.username.toLowerCase() ? 'w' : 'b';
        const me = colour === 'w' ? g.white : g.black;
        const opp = colour === 'w' ? g.black : g.white;
        const res = me.result === 'win' ? 'win' : ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'].includes(me.result) ? 'draw' : 'loss';
        fresh.push({ url: g.url, pgn: g.pgn, colour, opponent: opp.username, result: res, date: g.end_time * 1000, timeClass: g.time_class, rating: me.rating, evals: [], analyzed: 0 });
      }
    }
    app.syncedArchives = Array.from(new Set([...app.syncedArchives, ...months.filter((m) => m !== all.at(-1))]));
    app.lastSync = Date.now();
    save();
    const summary = await importGames(fresh);
    sync.summary = summary;
    sync.text = '';
  } catch (e) {
    sync.error = e instanceof Error ? e.message : 'chess.com could not be reached';
  } finally {
    sync.running = false;
  }
  void analysePending();
}

/** Paste PGN fallback: one or many games, same analysis. */
export async function importPgn(text: string, colour: Side | 'auto'): Promise<number> {
  const rows: GameRow[] = [];
  for (const p of splitPgns(text)) {
    const g = parsePgn(p);
    if (!g || !g.moves.length) continue;
    const side = colour === 'auto' ? (app.username ? sideOf(g, app.username) : null) : colour;
    if (!side) throw new Error('Pick the side you played: your username is not in these games');
    if (await db.games.get(g.url)) continue;
    const me = side === 'w' ? '1-0' : '0-1';
    rows.push({ url: g.url, pgn: p, colour: side, opponent: side === 'w' ? g.black : g.white, result: g.result === me ? 'win' : g.result === '1/2-1/2' ? 'draw' : 'loss', date: g.date, timeClass: 'pasted', evals: [], analyzed: 0 });
  }
  sync.summary = await importGames(rows);
  void analysePending();
  return rows.length;
}

/**
 * Store games and run the repertoire checks: leaving your repertoire at a Move
 * card lapses it; an opponent reply your lines do not cover is listed.
 */
async function importGames(rows: GameRow[]) {
  const lapsed: string[] = [];
  let uncovered = 0;
  for (const row of rows) {
    const g = parsePgn(row.pgn);
    if (!g) continue;
    const L = lines()[row.colour];
    let e = START_EPD;
    for (let i = 0; i < g.moves.length && L?.pos.has(e); i++) {
      const u = g.moves[i];
      if (turnOf(e) === row.colour) {
        const mine = movesAt(row.colour, e);
        if (mine.length && !mine.includes(u)) {
          for (const m of mine) if (await lapse(moveId(row.colour, e, m), row.date)) lapsed.push(`${labelOf(e, g.moves.slice(0, i))}: ${moveOrder(sans(g.moves.slice(0, i + 1)))}`);
          break;
        }
      } else if (!L.pos.has(child(e, u)) && L.pos.get(e)?.mine !== undefined && L.pos.get(e)!.mine < L.depth) {
        row.uncovered = g.moves.slice(0, i + 1);
        uncovered++;
        break;
      }
      e = child(e, u);
    }
  }
  if (rows.length) await db.games.bulkPut(rows);
  return { imported: rows.length, lapsed, uncovered, mistakes: 0 };
}

/**
 * Earlier versions fetched the whole chess.com history on the second sync.
 * Unanalysed games from before the import window are dropped (pasted games stay).
 */
async function dropOutsideWindow() {
  if (!app.syncFrom && app.syncedArchives.length) { app.syncFrom = windowStart(); save(); }
  if (!app.syncFrom) return;
  const from = monthStart(app.syncFrom);
  const old = await db.games.where('analyzed').equals(0).filter((g) => g.date < from && g.timeClass !== 'pasted').primaryKeys();
  if (old.length) await db.games.bulkDelete(old);
}

/** Parallel engines: Stockfish lite is single-threaded, phones have 4–8 cores. */
const ENGINES = () => Math.max(1, Math.min(3, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1));
let engines: Engine[] = [];

/** Analyse every game not yet analysed, newest first. Unfinished games resume on the next open. */
export async function analysePending() {
  if (sync.analysing) return;
  sync.analysing = true;
  try {
    await dropOutsideWindow();
    const todo = (await db.games.where('analyzed').equals(0).toArray()).sort((a, b) => b.date - a.date);
    if (!todo.length) return;
    sync.total = todo.length; sync.done = 0;
    sync.text = `Analysing your games · 0 of ${sync.total}`;
    engines = Array.from({ length: Math.min(ENGINES(), todo.length) }, () => new Engine());
    let next = 0, found = 0, failed = false;
    await Promise.all(engines.map(async (eng) => {
      while (!failed && next < todo.length) {
        const row = todo[next++];
        try { found += await analyseGame(row, eng); }
        catch (e) { failed = true; throw e; }
        sync.done++;
        sync.text = `Analysing your games · ${sync.done} of ${sync.total}`;
      }
    }));
    if (sync.summary) sync.summary.mistakes += found;
    else sync.summary = { imported: 0, lapsed: [], uncovered: 0, mistakes: found };
  } catch (e) {
    console.error(e);
    sync.error = 'Game analysis stopped; it continues next time Ply opens.';
  } finally {
    sync.analysing = false; sync.text = '';
    for (const e of engines) e.quit();
    engines = [];
  }
}

/** Win% outside this range on both sides of a move cannot be a mistake (see findMistakes). */
const decided = (cp: number) => winPct(cp) < 10 || winPct(cp) > 90;

async function analyseGame(row: GameRow, eng: Engine): Promise<number> {
  const g = parsePgn(row.pgn);
  if (!g) { await db.games.update(row.url, { analyzed: 1 }); return 0; }
  const evals: (number | null)[] = new Array(g.fens.length).fill(null);
  const plies: PlyAnalysis[] = [];
  const whiteView = (fen: string, cp: number) => (fen.split(' ')[1] === 'w' ? cp : -cp);
  const tree = data()?.tree;
  let lastCp: number | null = null; // your eval after your previous move, your view
  for (let i = 0; i < g.moves.length; i++) {
    const fen = g.fens[i];
    const mover: Side = fen.split(' ')[1] as Side;
    if (mover !== row.colour) continue;
    const played = g.moves[i];
    // book moves: the tree's depth-18 evals before and after decide it without the engine
    const e = epdOf(fen), node = tree?.[e], after = node && tree![child(e, played)];
    if (node && after) {
      const sign = mover === 'w' ? 1 : -1;
      if (winPct(sign * node.e) - winPct(sign * after.e) < 12) { evals[i] = node.e; lastCp = sign * after.e; continue; }
    }
    // a decided game: a quick look first, the full search only if the position is still open
    if (lastCp !== null && decided(lastCp)) {
      const probe = (await eng.analyse(fen, 60, 1))[0];
      if (probe && decided(probe.cp)) { evals[i] = whiteView(fen, probe.cp); lastCp = probe.cp; continue; }
    }
    const lines = await eng.analyse(fen, 300, 3);
    if (!lines.length) continue;
    evals[i] = whiteView(fen, lines[0].cp);
    const hit = lines.find((l) => l.pv[0] === played);
    let afterCp: number, reply: string[];
    if (hit) { afterCp = hit.cp; reply = hit.pv.slice(1, 4); }
    else {
      const next = (await eng.analyse(g.fens[i + 1], 150, 1))[0];
      afterCp = next ? -next.cp : lines[0].cp;
      reply = next?.pv.slice(0, 3) ?? [];
      if (next) evals[i + 1] = whiteView(g.fens[i + 1], next.cp);
    }
    lastCp = afterCp;
    plies.push({ ply: i, lines: lines.map((l) => ({ cp: l.cp, pv: l.pv })), played, afterCp, reply });
  }
  // the move-10 and move-15 positions always get an eval for the Today and Stats charts
  for (const ply of [20, 30]) {
    if (ply < g.fens.length && evals[ply] === null) {
      const n = tree?.[epdOf(g.fens[ply])];
      if (n) { evals[ply] = n.e; continue; }
      const l = (await eng.analyse(g.fens[ply], 300, 1))[0];
      if (l) evals[ply] = whiteView(g.fens[ply], l.cp);
    }
  }
  const found = findMistakes(plies);
  const rows: CardRow[] = found.map((m) => mistakeCard(row, g, m));
  if (rows.length) await addCards(rows);
  await db.games.update(row.url, { evals, analyzed: 1, mistakes: rows.map((r) => r.id) });
  return rows.length;
}

function mistakeCard(row: GameRow, g: ParsedGame, m: ReturnType<typeof findMistakes>[number]): CardRow {
  const epd = epdOf(g.fens[m.ply]);
  const path = g.moves.slice(0, m.ply);
  const date = new Date(row.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const now = new Date();
  return {
    id: 'k' + hashId(row.url, String(m.ply)), type: 'mistake', side: row.colour, epd, move: m.best, answer: [m.best], line: [m.best],
    accepted: m.accepted, played: m.played, loss: Math.round(m.loss), refute: m.refute, label: labelOf(epd, path), path,
    source: `From your game vs ${row.opponent}, ${date}`, ref: row.url, opening: openingAt(epd, path)?.id,
    fsrs: createEmptyCard(now), due: +now, suspended: 0, created: row.date, lapses: 0
  };
}
