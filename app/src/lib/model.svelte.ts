// The app model: loaded data, your repertoire and lines, cards and grading.
// Big structures live outside $state (they are large and change wholesale);
// `model.rev` ticks whenever they change, so views re-derive from it.
import { app, save, onSave, replaceSettings, type Settings } from './state.svelte';
import { db, type CardRow, type RepRow, type ReviewRow, type Mode, type CardType, type ArcadeMemory, type BookRow } from './db';
import { ensureFiles, loadBand, newerVersion, BANDS, type Loaded, type Trap, type Puzzle, type Opening } from './data';
import { START_EPD, child, epdAfter, san, sans, moveOrder, turnOf, fenOf, epdOf, hashId, type Side } from './chess';
import { makeCtx, generate, pathTo, coverage, myMoves, replies, lineReplies, otherOrders, moveId, sectionOf, type Ctx, type Lines, type MoveSpec, type Section, type GenOpts, type Pos } from './srs/lines';
import { buildQueue, dayStart, type QItem, type TrapSpec } from './srs/queue';
import { grade, retrievability, stageOf, createEmptyCard, Rating, type Stage, type Card } from './srs/fsrs';
import { rate } from './srs/grade';
import { limitsFor, planCatchUp, dayOf } from './srs/catchup';
import type { Item, Outcome, Ask } from './session';
import { Chess } from 'chess.js';

export const model = $state({
  status: 'boot' as 'boot' | 'downloading' | 'loading' | 'ready' | 'error',
  progress: 0,
  error: '',
  version: '',
  band: 1200,
  rev: 0,
  notice: ''
});

let D: Loaded | null = null;
let ctx: Ctx | null = null;
const L: Partial<Record<Side, Lines>> = {};
const rep = new Map<string, RepRow>();
/** your own book: opponent replies your lines follow beyond the band's tree */
const book = new Map<string, BookRow>();
const cards = new Map<string, CardRow>();
let trapById = new Map<string, Trap>();
let puzzleById = new Map<string, Puzzle>();
let reviewsToday: ReviewRow[] = [];
const rk = (side: Side, epd: string) => side + '|' + epd;
const bump = () => { model.rev++; };

export const data = () => D;
export const lines = () => L;
export const allCards = () => cards;
export const getCtx = () => ctx;

// ---------------------------------------------------------------- settings
/** The bands the data has (the manifest lists them; higher bands appear once the pipeline builds them). */
let bandsHere: number[] = BANDS;
export const bandList = () => bandsHere;
export const bandFor = (rating: number) => bandsHere.reduce((best, b) => (Math.abs(b - (rating + 350)) < Math.abs(best - (rating + 350)) ? b : best), bandsHere[0]);
export const currentBand = () => (app.band >= 1000 ? app.band : app.autoBand || 1200);
export function depthLimit(): number {
  if (app.depth >= 4) return app.depth;
  const r = app.rating;
  if (!r || r < 1000) return 8;
  if (r < 1300) return 10;
  if (r < 1600) return 12;
  return 14;
}
const genOpts = (side: Side): GenOpts => ({ side, depth: depthLimit(), replyPct: app.replyPct / 100, minGames: 50, rootPct: 0.01 });
const today0 = () => dayStart(Date.now(), app.rollover);

// ---------------------------------------------------------------- boot
export async function boot() {
  try {
    navigator.storage?.persist?.();
    const stored = await db.settings.get('app');
    if (stored?.value) replaceSettings(stored.value as Partial<Settings>);
    onSave((s) => { void db.settings.put({ key: 'app', value: s }); });
    save();
    await loadAll(currentBand());
    void autoUpdate();
  } catch (e) {
    console.error(e);
    model.status = 'error';
    model.error = e instanceof Error ? e.message : String(e);
  }
}

async function loadAll(band: number) {
  model.status = 'downloading';
  model.progress = 0;
  model.version = await ensureFiles(band, (d, t) => (model.progress = t ? d / t : 0));
  try { const m = JSON.parse((await db.data.get('manifest.json'))?.text ?? '{}'); if (Array.isArray(m.bands) && m.bands.length) bandsHere = m.bands; } catch { /* keep the defaults */ }
  model.status = 'loading';
  D = await loadBand(band);
  model.band = band;
  ctx = makeCtx(D.tree, D.openings, D.traps);
  trapById = new Map(D.traps.map((t) => [t.id, t]));
  puzzleById = new Map(D.puzzles.map((p) => [p.id, p]));
  rep.clear();
  for (const r of await db.repertoire.toArray()) rep.set(rk(r.side, r.epd), r);
  book.clear();
  for (const b of await db.book.toArray()) book.set(rk(b.side, b.epd), b);
  if (!rep.size) await chooseStarter();
  cards.clear();
  for (const c of await db.cards.toArray()) cards.set(c.id, c);
  reviewsToday = await db.reviews.where('at').aboveOrEqual(today0()).toArray();
  await loadArcade();
  regenerate();
  model.status = 'ready';
  bump();
}

/** Data updates: a new manifest version downloads the changed files on Wi-Fi. */
async function autoUpdate() {
  const conn = (navigator as unknown as { connection?: { type?: string; saveData?: boolean } }).connection;
  if (conn?.type && conn.type !== 'wifi' && conn.type !== 'ethernet') return;
  const v = await newerVersion();
  if (!v) return;
  await ensureFiles(currentBand(), undefined, true);
  await loadAll(currentBand());
  model.notice = `Opening data updated to ${v}. Your lines were regenerated.`;
}

/** Switch band (Settings lock, or growth): downloads that band's files and regenerates. */
export async function switchBand(band: number) {
  if (band === model.band && D) return;
  await loadAll(band);
}

// ---------------------------------------------------------------- names
export function openingAt(epd: string, path?: string[]): Opening | null {
  if (!D || !ctx) return null;
  const own = ctx.named.get(epd);
  if (own !== undefined) return D.openings[own];
  if (path) {
    let e = START_EPD;
    let best: number | undefined;
    for (const u of path) { e = child(e, u); const id = ctx.named.get(e); if (id !== undefined) best = id; }
    if (best !== undefined) return D.openings[best];
  }
  const o = D.tree[epd]?.o;
  return o !== undefined ? D.openings[o] : null;
}
export function nameOf(epd: string, path?: string[]): [eco: string, name: string] {
  const o = openingAt(epd, path);
  return o ? [o.eco, o.name] : ['', 'Starting position'];
}
export const labelOf = (epd: string, path?: string[]) => { const [eco, n] = nameOf(epd, path); return eco ? `${n} (${eco})` : n; };

// ---------------------------------------------------------------- repertoire
export const mine = (side: Side, epd: string) => rep.get(rk(side, epd))?.moves;
export const movesAt = (side: Side, epd: string) => (ctx ? myMoves(ctx, mine, side, epd) : []);
export const repRow = (side: Side, epd: string) => rep.get(rk(side, epd));
/** opponent replies you added yourself at a position */
export const bookAt = (side: Side, epd: string) => book.get(rk(side, epd))?.replies;
/** what you play at a position now, and whether it is your own choice rather than the default */
export const currentAt = (side: Side, epd: string) => ({ moves: movesAt(side, epd), own: !!mine(side, epd)?.length });
/** every opponent reply your lines follow from a position, with its share of games */
const oppReplies = (side: Side, epd: string, ply = 1) => (ctx ? lineReplies(ctx, bookAt, side, epd, ply === 0 ? 0.01 : app.replyPct / 100, 50) : []);
/** the band's tree knows the position, or your own moves or book carry the line on */
const reached = (side: Side, epd: string) => !!D?.tree[epd] || !!(turnOf(epd) === side ? mine(side, epd)?.length : bookAt(side, epd)?.length);

function starterRows(section: Section): RepRow[] {
  const rows: RepRow[] = [];
  const at = (side: Side, path: string[], move: string) => rows.push({ side, epd: epdAfter(path), moves: [move] });
  // an opening picked from the full list: your moves along its main line
  const along = (side: Side, path: string) => { let e = START_EPD; for (const u of path.split(' ').filter(Boolean)) { if (turnOf(e) === side) rows.push({ side, epd: e, moves: [u] }); e = child(e, u); } };
  if (section === 'White' && app.whitePath) along('w', app.whitePath);
  else if (section === 'Black vs 1.e4' && app.blackE4Path) along('b', app.blackE4Path);
  else if (section === 'Black vs 1.d4' && app.blackD4Path) along('b', app.blackD4Path);
  else if (section === 'White') {
    if (app.white === "Queen's Gambit") { at('w', [], 'd2d4'); at('w', ['d2d4', 'd7d5'], 'c2c4'); }
    else { at('w', [], 'e2e4'); at('w', ['e2e4', 'e7e5'], 'g1f3'); at('w', ['e2e4', 'e7e5', 'g1f3', 'b8c6'], 'f1c4'); }
  } else if (section === 'Black vs 1.e4') {
    at('b', ['e2e4'], app.blackE4 === 'Sicilian Defense' ? 'c7c5' : 'e7e5');
  } else if (section === 'Black vs 1.d4') {
    if (app.blackD4 === "King's Indian") { at('b', ['d2d4'], 'g8f6'); at('b', ['d2d4', 'g8f6', 'c2c4'], 'g7g6'); }
    else { at('b', ['d2d4'], 'd7d5'); at('b', ['d2d4', 'd7d5', 'c2c4'], 'e7e6'); }
  } else if (D) {
    // every other first move: 1...d5 or 1...e5 by the default-move rule
    for (const [u] of replies(ctx!, START_EPD, 0.01, 50)) {
      if (u === 'e2e4' || u === 'd2d4') continue;
      const e = child(START_EPD, u);
      const n = D.tree[e];
      if (!n) continue;
      const cands = n.m.filter(([m]) => m === 'd7d5' || m === 'e7e5');
      const ok = cands.filter(([m]) => { const c = D!.tree[child(e, m)]; return c && -c.e >= -n.e - 30; });
      const pick = (ok[0] ?? cands[0])?.[0];
      if (pick) rows.push({ side: 'b', epd: e, moves: [pick] });
    }
  }
  return rows;
}

/** Section of a position your lines reach; null when the lines do not reach it (yet). */
function sectionOfEpd(side: Side, epd: string): Section | null {
  const p = L[side]?.pos.get(epd);
  return p ? sectionOf(side, p.root) : null;
}

async function applyStarter(sections: Section[]) {
  for (const s of sections) {
    // drop overrides in this section, then write the starter ones
    for (const r of [...rep.values()]) {
      const sec = r.side === 'w' ? 'White' : sectionOfEpd('b', r.epd);
      if (sec === s) { rep.delete(rk(r.side, r.epd)); await db.repertoire.delete([r.side, r.epd]); }
    }
    for (const r of starterRows(s)) { rep.set(rk(r.side, r.epd), r); await db.repertoire.put(r); }
    // your own book replies in this section go too
    for (const b of [...book.values()]) {
      const sec = b.side === 'w' ? 'White' : sectionOfEpd('b', b.epd);
      if (sec === s) { book.delete(rk(b.side, b.epd)); await db.book.delete([b.side, b.epd]); }
    }
  }
}

/** Onboarding: write the starter repertoire for the openings picked. */
export async function chooseStarter() {
  await applyStarter(['White', 'Black vs 1.e4', 'Black vs 1.d4']);
  regenerate();
  await applyStarter(['Black vs others']);
  regenerate();
  bump();
}

/** A repertoire deviation in one of your games: that card gets Again. */
/** Lapse a card for a game deviation; a game played before you learned the move does not count. */
export async function lapse(cardId: string, playedAt = Date.now()): Promise<boolean> {
  const c = cards.get(cardId);
  if (!c || c.suspended || playedAt < c.created) return false;
  await review(c, Rating.Again, 0, 'today', new Date(), []);
  bump();
  return true;
}
export async function addCards(rows: CardRow[]) {
  for (const r of rows) if (!cards.has(r.id)) cards.set(r.id, r);
  await db.cards.bulkPut(rows.map((r) => $state.snapshot(r) as CardRow));
  bump();
}
export async function deleteCard(id: string) {
  cards.delete(id);
  await db.cards.delete(id);
  bump();
}

export async function resetSection(s: Section) {
  const before = snapshotIds();
  await applyStarter([s]);
  regenerate();
  await retireDropped(before);
  bump();
}

/** Set your move(s) at a position. Cards no longer in your lines below it are retired. */
export async function setMoves(side: Side, epd: string, moves: string[], note?: string) {
  const before = snapshotIds();
  const row: RepRow = { side, epd, moves, note: note ?? rep.get(rk(side, epd))?.note };
  rep.set(rk(side, epd), row);
  await db.repertoire.put(row);
  regenerate();
  await retireDropped(before, epd);
  bump();
}
export async function setNote(side: Side, epd: string, note: string) {
  const row: RepRow = rep.get(rk(side, epd)) ?? { side, epd, moves: movesAt(side, epd) };
  row.note = note;
  rep.set(rk(side, epd), row);
  await db.repertoire.put(row);
  bump();
}
export const noteAt = (side: Side, epd: string) => rep.get(rk(side, epd))?.note;

const snapshotIds = () => new Set([...(L.w?.cards.keys() ?? []), ...(L.b?.cards.keys() ?? [])]);
async function retireDropped(before: Set<string>, under?: string) {
  const now = new Set([...(L.w?.cards.keys() ?? []), ...(L.b?.cards.keys() ?? [])]);
  const gone: CardRow[] = [];
  for (const id of before) {
    if (now.has(id)) continue;
    const c = cards.get(id);
    if (!c || c.suspended) continue;
    if (under && !(c.path ?? []).some((_, i) => epdAfter((c.path ?? []).slice(0, i)) === under) && c.epd !== under) continue;
    c.suspended = 1;
    gone.push(c);
  }
  if (gone.length) await db.cards.bulkPut(gone.map((c) => $state.snapshot(c) as CardRow));
}

// ---------------------------------------------------------------- lines and candidates
let newMoveSpecs: MoveSpec[] = [];
let newTrapSpecs: TrapSpec[] = [];
export const candidates = () => ({ moves: newMoveSpecs, traps: newTrapSpecs });

export function regenerate() {
  if (!ctx) return;
  L.w = generate(ctx, mine, genOpts('w'), bookAt);
  L.b = generate(ctx, mine, genOpts('b'), bookAt);
  newMoveSpecs = [...L.w.cards.values(), ...L.b.cards.values()].filter((s) => !cards.has(s.id));
  newTrapSpecs = trapCandidates().filter((t) => !cards.has(t.id));
  bump();
}

function trapCandidates(): TrapSpec[] {
  if (!D) return [];
  const out: TrapSpec[] = [];
  for (const t of D.traps) {
    const Ls = L[t.side];
    if (!Ls?.pos.has(t.epd) || turnOf(t.epd) !== t.side) continue;
    if (t.kind === 'danger') {
      const my = movesAt(t.side, t.epd);
      if (!my.length || my.includes(t.bait!)) continue;
    }
    out.push({ id: 't' + t.id, type: t.kind, score: t.freq * t.loss });
  }
  // puzzles: opening family in your repertoire, solving side is your colour there
  const fam: Record<Side, Set<string>> = { w: new Set(), b: new Set() };
  for (const side of ['w', 'b'] as Side[]) for (const e of L[side]!.pos.keys()) {
    const o = D.tree[e]?.o;
    if (o !== undefined) fam[side].add(D.openings[o].family);
  }
  for (const p of D.puzzles) {
    const solver: Side = p.fen.split(' ')[1] === 'w' ? 'b' : 'w';
    if (p.families.some((id) => fam[solver].has(D!.openings[id]?.family))) out.push({ id: 'z' + p.id, type: 'puzzle', score: p.plays });
  }
  return out;
}

/** Move cards whose position your lines no longer reach. */
export function rareCards(): CardRow[] {
  return [...cards.values()].filter((c) => c.type === 'move' && !c.suspended && !L[c.side]?.cards.has(c.id));
}
export async function retireRare() {
  const r = rareCards();
  for (const c of r) c.suspended = 1;
  await db.cards.bulkPut(r.map((c) => $state.snapshot(c) as CardRow));
  bump();
}

// ---------------------------------------------------------------- today
export function doneToday() {
  const t0 = today0();
  const rs = reviewsToday.filter((r) => r.at >= t0);
  const intro = (types: CardType[]) => rs.filter((r) => r.stage === 'new' && types.includes(typeOfCard(r.cardId))).length;
  return {
    reviews: rs.filter((r) => r.stage !== 'new' && r.mode !== 'learn').length,
    newMoves: intro(['move']),
    newTraps: intro(['punish', 'danger', 'puzzle']),
    newMistakes: intro(['mistake']),
    all: rs.length
  };
}
const typeOfCard = (id: string): CardType => cards.get(id)?.type ?? (id[0] === 't' ? 'punish' : id[0] === 'z' ? 'puzzle' : id[0] === 'k' ? 'mistake' : 'move');

/** Extra new moves (+5) count for the study day they were granted on. */
export function grantExtraNew(n: number) {
  if (app.extraDay !== today0()) { app.extraNew = 0; app.extraDay = today0(); }
  app.extraNew += n;
  save();
  bump();
}

export function todayQueue(): QItem[] {
  const now = Date.now();
  return buildQueue({
    now,
    cards: [...cards.values()],
    lines: L,
    newMoves: newMoveSpecs,
    focus: focusSpecs(),
    newTraps: newTrapSpecs,
    limits: limitsFor({ newMoves: app.newMoves, newTraps: app.newTraps, newMistakes: app.newMistakes, maxReviews: app.maxReviews }, app.catchUp, today0()),
    done: doneToday(),
    extraNew: app.extraDay === today0() ? app.extraNew : 0,
    retrievability: (c) => retrievability(c.fsrs, new Date(now), app.retention / 100)
  });
}

/** Today counts: due (your moves to review), new (to introduce), done. */
export function todayCounts() {
  void model.rev;
  const q = todayQueue();
  let due = 0, fresh = 0;
  for (const i of q) {
    if (i.kind === 'line') due += i.due.length;
    else if (i.kind === 'card') i.card.fsrs.state === 0 ? fresh++ : due++;
    else fresh++;
  }
  // every due review, whether or not today's limits leave room for it: the honest number
  let dueAll = 0;
  for (const c of cards.values()) if (!c.suspended && c.fsrs.state !== 0 && c.due <= now()) dueAll++;
  return { due, dueAll, fresh, done: doneToday().all, queue: q };
}
const now = () => Date.now();

/** The catch-up plan's day (0-based) today, or null when none runs (a finished plan simply stops counting). */
export const catchUpDay = (): number | null => dayOf(app.catchUp, today0());
/** Spread the due backlog over `days` days; new cards wait until it is cleared. */
export function startCatchUp(backlog: number, days: number) {
  app.catchUp = planCatchUp(backlog, days, today0());
  save(); bump();
}
export function stopCatchUp(declined = false) {
  app.catchUp = null;
  if (declined) app.catchUpDeclined = today0();
  save(); bump();
}
export const studyDay = () => today0();

// ---------------------------------------------------------------- items
const ask = (a: Ask): Ask => a;

/** Ask every one of your moves along a path; due cards change schedule. */
function lineItem(side: Side, path: string[], dueIds: Set<string>, opts: { intro?: MoveSpec; kind?: Item['kind'] } = {}): Item {
  const asks: Record<number, Ask> = {};
  let e = START_EPD;
  const branches: NonNullable<Item['branches']> = [];
  path.forEach((u, i) => {
    if (turnOf(e) === side) {
      const id = moveId(side, e, u);
      const mineHere = movesAt(side, e);
      const other = mineHere.filter((m) => m !== u).map((m) => [m, nameOf(child(e, m))[1]] as [string, string]);
      const isIntro = opts.intro && opts.intro.id === id;
      asks[i] = ask({ card: cards.has(id) || isIntro ? id : undefined, graded: dueIds.has(id) || !!isIntro, intro: !!isIntro, other: other.length ? other : undefined });
      if (mineHere.length > 1) branches.push({ label: labelOf(child(e, u), path.slice(0, i + 1)), until: i });
    }
    e = child(e, u);
  });
  const last = path.length - 1;
  const cardEpd = epdAfter(path.slice(0, last));
  const Ls = L[side];
  const others = Ls ? otherOrders(Ls, cardEpd).map((p) => moveOrder(sans(p))) : [];
  const note = noteAt(side, cardEpd);
  return {
    kind: opts.kind ?? (opts.intro ? 'new' : 'line'),
    side, start: START_EPD, setup: [], moves: path, asks,
    prompt: opts.intro ? 'New move' : 'Your move',
    label: labelOf(cardEpd, path.slice(0, last)),
    order: moveOrder(sans(path.slice(0, last)), true),
    others, note, branches: branches.length ? branches : undefined, spec: opts.intro
  };
}

function newMoveItem(spec: MoveSpec): Item {
  const Ls = L[spec.side]!;
  const path = [...pathTo(Ls, spec.epd), spec.move];
  // the line plays up to the new move (your known moves are asked as usual)
  return lineItem(spec.side, path, new Set(), { intro: spec });
}

function trapItem(t: Trap, id: string, isNew: boolean): Item {
  const Ls = L[t.side];
  const path = Ls?.pos.has(t.epd) ? pathTo(Ls, t.epd) : [];
  const start = path.length || t.epd === START_EPD ? START_EPD : t.epd;
  const asks: Record<number, Ask> = {};
  const answer = t.kind === 'danger' ? [movesAt(t.side, t.epd)[0] ?? t.answer[0]] : t.line;
  answer.forEach((_, i) => { if (i % 2 === 0) asks[i] = {}; });
  const pct = Math.round(t.freq * 100);
  const bait = t.bait ? sans([t.bait], t.epd)[0] : '';
  return {
    kind: t.kind, side: t.side, start, setup: path, moves: answer, asks,
    prompt: t.kind === 'punish' ? 'They blundered. Punish it' : 'Careful. Find the safe move',
    label: labelOf(t.epd, path), order: path.length ? moveOrder(sans(path), true) : '',
    source: t.kind === 'punish' ? `Punish · played by ${pct}% at your band` : `Danger · ${pct}% at your band play ${bait}`,
    note: noteAt(t.side, t.epd),
    bait: t.kind === 'danger' ? { uci: t.bait!, san: bait, refute: t.refute ?? [] } : undefined,
    card: id, intro: isNew ? { kind: 'trap', ref: t.id } : undefined
  };
}

function puzzleItem(p: Puzzle, id: string, isNew: boolean): Item {
  const side: Side = p.fen.split(' ')[1] === 'w' ? 'b' : 'w';
  const asks: Record<number, Ask> = {};
  p.moves.forEach((_, i) => { if (i % 2 === 1) asks[i] = {}; });
  const fams = [...new Set(p.families.map((f) => D!.openings[f]?.family).filter(Boolean))];
  return {
    kind: 'puzzle', side, start: p.fen, setup: [], moves: p.moves, asks,
    prompt: 'Find the best line', label: D!.openings[p.families.at(-1)!]?.name ?? fams[0] ?? 'Puzzle', order: '',
    source: `Puzzle · rated ${p.rating} · ${fams.join(', ')}`, card: id, intro: isNew ? { kind: 'puzzle', ref: p.id } : undefined
  };
}

function mistakeItem(c: CardRow): Item {
  return {
    // play from the game's own moves when known, so the move list has the real numbers
    kind: 'mistake', side: c.side, start: c.path ? START_EPD : c.epd, setup: c.path ?? [], moves: [c.move], asks: { 0: { accepted: c.accepted } },
    prompt: c.source ?? 'From your game', label: c.label, order: c.path ? moveOrder(sans(c.path), true) : '',
    source: c.source, played: c.played ? { uci: c.played, refute: c.refute ?? [] } : undefined, card: c.id
  };
}

function cardItem(c: CardRow): Item | null {
  if (c.type === 'move') return lineItem(c.side, [...(L[c.side]?.pos.has(c.epd) ? pathTo(L[c.side]!, c.epd) : c.path ?? []), c.move], new Set([c.id]));
  if (c.type === 'mistake') return mistakeItem(c);
  if (c.type === 'puzzle') { const p = puzzleById.get(c.ref!); return p ? puzzleItem(p, c.id, false) : null; }
  const t = trapById.get(c.ref!);
  return t ? trapItem(t, c.id, false) : storedTrapItem(c);
}
/** A trap card whose band file no longer has it still plays from its stored answer. */
function storedTrapItem(c: CardRow): Item {
  const t: Trap = { id: c.ref ?? c.id, kind: c.type as 'punish' | 'danger', epd: c.epd, side: c.side, answer: c.answer, line: c.line, bait: c.bait, refute: c.refute, loss: 0, freq: 0, o: c.opening ?? 0 };
  const it = trapItem(t, c.id, false);
  it.source = c.source;
  return it;
}

export function itemsFor(q: QItem[]): Item[] {
  const out: Item[] = [];
  for (const i of q) {
    let it: Item | null = null;
    if (i.kind === 'line') it = lineItem(i.side, i.path, new Set(i.due));
    else if (i.kind === 'new') it = newMoveItem(i.spec);
    else if (i.kind === 'card') it = cardItem(i.card);
    else if (i.spec.type === 'puzzle') { const p = puzzleById.get(i.spec.id.slice(1)); if (p) it = puzzleItem(p, i.spec.id, true); }
    else { const t = trapById.get(i.spec.id.slice(1)); if (t) it = trapItem(t, i.spec.id, true); }
    if (it) { it.today = true; out.push(it); }
  }
  return out;
}

/** Drill a list of cards (Weakest cards): plays them without touching the schedule. */
export function drillItemsFor(list: CardRow[]): Item[] {
  return list.map(cardItem).filter((i): i is Item => !!i).map((i) => {
    const asks = Object.fromEntries(Object.entries(i.asks).map(([k, a]) => [k, { ...a, graded: false, intro: false }]));
    return { ...i, asks, card: undefined, intro: undefined, kind: i.kind === 'line' ? 'drill' : i.kind };
  });
}

/** Learning cards due again within the session come back while the app is open. */
export function requeue(): Item[] {
  const soon = Date.now() + 10 * 60_000;
  const due = [...cards.values()].filter((c) => !c.suspended && c.fsrs.state !== 0 && (c.fsrs.state === 1 || c.fsrs.state === 3) && c.due <= soon);
  const q: QItem[] = [];
  const moves = due.filter((c) => c.type === 'move');
  if (moves.length) {
    for (const c of moves) q.push({ kind: 'line', side: c.side, path: [...(L[c.side]?.pos.has(c.epd) ? pathTo(L[c.side]!, c.epd) : c.path ?? []), c.move], due: [c.id] });
  }
  for (const c of due.filter((c) => c.type !== 'move')) q.push({ kind: 'card', card: c });
  return itemsFor(q);
}

// ---------------------------------------------------------------- Learn and Drill
/** Your moves on the path to here that differ from your repertoire. */
export function deviations(side: Side, path: string[]): { epd: string; uci: string; ply: number }[] {
  const out: { epd: string; uci: string; ply: number }[] = [];
  let e = START_EPD;
  path.forEach((u, i) => {
    if (turnOf(e) === side && !movesAt(side, e).includes(u)) out.push({ epd: e, uci: u, ply: i });
    e = child(e, u);
  });
  return out;
}
export async function adoptPath(side: Side, path: string[]) {
  // the opponent's moves on the way that your lines would not follow become your own book replies
  let e = START_EPD;
  for (const u of path) {
    if (turnOf(e) !== side && !oppReplies(side, e, e === START_EPD ? 0 : 1).some(([m]) => m === u)) {
      const row: BookRow = { side, epd: e, replies: [...(bookAt(side, e) ?? []), u] };
      book.set(rk(side, e), row);
      await db.book.put(row);
    }
    e = child(e, u);
  }
  for (const d of deviations(side, path)) {
    const cur = mine(side, d.epd);
    await setMoves(side, d.epd, cur?.length ? [d.uci, ...cur.filter((m) => m !== d.uci)].slice(0, 1) : [d.uci]);
  }
  regenerate();
}

/**
 * Import a repertoire (lib/import/repertoire.ts makes the rows from a PGN): your moves and notes per
 * position, and the opponent's replies as your own book. Cards for moves you no longer play are retired.
 */
export async function importRepertoire(a: { rep: { side: Side; epd: string; moves: string[]; note?: string }[]; book: { side: Side; epd: string; replies: string[] }[] }) {
  const before = snapshotIds();
  const repRows: RepRow[] = a.rep.map((r) => ({ side: r.side, epd: r.epd, moves: r.moves, note: r.note ?? rep.get(rk(r.side, r.epd))?.note }));
  const bookRows: BookRow[] = a.book.map((b) => ({ side: b.side, epd: b.epd, replies: [...new Set([...(bookAt(b.side, b.epd) ?? []), ...b.replies])] }));
  for (const r of repRows) rep.set(rk(r.side, r.epd), r);
  for (const b of bookRows) book.set(rk(b.side, b.epd), b);
  await db.transaction('rw', db.repertoire, db.book, async () => { await db.repertoire.bulkPut(repRows); await db.book.bulkPut(bookRows); });
  regenerate();
  await retireDropped(before);
  bump();
  return { positions: repRows.length, replies: bookRows.length };
}

/** New Move cards in the subtree below a position (same rules as line generation). */
export function subtreeNew(side: Side, path: string[]): MoveSpec[] {
  const Ls = L[side];
  if (!Ls) return [];
  const at = epdAfter(path);
  if (!Ls.pos.has(at)) return [];
  const inside = (s: MoveSpec) => {
    let p: Pos | undefined = Ls.pos.get(s.epd);
    while (p) { if (p.epd === at) return true; p = p.parent ? Ls.pos.get(p.parent) : undefined; }
    return false;
  };
  return [...Ls.cards.values()].filter((s) => !cards.has(s.id) && inside(s)).sort((a, b) => b.prob - a.prob || a.ply - b.ply);
}

// ---------------------------------------------------------------- search
export interface OpeningHit { side: Side; name: string; eco: string; path: string[] }
let hitIndex: { rev: number; rows: { side: Side; name: string; eco: string; epd: string; prob: number; hay: string }[] } | null = null;
/** Every named opening and variation your lines pass through, matched on name, ECO code or moves. */
export function searchOpenings(query: string): OpeningHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length || !D || !ctx) return [];
  if (!hitIndex || hitIndex.rev !== model.rev) {
    const best = new Map<string, { side: Side; name: string; eco: string; epd: string; prob: number; hay: string }>();
    for (const side of ['w', 'b'] as Side[]) for (const p of L[side]?.pos.values() ?? []) {
      const id = ctx.named.get(p.epd);
      if (id === undefined) continue;
      // several catalogue entries can share a name: keep the one you reach most often
      const o = D.openings[id], k = side + o.name, cur = best.get(k);
      if (!cur || p.prob > cur.prob) best.set(k, { side, name: o.name, eco: o.eco, epd: p.epd, prob: p.prob, hay: `${o.name} ${o.eco} ${o.san} ${side === 'w' ? 'white' : 'black'}`.toLowerCase().replace(/[\u2019']/g, '') });
    }
    hitIndex = { rev: model.rev, rows: [...best.values()].sort((a, b) => b.prob - a.prob) };
  }
  const clean = words.map((w) => w.replace(/[\u2019']/g, ''));
  return hitIndex.rows.filter((r) => clean.every((w) => r.hay.includes(w))).slice(0, 40).map((r) => ({ side: r.side, name: r.name, eco: r.eco, path: pathTo(L[r.side]!, r.epd) }));
}

// ---------------------------------------------------------------- openings you are mastering
const focusKey = (side: Side) => (side === 'w' ? 'focusW' : 'focusB') as 'focusW' | 'focusB';
/** The openings a colour is mastering, each as a move path. */
export const focusList = (side: Side): string[][] => (app[focusKey(side)] ?? '').split('|').map((p) => p.split(' ').filter(Boolean)).filter((p) => p.length > 0);
export const isFocus = (side: Side, path: string[]) => focusList(side).some((p) => p.join(' ') === path.join(' '));
/** Start or stop mastering an opening; says whether it is mastered now. */
export function toggleFocus(side: Side, path: string[]): boolean {
  if (!path.length) return false;
  const key = path.join(' '), cur = focusList(side).map((p) => p.join(' '));
  const on = !cur.includes(key);
  const next = on ? [...cur, key] : cur.filter((k) => k !== key);
  app[focusKey(side)] = next.length ? next.join('|') : null;
  save();
  bump();
  return on;
}
/** Every opening you are mastering, with its name and how far along it is. */
export interface Chapter { name: string; total: number; learned: number; path: string[] }
/** An opening's chapters: the main branches your opponent can choose, most played first. */
export function chapters(side: Side, path: string[]): Chapter[] {
  void model.rev;
  const base = nameOf(epdAfter(path), path)[1], family = base.split(':')[0];
  type Step = { n: TreeMove; reply: TreeMove | null };
  const next = (ms: TreeMove[]): Step[] => ms.flatMap((r): Step[] => (r.mine ? [{ n: r, reply: null }] : r.children.filter((c) => c.mine).map((c) => ({ n: c, reply: r }))));
  let steps = next(openingTree(side, path));
  for (let i = 0; i < 12 && steps.length === 1; i++) { const k = next(steps[0].n.children); if (!k.length) break; steps = k; }
  return steps.map((s) => {
    let name = s.reply ? branchName(s.reply, base)[1] : base;
    if (name === base && s.reply) name = `After ${s.reply.san}`;
    else if (name.startsWith(family + ': ')) name = name.slice(family.length + 2);
    return { name, total: s.n.sum.total, learned: s.n.sum.total - s.n.sum.stages[0], path: [...s.n.path, s.n.uci] };
  });
}
export interface Mastery { side: Side; path: string[]; name: string; eco: string; total: number; learned: number; stages: number[]; fresh: number; pct: number; chapters: Chapter[] }
export function mastering(): Mastery[] {
  void model.rev;
  const out: Mastery[] = [];
  for (const side of ['w', 'b'] as Side[]) for (const path of focusList(side)) {
    if (!L[side]?.pos.has(epdAfter(path))) continue;
    const stages = [0, 0, 0, 0];
    for (const r of openingTree(side, path)) r.sum.stages.forEach((n, i) => (stages[i] += n));
    const total = stages.reduce((a, b) => a + b, 0);
    const [eco, name] = nameOf(epdAfter(path), path);
    // mastery: a learning move counts a quarter, a young one half, a mature one in full
    const pct = total ? Math.round(((stages[1] * 0.25 + stages[2] * 0.5 + stages[3]) / total) * 100) : 0;
    out.push({ side, path, name, eco, total, learned: total - stages[0], stages, fresh: subtreeNew(side, path).length, pct, chapters: chapters(side, path) });
  }
  return out;
}
/**
 * Unlearned moves of the openings you are mastering, in teaching order: for each one the moves
 * that lead to it and then everything below it, most probable first; the two colours take turns.
 */
function focusSpecs(): MoveSpec[] {
  const per = (['w', 'b'] as Side[]).map((side) => {
    const Ls = L[side], seen = new Map<string, MoveSpec>();
    for (const path of focusList(side)) {
      if (!Ls || !Ls.pos.has(epdAfter(path))) continue;
      const way = new Map<string, string>();
      let e = START_EPD;
      for (const u of path) { way.set(e, u); e = child(e, u); }
      for (const s of newMoveSpecs) if (s.side === side && way.get(s.epd) === s.move) seen.set(s.id, s);
      for (const s of subtreeNew(side, path)) seen.set(s.id, s);
    }
    return [...seen.values()].sort((a, b) => b.prob - a.prob || a.ply - b.ply);
  });
  const out: MoveSpec[] = [];
  for (let i = 0; i < Math.max(per[0].length, per[1].length); i++) for (const p of per) if (p[i]) out.push(p[i]);
  return out;
}

/** One Learn round: 5 new moves shown Learn style, then quizzed in their lines. */
export function learnRound(side: Side, path: string[]): Item[] {
  const specs = subtreeNew(side, path).slice(0, 5);
  const intro = specs.map((s) => newMoveItem(s));
  const quiz = specs.map((s) => { const it = lineItem(s.side, [...pathTo(L[s.side]!, s.epd), s.move], new Set()); it.prompt = 'Your move'; return it; });
  return [...intro, ...quiz];
}

/** Drill's "Learn these": missed positions in your lines that are not cards yet, Learn style. */
export function learnItemsFor(missed: { side: Side; epd: string; uci: string }[]): Item[] {
  const out: Item[] = [];
  for (const m of missed) {
    const spec = L[m.side]?.cards.get(moveId(m.side, m.epd, m.uci));
    if (spec && !cards.has(spec.id)) out.push(newMoveItem(spec));
  }
  return out;
}

/** Traps and puzzles that start in a subtree. */
export function subtreeTraps(side: Side, path: string[]) {
  if (!D) return { punish: [] as Trap[], danger: [] as Trap[], puzzles: [] as Puzzle[] };
  const Ls = L[side];
  const at = epdAfter(path);
  const under = new Set<string>();
  if (Ls?.pos.has(at)) {
    for (const p of Ls.pos.values()) {
      let q: Pos | undefined = p;
      while (q) { if (q.epd === at) { under.add(p.epd); break; } q = q.parent ? Ls.pos.get(q.parent) : undefined; }
    }
  } else {
    // outside your lines: walk the tree below this position (your side plays its default)
    const seen = new Set<string>();
    const walk = (e: string, d: number) => {
      if (seen.has(e) || d > 30 || !D!.tree[e]) return;
      seen.add(e); under.add(e);
      for (const [u, g] of D!.tree[e].m) if (g >= 50 && g / D!.tree[e].g >= 0.03) walk(child(e, u), d + 1);
    };
    walk(at, 0);
  }
  const ts = D.traps.filter((t) => t.side === side && under.has(t.epd));
  const o = D.tree[at]?.o;
  const fam = o !== undefined ? D.openings[o].family : null;
  const puzzles = fam && path.length >= 3 ? D.puzzles.filter((p) => (p.fen.split(' ')[1] === 'w' ? 'b' : 'w') === side && p.families.some((f) => D!.openings[f]?.family === fam)) : [];
  return { punish: ts.filter((t) => t.kind === 'punish'), danger: ts.filter((t) => t.kind === 'danger'), puzzles };
}

export const trapPreview = (t: Trap) => trapItem(t, 't' + t.id, false);
export const puzzlePreview = (p: Puzzle) => puzzleItem(p, 'z' + p.id, false);

/** Drill: a line from `path`, opponent replies drawn by frequency (or evenly with Rare replies). */
export function drillLine(side: Side, path: string[], rare: boolean): Item | null {
  if (!D) return null;
  let e = epdAfter(path);
  const moves: string[] = [];
  const asks: Record<number, Ask> = {};
  const limit = depthLimit();
  let mineCount = 0;
  { let x = START_EPD; for (const u of path) { if (turnOf(x) === side) mineCount++; x = child(x, u); } }
  for (let guard = 0; guard < 60 && mineCount < limit; guard++) {
    if (!reached(side, e)) break;
    if (turnOf(e) === side) {
      const ms = movesAt(side, e);
      if (!ms.length) break;
      asks[moves.length] = { accepted: ms, other: undefined };
      moves.push(ms[0]); mineCount++;
      e = child(e, ms[0]);
    } else {
      const rs = oppReplies(side, e, path.length + moves.length);
      if (!rs.length) break;
      let r = Math.random() * (rare ? rs.length : rs.reduce((s, x) => s + x[1], 0));
      let pick = rs[0][0];
      for (const [u, f] of rs) { r -= rare ? 1 : f; if (r <= 0) { pick = u; break; } }
      moves.push(pick);
      e = child(e, pick);
    }
  }
  if (!Object.keys(asks).length) return null;
  return {
    kind: 'drill', side, start: START_EPD, setup: path, moves, asks, prompt: 'Your move',
    label: labelOf(epdAfter(path), path), order: moveOrder(sans(path), true), drill: { depth: limit, rare }
  };
}
export function drillTrapItems(side: Side, path: string[]): Item[] {
  const s = subtreeTraps(side, path);
  const ts = [...s.punish, ...s.danger].map((t) => trapItem(t, 't' + t.id, false));
  const ps = s.puzzles.slice(0, 20).map((p) => puzzleItem(p, 'z' + p.id, false));
  return shuffle([...ts, ...ps]).map((i) => ({ ...i, card: undefined, intro: undefined }));
}
function shuffle<T>(a: T[]): T[] { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/** Drill continuation after you picked a different one of your moves. */
export function drillContinue(side: Side, epd: string, rare: boolean, movesSoFar: number): string[] {
  const out: string[] = [];
  let e = epd;
  let mineCount = movesSoFar;
  for (let g = 0; g < 60 && mineCount < depthLimit(); g++) {
    if (!reached(side, e)) break;
    if (turnOf(e) === side) { const ms = movesAt(side, e); if (!ms.length) break; out.push(ms[0]); e = child(e, ms[0]); mineCount++; }
    else {
      const rs = oppReplies(side, e);
      if (!rs.length) break;
      let r = Math.random() * (rare ? rs.length : rs.reduce((s, x) => s + x[1], 0));
      let pick = rs[0][0];
      for (const [u, f] of rs) { r -= rare ? 1 : f; if (r <= 0) { pick = u; break; } }
      out.push(pick); e = child(e, pick);
    }
  }
  return out;
}

// ---------------------------------------------------------------- grading
export interface Applied { rating: number; due: number | null; undo: () => Promise<void> }

function newCardRow(item: Item, id: string, type: CardType, epd: string, move: string, now: Date): CardRow {
  const path = type === 'move' ? (L[item.side]?.pos.has(epd) ? pathTo(L[item.side]!, epd) : []) : item.setup;
  return {
    id, type, side: item.side, epd, move, answer: [], line: [], label: labelOf(epd, path), path, source: item.source,
    fsrs: createEmptyCard(now), due: +now, suspended: 0, created: +now, lapses: 0, opening: openingAt(epd, path)?.id
  };
}

async function review(c: CardRow, rating: Rating.Again | Rating.Hard | Rating.Good, ms: number, mode: Mode, now: Date, log: { card: CardRow; prev: CardRow | null; rid: number }[]) {
  const prev = cards.has(c.id) ? (structuredClone($state.snapshot(c)) as CardRow) : null;
  const stage = stageOf(c.fsrs);
  const next: Card = grade(c.fsrs, rating, now, app.retention / 100);
  c.fsrs = next;
  c.due = +next.due;
  if (rating === Rating.Again && stage !== 'new') c.lapses++;
  c.suspended = 0;
  cards.set(c.id, c);
  await db.cards.put($state.snapshot(c) as CardRow);
  const r: ReviewRow = { cardId: c.id, at: +now, rating, ms: Math.round(ms), mode, stage, prev: prev?.fsrs ?? null };
  const rid = await db.reviews.add(r);
  r.id = rid;
  reviewsToday.push(r);
  log.push({ card: c, prev, rid });
}

// ---------------------------------------------------------------- Arcade
// An endless stream of single positions that never touches the cards: puzzles from your openings,
// traps, the mistakes from your games and book moves from your repertoire. It has its own rating,
// and a position you miss comes back until you get it right (a trap has to be solved twice).
// The memory lives in the `settings` table (key "arcade"), so it is in every backup.
const ARC_KEY = 'arcade';
/** where the memory lived before backup format 2: outside IndexedDB, and so outside the backup */
const ARC_LEGACY = 'ply-arcade-v1';
type ArcMem = ArcadeMemory;
const emptyArc = (): ArcMem => ({ miss: {}, recent: [] });
let arcMem: ArcMem = emptyArc();
async function loadArcade() {
  const row = await db.settings.get(ARC_KEY);
  if (row?.value) { arcMem = { ...emptyArc(), ...(row.value as Partial<ArcMem>) }; return; }
  arcMem = emptyArc();
  let legacy: string | null = null;
  try { legacy = localStorage.getItem(ARC_LEGACY); } catch { /* private mode */ }
  if (!legacy) return;
  try { arcMem = { ...emptyArc(), ...JSON.parse(legacy) }; } catch { return; }
  await db.settings.put({ key: ARC_KEY, value: arcMem });
  try { localStorage.removeItem(ARC_LEGACY); } catch { /* private mode */ }
}
function arcLoad(): ArcMem { return structuredClone(arcMem); }
function arcSave(m: ArcMem) {
  arcMem = { miss: Object.fromEntries(Object.entries(m.miss).slice(-200)), recent: m.recent.slice(-600) };
  void db.settings.put({ key: ARC_KEY, value: structuredClone(arcMem) });
}
/** The stored Arcade memory (tests, backup checks). */
export const arcadeMemory = (): ArcMem => structuredClone(arcMem);
export interface ArcadeResult { clean: boolean; delta: number; rating: number; streak: number; /** it was a position you had missed before */ back: boolean; /** it will come back */ returns: boolean }
export interface Arcade { next: () => Item[]; result: (it: Item, clean: boolean) => ArcadeResult }

function bookItem(s: MoveSpec): Item {
  const path = pathTo(L[s.side]!, s.epd);
  const known = cards.has(s.id);
  return {
    kind: 'drill', side: s.side, start: START_EPD, setup: path, moves: [s.move], asks: { 0: { accepted: Array.from(new Set([s.move, ...movesAt(s.side, s.epd)])) } },
    prompt: known ? 'Your book move' : 'Guess the book move', label: labelOf(s.epd, path), order: moveOrder(sans(path), true),
    source: known ? 'From your repertoire' : 'From your repertoire · not learned yet', note: noteAt(s.side, s.epd)
  };
}

export function arcade(): Arcade {
  const mem = arcLoad();
  const recent = new Set(mem.recent);
  let count = 0, streak = 0, turn = 0;
  // what you missed last time comes back early in this sitting
  const later = Object.keys(mem.miss).slice(-10).map((key, i) => ({ key, at: 2 + i * 3 }));
  const pick = <T>(a: T[]): T | undefined => a[Math.floor(Math.random() * a.length)];

  const fam: Record<Side, Set<string>> = { w: new Set(), b: new Set() };
  for (const side of ['w', 'b'] as Side[]) for (const e of L[side]?.pos.keys() ?? []) { const o = D?.tree[e]?.o; if (o !== undefined) fam[side].add(D!.openings[o].family); }
  const own = (D?.puzzles ?? []).filter((p) => p.families.some((id) => fam[p.fen.split(' ')[1] === 'w' ? 'b' : 'w'].has(D!.openings[id]?.family)));
  const puzzles = own.length > 400 ? own : D?.puzzles ?? [];
  const traps = (D?.traps ?? []).filter((t) => L[t.side]?.pos.has(t.epd) && turnOf(t.epd) === t.side && (t.kind !== 'danger' || (movesAt(t.side, t.epd).length > 0 && !movesAt(t.side, t.epd).includes(t.bait!))));
  const specs = (['w', 'b'] as Side[]).flatMap((side) => [...(L[side]?.cards.values() ?? [])]);

  const bare = (it: Item, key: string, level: number): Item => ({ ...it, card: undefined, intro: undefined, today: undefined, arcade: { key, level } });
  /** the position behind a key: z puzzle, t trap, k mistake card, m book move */
  function make(key: string): Item | null {
    const id = key.slice(2);
    if (key[0] === 'z') { const p = puzzleById.get(id); return p ? bare(puzzleItem(p, 'z' + id, false), key, p.rating) : null; }
    if (key[0] === 't') { const t = trapById.get(id); if (!t) return null; const it = trapItem(t, 't' + id, false); return bare(it, key, t.kind === 'danger' ? 1000 : 850 + 60 * (Object.keys(it.asks).length - 1)); }
    if (key[0] === 'k') { const c = cards.get(id); return c && c.type === 'mistake' ? bare(mistakeItem(c), key, 1100) : null; }
    const s = L[id[0] as Side]?.cards.get(id.slice(2));
    return s ? bare(bookItem(s), key, cards.has(s.id) ? 700 : 1250) : null;
  }
  const fresh = (keys: string[]) => { const f = keys.filter((k) => !recent.has(k)); return pick(f.length ? f : keys); };
  function draw(kind: string): string | undefined {
    if (kind === 't') {
      // weighted by how often the position and the move behind the trap turn up in your games
      const left = traps.filter((t) => !recent.has('t:' + t.id));
      const pool = left.length ? left : traps;
      const w = pool.map((t) => (L[t.side]?.pos.get(t.epd)?.prob ?? 0) * t.freq + 1e-9);
      let r = Math.random() * w.reduce((a, b) => a + b, 0);
      for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return 't:' + pool[i].id; }
      return pool.length ? 't:' + pool[0].id : undefined;
    }
    if (kind === 'k') return fresh([...cards.values()].filter((c) => c.type === 'mistake' && !c.suspended).map((c) => 'k:' + c.id));
    if (kind === 'm') {
      const known = specs.filter((s) => cards.has(s.id));
      // an unlearned one comes from the moves Today will teach next
      const soon = specs.filter((s) => !cards.has(s.id)).sort((a, b) => b.prob - a.prob || a.ply - b.ply).slice(0, 30);
      return fresh((known.length && Math.random() < 0.5 ? known : soon.length ? soon : known).map((s) => `m:${s.side}:${s.id}`));
    }
    // a puzzle near your arcade rating, widening until there is a choice
    for (const w of [90, 180, 360, 4000]) {
      const c = puzzles.filter((p) => Math.abs(p.rating - app.arcadeRating) <= w && !recent.has('z:' + p.id));
      if (c.length >= 8 || w === 4000) return c.length ? 'z:' + pick(c)!.id : fresh(puzzles.map((p) => 'z:' + p.id));
    }
  }
  const ORDER = ['z', 't', 'z', 'k', 'z', 'm'];
  return {
    next() {
      const out: Item[] = [];
      for (let n = 0; n < 3; n++) {
        // at most one returning position in three, so new ones keep coming
        const due = out.some((o) => o.arcade!.back) ? -1 : later.findIndex((l) => l.at <= count + out.length);
        let key: string | undefined, back = false;
        if (due >= 0) { key = later.splice(due, 1)[0].key; back = true; }
        else key = draw(ORDER[turn++ % ORDER.length]) ?? draw('z');
        const it = key ? make(key) : null;
        if (!it) { if (back) delete mem.miss[key!]; continue; }
        it.arcade!.back = back;
        recent.add(key!); mem.recent.push(key!);
        out.push(it);
      }
      arcSave(mem);
      return out;
    },
    result(it, clean) {
      const a = it.arcade!;
      count++;
      let delta = 0;
      // a position that came back is practice: it no longer moves the rating
      if (!a.back) {
        const expected = 1 / (1 + 10 ** ((a.level - app.arcadeRating) / 400));
        delta = Math.round((app.arcadeSolved + app.arcadeMissed < 30 ? 32 : 16) * ((clean ? 1 : 0) - expected));
        delta = clean ? Math.max(1, delta) : Math.min(-1, delta);
        app.arcadeRating = Math.max(100, app.arcadeRating + delta);
      }
      streak = clean ? streak + 1 : 0;
      if (clean) app.arcadeSolved++; else app.arcadeMissed++;
      app.arcadeBest = Math.max(app.arcadeBest, streak);
      let returns = false;
      if (!clean) {
        mem.miss[a.key] = Math.max(mem.miss[a.key] ?? 0, a.key[0] === 't' ? 2 : 1);
        later.push({ key: a.key, at: count + (a.key[0] === 't' ? 4 : 7) });
        returns = true;
      } else if (a.back) {
        const left = (mem.miss[a.key] ?? 1) - 1;
        if (left > 0) { mem.miss[a.key] = left; later.push({ key: a.key, at: count + 10 }); returns = true; }
        else delete mem.miss[a.key];
      }
      save();
      arcSave(mem);
      return { clean, delta, rating: app.arcadeRating, streak, back: !!a.back, returns };
    }
  };
}

/** Apply one finished item to the schedule. Drill never gets here. */
export async function applyOutcome(o: Outcome, mode: Mode): Promise<Applied> {
  const now = new Date();
  const it = o.item;
  const log: { card: CardRow; prev: CardRow | null; rid: number }[] = [];
  let shown = Rating.Good as number;
  let due: number | null = null;
  if (it.card) {
    // single card: any wrong move gives Again; time is the average per move
    const rs = Object.values(o.results);
    const r = rate({ wrong: rs.some((x) => x.wrong), hinted: rs.some((x) => x.hinted), playable: false, times: rs.map((x) => x.ms) }, app.hardSeconds);
    let c = cards.get(it.card);
    if (!c && it.intro) c = introCard(it, now);
    if (c) { await review(c, r, rs.reduce((s, x) => s + x.ms, 0), mode, now, log); shown = r; due = c.due; }
  } else {
    let worst = 0;
    for (const [k, a] of Object.entries(it.asks)) {
      const res = o.results[+k];
      if (!res || !a.card) continue;
      let c = cards.get(a.card);
      if (a.intro) {
        // a new move enters learning step 1
        if (!c) c = newCardRow(it, a.card, 'move', res.epd, res.uci, now);
        await review(c, Rating.Again, res.ms, mode, now, log);
        due = c.due; shown = 0;
        continue;
      }
      if (!c) continue;
      if (res.wrong) { await review(c, Rating.Again, res.ms, mode, now, log); worst = Math.max(worst, 3); due = c.due; continue; }
      if (!a.graded) continue;
      const r = rate({ wrong: false, hinted: res.hinted, playable: res.playable, times: [res.ms] }, app.hardSeconds);
      await review(c, r, res.ms, mode, now, log);
      const sev = r === Rating.Hard ? 2 : 1;
      if (sev > worst || due === null) due = c.due;
      worst = Math.max(worst, sev);
    }
    if (shown !== 0) shown = worst === 3 ? Rating.Again : worst === 2 ? Rating.Hard : Rating.Good;
  }
  newMoveSpecs = newMoveSpecs.filter((s) => !cards.has(s.id));
  newTrapSpecs = newTrapSpecs.filter((s) => !cards.has(s.id));
  bump();
  return {
    rating: shown, due,
    undo: async () => {
      for (const l of [...log].reverse()) {
        await db.reviews.delete(l.rid);
        reviewsToday = reviewsToday.filter((r) => r.id !== l.rid);
        if (l.prev) { cards.set(l.prev.id, l.prev); await db.cards.put(l.prev); }
        else { cards.delete(l.card.id); await db.cards.delete(l.card.id); }
      }
      regenerateCandidates();
      bump();
    }
  };
}

function regenerateCandidates() {
  newMoveSpecs = [...(L.w?.cards.values() ?? []), ...(L.b?.cards.values() ?? [])].filter((s) => !cards.has(s.id));
  newTrapSpecs = trapCandidates().filter((t) => !cards.has(t.id));
}

function introCard(it: Item, now: Date): CardRow | undefined {
  if (!it.intro || !it.card) return;
  if (it.intro.kind === 'trap') {
    const t = trapById.get(it.intro.ref);
    if (!t) return;
    const c = newCardRow(it, it.card, t.kind, t.epd, it.moves[0], now);
    Object.assign(c, { answer: it.moves.filter((_, i) => i % 2 === 0), line: it.moves, bait: t.bait, refute: t.refute, ref: t.id, opening: t.o, source: it.source });
    return c;
  }
  const p = puzzleById.get(it.intro.ref);
  if (!p) return;
  const g = new Chess(p.fen);
  g.move({ from: p.moves[0].slice(0, 2), to: p.moves[0].slice(2, 4), promotion: p.moves[0][4] });
  const after = epdOf(g);
  const c = newCardRow(it, it.card, 'puzzle', after, p.moves[1], now);
  Object.assign(c, { answer: p.moves.filter((_, i) => i % 2 === 1), line: p.moves, fen: p.fen, ref: p.id, label: it.label, source: it.source });
  return c;
}

/** Drill summary: Mark missed as Again (existing cards only). */
export async function markAgain(missed: { side: Side; epd: string; uci: string }[]) {
  const now = new Date();
  const log: { card: CardRow; prev: CardRow | null; rid: number }[] = [];
  for (const m of missed) {
    const c = cards.get(moveId(m.side, m.epd, m.uci));
    if (c) await review(c, Rating.Again, 0, 'drill-again', now, log);
  }
  bump();
  return log.length;
}
export const isCard = (side: Side, epd: string, uci: string) => cards.has(moveId(side, epd, uci));

// ---------------------------------------------------------------- per-move stage (Explorer, Repertoire)
export function stageAt(side: Side, epd: string, uci: string): Stage | null {
  const c = cards.get(moveId(side, epd, uci));
  if (!c) return L[side]?.cards.has(moveId(side, epd, uci)) ? 'new' : null;
  return c.suspended ? null : stageOf(c.fsrs);
}

// ---------------------------------------------------------------- repertoire summary
export interface OpeningSummary {
  key: string;
  section: Section;
  side: Side;
  family: string;
  name: string;
  eco: string;
  path: string[];
  lines: number;
  learned: number;
  total: number;
  coverage: number;
  stages: [number, number, number, number];
}

export function summaries(): OpeningSummary[] {
  void model.rev;
  if (!D || !ctx) return [];
  const out = new Map<string, OpeningSummary>();
  for (const side of ['w', 'b'] as Side[]) {
    const Ls = L[side];
    if (!Ls) continue;
    const fams = new Map<string, string>();
    const famOf = (e: string): string => {
      const hit = fams.get(e);
      if (hit) return hit;
      const o = D!.tree[e]?.o;
      // a position past the band's tree (your own lines) belongs to the opening it came from
      const parent = o === undefined ? Ls.pos.get(e)?.parent : null;
      const f = o !== undefined ? D!.openings[o].family : parent ? famOf(parent) : 'First moves';
      fams.set(e, f);
      return f;
    };
    const entry = new Map<string, Pos>();
    for (const p of Ls.pos.values()) {
      const sec = sectionOf(side, p.root);
      const k = sec + '|' + famOf(p.epd);
      const cur = entry.get(k);
      if (!cur || p.ply < cur.ply || (p.ply === cur.ply && p.prob > cur.prob)) entry.set(k, p);
    }
    for (const [k, p] of entry) {
      const [sec, fam] = k.split('|') as [Section, string];
      if (sec !== 'White' && p.ply === 0) continue;
      const path = pathTo(Ls, p.epd);
      const o = openingAt(p.epd, path);
      out.set(k, { key: k, section: sec, side, family: fam, name: fam === 'First moves' ? 'First moves' : o?.family ?? fam, eco: o?.eco ?? '', path, lines: 0, learned: 0, total: 0, coverage: 0, stages: [0, 0, 0, 0] });
    }
    for (const s of Ls.cards.values()) {
      const p = Ls.pos.get(s.epd)!;
      const g = out.get(sectionOf(side, p.root) + '|' + famOf(s.epd));
      if (!g) continue;
      g.total++;
      const st = stageAt(side, s.epd, s.move) ?? 'new';
      g.stages[['new', 'learning', 'young', 'mature'].indexOf(st)]++;
      if (st !== 'new') g.learned++;
    }
    for (const e of Ls.leaves) {
      const p = Ls.pos.get(e)!;
      const g = out.get(sectionOf(side, p.root) + '|' + famOf(e));
      if (g) g.lines++;
    }
    for (const g of out.values()) {
      if (g.side !== side) continue;
      const p = Ls.pos.get(epdAfter(g.path))!;
      g.coverage = Math.round(coverage(ctx, mine, genOpts(side), p.epd, p.mine, p.ply) * 100);
    }
  }
  return [...out.values()].filter((g) => g.total > 0 || g.lines > 0).sort((a, b) => b.total - a.total);
}

/** Section coverage (share of games through your depth) */
export function sectionCoverage(side: Side): number {
  if (!ctx) return 0;
  return coverage(ctx, mine, genOpts(side));
}

// ---------------------------------------------------------------- opening skill tree
export interface TreeMove {
  /** position before the move */
  epd: string;
  /** moves from the start to `epd` */
  path: string[];
  uci: string;
  san: string;
  ply: number;
  mine: boolean;
  /** opponent replies: share of games at the parent position */
  freq: number;
  /** line probability after this move */
  prob: number;
  stage: Stage | null;
  lapses: number;
  /** the move leads into a position your lines reach by another move order */
  joins?: boolean;
  children: TreeMove[];
  /** totals for this move and everything below it (your moves only) */
  sum: { total: number; stages: [number, number, number, number]; lapses: number };
}

/** Your lines below a position as a tree of moves, with mastery totals per branch. */
export function openingTree(side: Side, path: string[]): TreeMove[] {
  void model.rev;
  const Ls = L[side];
  if (!Ls) return [];
  const STAGES: Stage[] = ['new', 'learning', 'young', 'mature'];
  const opts = genOpts(side);
  // every move your lines play from a position: your moves, or the replies above the threshold
  const movesFrom = (epd: string, ply: number): [string, number][] => {
    const p = Ls.pos.get(epd);
    if (!p || p.mine >= Ls.depth || !reached(side, epd)) return [];
    if (turnOf(epd) === side) return (p.moves ?? []).map((u) => [u, 1] as [string, number]);
    return lineReplies(ctx!, bookAt, side, epd, ply === 0 ? opts.rootPct! : opts.replyPct, opts.minGames!).filter(([u]) => Ls.pos.has(child(epd, u)));
  };
  const build = (epd: string, at: string[], ply: number, prob: number): TreeMove[] =>
    movesFrom(epd, ply).map(([u, f]) => {
      const mine = turnOf(epd) === side;
      const st = mine ? stageAt(side, epd, u) ?? 'new' : null;
      const c = mine ? cards.get(moveId(side, epd, u)) : undefined;
      const next = [...at, u];
      const q = Ls.pos.get(child(epd, u))!;
      // follow a position only from its most probable parent; elsewhere it is a leaf that joins another line
      const joins = q.parent !== epd || q.via !== u;
      const children = joins ? [] : build(q.epd, next, ply + 1, q.prob);
      const sum = { total: 0, stages: [0, 0, 0, 0] as [number, number, number, number], lapses: 0 };
      if (st) { sum.total++; sum.stages[STAGES.indexOf(st)]++; sum.lapses += c?.lapses ?? 0; }
      for (const ch of children) { sum.total += ch.sum.total; ch.sum.stages.forEach((n, i) => (sum.stages[i] += n)); sum.lapses += ch.sum.lapses; }
      return { epd, path: at, uci: u, san: san(epd, u), ply, mine, freq: f, prob: prob * f, stage: st, lapses: c?.lapses ?? 0, joins, children, sum };
    }).sort((a, b) => b.prob - a.prob);
  const start = epdAfter(path);
  const p = Ls.pos.get(start);
  return p ? build(start, path, path.length, p.prob) : [];
}

/** The name a branch is known by: the first opening name along its main line that differs from where it split. */
export function branchName(m: TreeMove, parentName: string): [eco: string, name: string] {
  let cur: TreeMove | undefined = m;
  let first: [string, string] | null = null;
  for (let i = 0; cur && i < 16; i++) {
    const after = child(cur.epd, cur.uci);
    const nm = nameOf(after, [...cur.path, cur.uci]);
    first ??= nm;
    if (nm[1] !== parentName) return nm;
    cur = cur.children[0];
  }
  return first ?? ['', parentName];
}

// ---------------------------------------------------------------- reviews (Stats)
export const reviewsSince = (t: number) => db.reviews.where('at').aboveOrEqual(t).toArray();

// ---------------------------------------------------------------- band growth
/** Called after each sync with the chess.com rapid rating. */
export async function noteRating(rating: number) {
  const depthBefore = depthLimit();
  app.rating = rating;
  // the first rating sets the band at once; later changes must hold for 7 days
  if (!app.bandSet && app.band < 1000) {
    app.bandSet = true; app.pendingBand = 0;
    const b = bandFor(rating);
    if (b !== app.autoBand) {
      app.autoBand = b;
      save();
      await switchBand(b);
      model.notice = `Your lines now follow what ${b} players play (chess.com rapid ${rating} + 350).`;
      return;
    }
    save();
  }
  // crossing 1000 / 1300 / 1600 deepens the lines; the deeper moves join the new-moves queue
  if (depthLimit() !== depthBefore) {
    regenerate();
    model.notice = `Your lines now go ${depthLimit()} moves deep.`;
  }
  const b = bandFor(rating);
  if (app.band >= 1000) { save(); return; } // locked
  if (b === app.autoBand) { app.pendingBand = 0; app.pendingSince = 0; save(); return; }
  if (app.pendingBand !== b) { app.pendingBand = b; app.pendingSince = Date.now(); save(); return; }
  if (Date.now() - app.pendingSince >= 7 * 864e5) {
    app.autoBand = b; app.pendingBand = 0;
    save();
    await switchBand(b);
    model.notice = `Your rating has held at the ${b} band for a week. Lines now follow what ${b} players play.`;
  } else save();
}

// ---------------------------------------------------------------- reset / backup support
export async function reloadFromDb() { if (D) await loadAll(model.band); }
export async function resetAllProgress() {
  await db.transaction('rw', [db.cards, db.reviews, db.repertoire, db.games, db.settings, db.book], async () => {
    await Promise.all([db.cards.clear(), db.reviews.clear(), db.repertoire.clear(), db.games.clear(), db.settings.clear(), db.book.clear()]);
  });
  cards.clear(); rep.clear(); book.clear(); reviewsToday = []; arcMem = emptyArc();
}
export { hashId, fenOf };
