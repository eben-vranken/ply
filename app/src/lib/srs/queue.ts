// The Today queue (docs/BRIEF.md, "Daily queue" and "Reviewing move cards as lines").
// Pure: everything it needs comes in as arguments, so it is unit tested.
import type { CardRow } from '../db';
import { START_EPD, child, type Side } from '../chess';
import type { Lines, MoveSpec } from './lines';
import { pathTo, otherOrders } from './lines';

export interface Limits {
  newMoves: number;
  newTraps: number;
  maxReviews: number;
}

export interface DoneToday {
  newMoves: number;
  newTraps: number;
  reviews: number;
}

/** A trap not yet introduced. */
export interface TrapSpec {
  id: string;
  type: 'punish' | 'danger';
  /** frequency × loss */
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
  /** unlearned moves of the focus openings, in the order to teach them; they get half of the day's new moves */
  focus?: MoveSpec[];
  newTraps: TrapSpec[];
  limits: Limits;
  done: DoneToday;
  /** extra new moves granted today beyond the limit */
  extraNew?: number;
  /** current retrievability for a card (lower goes first when over the review limit) */
  retrievability: (c: CardRow) => number;
}

/** Below this retrievability a card that is not due yet counts as nearly due. */
export const NEAR_R = 0.95;

const isTrap = (c: CardRow) => c.type === 'punish' || c.type === 'danger';
const isNew = (c: CardRow) => c.fsrs.state === 0;

/**
 * Group due Move cards into lines: take the deepest due card, the most probable
 * line reaching it, and every other due card on that path. The line ends after
 * your move at its deepest due card.
 */
export function groupLines(due: CardRow[], lines: Partial<Record<Side, Lines>>, near: CardRow[] = []): QItem[] {
  const left = new Map(due.map((c) => [c.id, c]));
  const nearKeys = new Set(near.map((c) => c.side + c.epd + c.move));
  const out: QItem[] = [];
  const plyOf = (c: CardRow) => lines[c.side]?.pos.get(c.epd)?.ply ?? c.path?.length ?? 0;
  const order = [...due].sort((a, b) => plyOf(b) - plyOf(a) || a.id.localeCompare(b.id));
  for (const deep of order) {
    if (!left.has(deep.id)) continue;
    const L = lines[deep.side];
    const inLines = L?.pos.has(deep.epd);
    const byPos = new Map<string, CardRow[]>();
    for (const c of left.values()) if (c.side === deep.side) (byPos.get(c.epd) ?? byPos.set(c.epd, []).get(c.epd)!).push(c);
    // other due cards whose (position, move) lies on a path
    const dueOn = (path: string[], epds: string[]) => {
      const ids: string[] = [];
      for (let i = 0; i < path.length; i++) for (const c of byPos.get(epds[i]) ?? []) if (c.move === path[i]) ids.push(c.id);
      return ids;
    };
    const nearOn = (path: string[], epds: string[]) => path.reduce((n, u, i) => n + (nearKeys.has(deep.side + epds[i] + u) ? 1 : 0), 0);
    // where the position has other move orders, take the one through the most due cards, then the most
    // nearly due ones (they are credited on the way), then the most probable (the first)
    const prefixes = inLines ? [pathTo(L!, deep.epd), ...otherOrders(L!, deep.epd)] : [deep.path ?? []];
    let best: { path: string[]; onPath: string[]; near: number } | null = null;
    for (const pre of prefixes) {
      const path = [...pre, deep.move];
      const epds = epdsAlong(path);
      const cand = { path, onPath: dueOn(path, epds), near: nearOn(path, epds) };
      if (!best || cand.onPath.length > best.onPath.length || (cand.onPath.length === best.onPath.length && cand.near > best.near)) best = cand;
    }
    const { path, onPath } = best!;
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
  // puzzles and mistakes are not scheduled (puzzles live in the Arcade); cards left from before are skipped
  const active = q.cards.filter((c) => !c.suspended && (c.type === 'move' || isTrap(c)));
  // due reviews, all types, capped by the daily review limit (lowest retrievability first)
  let due = active.filter((c) => !isNew(c) && c.due <= q.now);
  const room = Math.max(0, q.limits.maxReviews - q.done.reviews);
  if (due.length > room) due = [...due].sort((a, b) => q.retrievability(a) - q.retrievability(b)).slice(0, room);

  const items: QItem[] = [];
  // 1. due Move cards, as lines
  // cards not due yet but slipping (R < 0.95): a line through them credits them on the way
  const near = active.filter((c) => c.type === 'move' && !isNew(c) && c.due > q.now && q.retrievability(c) < NEAR_R);
  items.push(...groupLines(due.filter((c) => c.type === 'move'), q.lines, near));
  // 2. due Punish and Danger cards
  for (const c of due.filter(isTrap).sort((a, b) => a.due - b.due)) items.push({ kind: 'card', card: c });
  // 3. new Move cards: half from the focus openings, the rest by line probability; shown highest probability first
  const nm = Math.max(0, q.limits.newMoves - q.done.newMoves) + (q.extraNew ?? 0);
  const byProb = (a: MoveSpec, b: MoveSpec) => b.prob - a.prob || a.ply - b.ply;
  const open = new Set(q.newMoves.map((s) => s.id));
  const picked = (q.focus ?? []).filter((s) => open.has(s.id)).slice(0, Math.ceil(nm / 2));
  const taken = new Set(picked.map((s) => s.id));
  picked.push(...[...q.newMoves].sort(byProb).filter((s) => !taken.has(s.id)).slice(0, nm - picked.length));
  for (const s of picked.sort(byProb)) {
    const L = q.lines[s.side];
    items.push({ kind: 'new', spec: s, path: L ? pathTo(L, s.epd) : [] });
  }
  // 4. new traps: Punish and Danger by frequency × loss
  const nt = Math.max(0, q.limits.newTraps - q.done.newTraps);
  for (const t of [...q.newTraps].sort((a, b) => b.score - a.score).slice(0, nt)) items.push({ kind: 'newtrap', spec: t });
  return items;
}

/** Start of the current study day (rollover hour, local time). */
export function dayStart(now: number, rollover: number): number {
  const d = new Date(now);
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), rollover).getTime();
  return now >= s ? s : s - 864e5;
}
