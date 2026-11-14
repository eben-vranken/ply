// The Today queue (docs/BRIEF.md, "Daily queue" and "Reviewing move cards as lines").
// Pure: everything it needs comes in as arguments, so it is unit tested.
import type { CardRow } from '../db';
import { START_EPD, child, type Side } from '../chess';
import type { Lines, MoveSpec } from './lines';
import { pathTo } from './lines';

export interface Limits {
  newMoves: number;
  newTraps: number;
  newMistakes: number;
  maxReviews: number;
}

export interface DoneToday {
  newMoves: number;
  newTraps: number;
  newMistakes: number;
  reviews: number;
}

/** A trap or puzzle not yet introduced. */
export interface TrapSpec {
  id: string;
  type: 'punish' | 'danger' | 'puzzle';
  /** frequency × loss for traps, play count for puzzles */
  score: number;
}

export type QItem =
  | { kind: 'line'; side: Side; path: string[]; /** due cards on this line, ply-ordered */ due: string[] }
  | { kind: 'new'; spec: MoveSpec; path: string[] }
  | { kind: 'card'; card: CardRow }
  | { kind: 'newtrap'; spec: TrapSpec };

export interface QueueInput {
  now: number;
  cards: CardRow[];
  lines: Partial<Record<Side, Lines>>;
  newMoves: MoveSpec[];
  newTraps: TrapSpec[];
  limits: Limits;
  done: DoneToday;
  /** extra new moves granted today beyond the limit */
  extraNew?: number;
  /** current retrievability for a card (lower goes first when over the review limit) */
  retrievability: (c: CardRow) => number;
}

const isTrap = (c: CardRow) => c.type === 'punish' || c.type === 'danger' || c.type === 'puzzle';
const isNew = (c: CardRow) => c.fsrs.state === 0;

/**
 * Group due Move cards into lines: take the deepest due card, the most probable
 * line reaching it, and every other due card on that path. The line ends after
 * your move at its deepest due card.
 */
export function groupLines(due: CardRow[], lines: Partial<Record<Side, Lines>>): QItem[] {
  const left = new Map(due.map((c) => [c.id, c]));
  const out: QItem[] = [];
  const plyOf = (c: CardRow) => lines[c.side]?.pos.get(c.epd)?.ply ?? c.path?.length ?? 0;
  const order = [...due].sort((a, b) => plyOf(b) - plyOf(a) || a.id.localeCompare(b.id));
  for (const deep of order) {
    if (!left.has(deep.id)) continue;
    const L = lines[deep.side];
    const inLines = L?.pos.has(deep.epd);
    const prefix = inLines ? pathTo(L!, deep.epd) : (deep.path ?? []);
    const path = [...prefix, deep.move];
    // other due cards whose (position, move) lies on this path
    const onPath: string[] = [];
    const byPos = new Map<string, CardRow[]>();
    for (const c of left.values()) if (c.side === deep.side) (byPos.get(c.epd) ?? byPos.set(c.epd, []).get(c.epd)!).push(c);
    const epds = epdsAlong(path);
    for (let i = 0; i < path.length; i++) {
      for (const c of byPos.get(epds[i]) ?? []) if (c.move === path[i]) onPath.push(c.id);
    }
    for (const id of onPath) left.delete(id);
    left.delete(deep.id);
    out.push({ kind: 'line', side: deep.side, path, due: onPath.includes(deep.id) ? onPath : [...onPath, deep.id] });
  }
  return out;
}

function epdsAlong(path: string[]): string[] {
  const out = [START_EPD];
  for (let i = 0; i < path.length - 1; i++) out.push(child(out[i], path[i]));
  return out;
}

export function buildQueue(q: QueueInput): QItem[] {
  const active = q.cards.filter((c) => !c.suspended);
  // due reviews, all types, capped by the daily review limit (lowest retrievability first)
  let due = active.filter((c) => !isNew(c) && c.due <= q.now);
  const room = Math.max(0, q.limits.maxReviews - q.done.reviews);
  if (due.length > room) due = [...due].sort((a, b) => q.retrievability(a) - q.retrievability(b)).slice(0, room);

  const items: QItem[] = [];
  // 1. due Mistake cards
  for (const c of due.filter((c) => c.type === 'mistake').sort((a, b) => a.due - b.due)) items.push({ kind: 'card', card: c });
  // 2. due Move cards, as lines
  items.push(...groupLines(due.filter((c) => c.type === 'move'), q.lines));
  // 3. due Punish, Danger and Puzzle cards
  for (const c of due.filter(isTrap).sort((a, b) => a.due - b.due)) items.push({ kind: 'card', card: c });
  // 4. new Move cards, highest line probability first
  const nm = Math.max(0, q.limits.newMoves - q.done.newMoves) + (q.extraNew ?? 0);
  for (const s of [...q.newMoves].sort((a, b) => b.prob - a.prob || a.ply - b.ply).slice(0, nm)) {
    const L = q.lines[s.side];
    items.push({ kind: 'new', spec: s, path: L ? pathTo(L, s.epd) : [] });
  }
  // 5. new traps: Punish and Danger by frequency × loss, then Puzzles by play count
  const nt = Math.max(0, q.limits.newTraps - q.done.newTraps);
  const traps = q.newTraps.filter((t) => t.type !== 'puzzle').sort((a, b) => b.score - a.score);
  const puzzles = q.newTraps.filter((t) => t.type === 'puzzle').sort((a, b) => b.score - a.score);
  for (const t of [...traps, ...puzzles].slice(0, nt)) items.push({ kind: 'newtrap', spec: t });
  // 6. new Mistake cards, newest game first
  const nk = Math.max(0, q.limits.newMistakes - q.done.newMistakes);
  for (const c of active.filter((c) => c.type === 'mistake' && isNew(c)).sort((a, b) => b.created - a.created).slice(0, nk)) items.push({ kind: 'card', card: c });
  return items;
}

/** Start of the current study day (rollover hour, local time). */
export function dayStart(now: number, rollover: number): number {
  const d = new Date(now);
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), rollover).getTime();
  return now >= s ? s : s - 864e5;
}
