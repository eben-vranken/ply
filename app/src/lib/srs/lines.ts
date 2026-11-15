// Line generation (docs/BRIEF.md, "Repertoire and lines").
//
// Lines are never stored. From the start position: on your turn follow each of
// your moves (one branch per move); on the opponent's turn branch into every
// reply with ≥ replyPct frequency and ≥ 50 games; stop at the depth limit or
// where the tree runs out. Black starts from every first move with ≥ 1%.
//
// Positions are walked best-first by line probability, each EPD once, so
// transpositions merge and every position keeps its most probable path.
//
// Your own book (replies you imported or set in Explore) is followed as well: those
// replies are in your lines whatever their frequency, and past the end of the
// band's tree your lines go on as long as you have a move or a book reply.
import { child, hashId, turnOf, START_EPD, type Side } from '../chess';
import type { Tree, Trap, Opening } from '../data';

export interface Ctx {
  tree: Tree;
  openings: Opening[];
  /** EPD → opening id for named positions */
  named: Map<string, number>;
  /** punish traps by position */
  punishAt: Map<string, Trap>;
}

export function makeCtx(tree: Tree, openings: Opening[], traps: Trap[]): Ctx {
  const named = new Map<string, number>();
  for (const o of openings) if (!named.has(o.epd)) named.set(o.epd, o.id);
  const punishAt = new Map<string, Trap>();
  for (const t of traps) if (t.kind === 'punish') {
    const cur = punishAt.get(t.epd);
    if (!cur || t.loss * t.freq > cur.loss * cur.freq) punishAt.set(t.epd, t);
  }
  return { tree, openings, named, punishAt };
}

export interface GenOpts {
  side: Side;
  /** your moves per line */
  depth: number;
  /** opponent reply threshold, 0–1 */
  replyPct: number;
  minGames?: number;
  /** first-move threshold for Black */
  rootPct?: number;
}

/** Your moves at a position: override, else forced punish answer, else the tree default. */
export type Mine = (side: Side, epd: string) => string[] | undefined;
/** Opponent replies you added yourself at a position (imported PGN, Explore). */
export type Book = (side: Side, epd: string) => string[] | undefined;
/** A book reply the band's tree does not know: it still counts, as a rare line. */
export const BOOK_FREQ = 0.01;

export interface Pos {
  epd: string;
  parent: string | null;
  via: string | null;
  prob: number;
  ply: number;
  /** your moves played before this position */
  mine: number;
  /** first move of the path (Black sections: e2e4 / d2d4 / other) */
  root: string | null;
  /** your moves here (on your turn) */
  moves?: string[];
  /** other move orders reaching this position: [parent EPD, move] */
  others?: [string, string][];
}

export interface MoveSpec {
  id: string;
  side: Side;
  epd: string;
  move: string;
  prob: number;
  ply: number;
  /** another of your moves exists here */
  branch: boolean;
}

export interface Lines {
  side: Side;
  depth: number;
  pos: Map<string, Pos>;
  cards: Map<string, MoveSpec>;
  /** leaf positions (depth reached or tree ran out) */
  leaves: Set<string>;
  /** your-turn positions with more than one move */
  branches: Set<string>;
}

export const moveId = (side: Side, epd: string, uci: string) => 'm' + hashId('move', side, epd, uci);

export function myMoves(ctx: Ctx, mine: Mine, side: Side, epd: string): string[] {
  const own = mine(side, epd);
  if (own?.length) return own;
  const trap = ctx.punishAt.get(epd);
  if (trap && trap.side === side) return [trap.answer[0]];
  const d = ctx.tree[epd]?.d;
  return d ? [d] : [];
}

export function replies(ctx: Ctx, epd: string, pct: number, minGames: number): [string, number][] {
  const n = ctx.tree[epd];
  if (!n || !n.g) return [];
  const out: [string, number][] = [];
  for (const [u, g] of n.m) if (g >= minGames && g / n.g >= pct) out.push([u, g / n.g]);
  return out;
}

/** Replies your lines follow: the tree's above the threshold, plus your own book replies. */
export function lineReplies(ctx: Ctx, book: Book | undefined, side: Side, epd: string, pct: number, minGames: number): [string, number][] {
  const out = replies(ctx, epd, pct, minGames);
  const own = book?.(side, epd);
  if (own?.length) {
    const n = ctx.tree[epd];
    for (const u of own) {
      if (out.some(([m]) => m === u)) continue;
      const g = n?.m.find(([m]) => m === u)?.[1];
      out.push([u, n?.g && g ? g / n.g : BOOK_FREQ]);
    }
  }
  return out;
}

class Heap {
  private a: Pos[] = [];
  get size() { return this.a.length; }
  push(p: Pos) {
    const a = this.a; a.push(p);
    let i = a.length - 1;
    while (i > 0) { const j = (i - 1) >> 1; if (a[j].prob >= a[i].prob) break; [a[i], a[j]] = [a[j], a[i]]; i = j; }
  }
  pop(): Pos {
    const a = this.a; const top = a[0]; const last = a.pop()!;
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l].prob > a[m].prob) m = l;
        if (r < a.length && a[r].prob > a[m].prob) m = r;
        if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top;
  }
}

export function generate(ctx: Ctx, mine: Mine, o: GenOpts, book?: Book): Lines {
  const minGames = o.minGames ?? 50;
  const rootPct = o.rootPct ?? 0.01;
  const pos = new Map<string, Pos>();
  const cards = new Map<string, MoveSpec>();
  const leaves = new Set<string>();
  const branches = new Set<string>();
  const heap = new Heap();
  heap.push({ epd: START_EPD, parent: null, via: null, prob: 1, ply: 0, mine: 0, root: null });
  while (heap.size) {
    const p = heap.pop();
    const seen = pos.get(p.epd);
    if (seen) {
      if (p.parent && (seen.parent !== p.parent || seen.via !== p.via)) (seen.others ??= []).push([p.parent, p.via!]);
      continue;
    }
    pos.set(p.epd, p);
    // past the tree, a line goes on only where you have a move or a book reply of your own
    const known = ctx.tree[p.epd] || (turnOf(p.epd) === o.side ? mine(o.side, p.epd)?.length : book?.(o.side, p.epd)?.length);
    if (p.mine >= o.depth || !known) { leaves.add(p.epd); continue; }
    const next: Pos[] = [];
    if (turnOf(p.epd) === o.side) {
      const ms = myMoves(ctx, mine, o.side, p.epd);
      p.moves = ms;
      if (ms.length > 1) branches.add(p.epd);
      for (const u of ms) {
        const id = moveId(o.side, p.epd, u);
        cards.set(id, { id, side: o.side, epd: p.epd, move: u, prob: p.prob, ply: p.ply, branch: ms.length > 1 });
        next.push({ epd: child(p.epd, u), parent: p.epd, via: u, prob: p.prob, ply: p.ply + 1, mine: p.mine + 1, root: p.root ?? u });
      }
    } else {
      const pct = p.ply === 0 ? rootPct : o.replyPct;
      for (const [u, f] of lineReplies(ctx, book, o.side, p.epd, pct, minGames)) {
        next.push({ epd: child(p.epd, u), parent: p.epd, via: u, prob: p.prob * f, ply: p.ply + 1, mine: p.mine, root: p.root ?? u });
      }
    }
    if (!next.length) leaves.add(p.epd);
    for (const n of next) {
      const s = pos.get(n.epd);
      if (s) (s.others ??= []).push([p.epd, n.via!]);
      else heap.push(n);
    }
  }
  return { side: o.side, depth: o.depth, pos, cards, leaves, branches };
}

/** The most probable move path (UCI from the start) to a position in the lines. */
export function pathTo(lines: Lines, epd: string): string[] {
  const out: string[] = [];
  let p = lines.pos.get(epd);
  while (p && p.via) { out.push(p.via); p = p.parent ? lines.pos.get(p.parent) : undefined; }
  return out.reverse();
}

/** Every other move order (UCI paths) reaching a position, most probable first. */
export function otherOrders(lines: Lines, epd: string): string[][] {
  const p = lines.pos.get(epd);
  return (p?.others ?? []).map(([par, u]) => [...pathTo(lines, par), u]);
}

/**
 * Share of the band's games that stay inside your lines through your depth.
 * Opponent turns weight each covered reply by its frequency; uncovered replies
 * (and games that end at the node) count as leaving the lines.
 */
export function coverage(ctx: Ctx, mine: Mine, o: GenOpts, from = START_EPD, mineBefore = 0, ply = 0): number {
  const minGames = o.minGames ?? 50;
  const memo = new Map<string, number>();
  const rec = (epd: string, m: number, pl: number): number => {
    const n = ctx.tree[epd];
    if (m >= o.depth || !n || !n.m.length) return 1;
    const k = epd + '|' + m;
    const hit = memo.get(k);
    if (hit !== undefined) return hit;
    memo.set(k, 1); // cycle guard
    let v: number;
    if (turnOf(epd) === o.side) {
      const ms = myMoves(ctx, mine, o.side, epd);
      v = ms.length ? Math.max(...ms.map((u) => rec(child(epd, u), m + 1, pl + 1))) : 1;
    } else {
      const pct = pl === 0 ? (o.rootPct ?? 0.01) : o.replyPct;
      const rs = replies(ctx, epd, pct, minGames);
      // no reliable reply left: the tree runs out and the line ends here, as in generate()
      if (!rs.length) v = 1;
      else { v = 0; for (const [u, f] of rs) v += f * rec(child(epd, u), m, pl + 1); }
    }
    memo.set(k, v);
    return v;
  };
  return rec(from, mineBefore, ply);
}

/** Black repertoire sections by first move. */
export type Section = 'White' | 'Black vs 1.e4' | 'Black vs 1.d4' | 'Black vs others';
export function sectionOf(side: Side, root: string | null): Section {
  if (side === 'w') return 'White';
  return root === 'e2e4' ? 'Black vs 1.e4' : root === 'd2d4' ? 'Black vs 1.d4' : 'Black vs others';
}
