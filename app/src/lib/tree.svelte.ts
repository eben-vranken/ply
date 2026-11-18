// A move tree with Lichess's navigation, shared by every board that can step through moves
// (Explore, game review, Play it out, the trainer's line after an answer).
//
// - ← / → step back and forward; forward follows the first child (the mainline from here).
// - Home or ↑ goes to the start, End or ↓ to the end of the mainline from here.
// - Playing a move that is already a child walks into it. A new move becomes a variation,
//   so going back and forward again never loses what was there.
import { Chess } from 'chess.js';
import { uciOf } from './chess';

export interface TreeNode {
  id: string; // the UCI path from the root, space separated ('' = the root)
  uci: string;
  san: string;
  fen: string; // after the move
  ply: number; // plies from the root's position (the root is 0)
  parent: TreeNode | null;
  children: TreeNode[];
}

const toMove = (u: string) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

export class MoveTree {
  root: TreeNode;
  /** bumped on every change, so $derived values that read the tree recompute */
  rev = $state(0);
  #cur: TreeNode;
  #ids = new Map<string, TreeNode>();

  constructor(fen = new Chess().fen()) {
    this.root = { id: '', uci: '', san: '', fen, ply: 0, parent: null, children: [] };
    this.#ids.set('', this.root);
    this.#cur = this.root;
  }

  get cur(): TreeNode { void this.rev; return this.#cur; }
  /** UCI moves from the root to the current node */
  get path(): string[] { return this.pathOf(this.cur); }
  pathOf(n: TreeNode): string[] { const out: string[] = []; for (let x: TreeNode | null = n; x && x.parent; x = x.parent) out.push(x.uci); return out.reverse(); }
  /** the nodes from the root (excluded) to `n` */
  lineTo(n: TreeNode): TreeNode[] { const out: TreeNode[] = []; for (let x: TreeNode | null = n; x && x.parent; x = x.parent) out.push(x); return out.reverse(); }
  /** the mainline from `n` on (n excluded) */
  mainFrom(n: TreeNode): TreeNode[] { const out: TreeNode[] = []; for (let x = n.children[0]; x; x = x.children[0]) out.push(x); return out; }
  /** the whole game's mainline from the root */
  get mainline(): TreeNode[] { void this.rev; return this.mainFrom(this.root); }
  node(id: string) { void this.rev; return this.#ids.get(id); }

  #touch() { this.rev++; }
  goto(n: TreeNode | undefined) { if (!n || n === this.#cur) return false; this.#cur = n; this.#touch(); return true; }
  back() { return this.goto(this.#cur.parent ?? undefined); }
  fwd() { return this.goto(this.#cur.children[0]); }
  first() { return this.goto(this.root); }
  last() { const m = this.mainFrom(this.#cur); return this.goto(m.at(-1)); }

  /** add a move under `at` (or find it) without moving there */
  add(at: TreeNode, uci: string): TreeNode | null {
    const have = at.children.find((c) => c.uci === uci);
    if (have) return have;
    const c = new Chess(at.fen);
    let m;
    try { m = c.move(toMove(uci)); } catch { return null; }
    const u = uciOf(m);
    const again = at.children.find((x) => x.uci === u);
    if (again) return again;
    const id = at.id ? at.id + ' ' + u : u;
    const n: TreeNode = { id, uci: u, san: m.san, fen: c.fen(), ply: at.ply + 1, parent: at, children: [] };
    at.children.push(n);
    this.#ids.set(id, n);
    this.#touch();
    return n;
  }
  /** play a move from the current node: into the existing child, or a new variation */
  play(uci: string): TreeNode | null { const n = this.add(this.#cur, uci); if (n) this.goto(n); return n; }
  /** add a run of moves under `at` as its mainline (where it is new), returning the last node */
  addLine(at: TreeNode, ucis: string[]): TreeNode {
    let n = at;
    for (const u of ucis) { const x = this.add(n, u); if (!x) break; n = x; }
    return n;
  }
  /** go to the node at this UCI path from the root, adding what is missing (a link, a search hit) */
  setPath(ucis: string[]) { this.goto(this.addLine(this.root, ucis)); if (!ucis.length) this.first(); }
  /** make the variation holding `n` the mainline at every branch on its way */
  promote(n: TreeNode) {
    for (let x: TreeNode | null = n; x && x.parent; x = x.parent) {
      const sib = x.parent.children;
      const i = sib.indexOf(x);
      if (i > 0) { sib.splice(i, 1); sib.unshift(x); }
    }
    this.#touch();
  }
  /** delete `n` and everything after it */
  remove(n: TreeNode) {
    if (!n.parent) return;
    const drop = (x: TreeNode) => { this.#ids.delete(x.id); x.children.forEach(drop); };
    drop(n);
    n.parent.children = n.parent.children.filter((c) => c !== n);
    if (this.lineTo(this.#cur).includes(n) || this.#cur === n) this.#cur = n.parent;
    this.#touch();
  }
  /** is `n` on the root's mainline? */
  isMain(n: TreeNode) { for (let x: TreeNode | null = n; x && x.parent; x = x.parent) if (x.parent.children[0] !== x) return false; return true; }

  /** a nav key (lib/keys.ts): true when it moved */
  key(a: 'back' | 'fwd' | 'first' | 'last') { return a === 'back' ? this.back() : a === 'fwd' ? this.fwd() : a === 'first' ? this.first() : this.last(); }

  /** a game: the root's position and its moves as the mainline */
  static of(ucis: string[], fen?: string): MoveTree {
    const t = new MoveTree(fen);
    t.addLine(t.root, ucis);
    return t;
  }
}

/** "12." / "12…" for a node, from the root's move number */
export function moveNo(n: TreeNode, rootFen: string): string {
  const [, turn, , , , full] = rootFen.split(' ');
  const startPly = (+full - 1) * 2 + (turn === 'b' ? 1 : 0);
  const p = startPly + n.ply - 1; // plies before this move from the game's start
  return Math.floor(p / 2) + 1 + (p % 2 ? '…' : '.');
}
