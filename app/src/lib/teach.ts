// Learning a move (docs/ROADMAP.md, phase 5): what to say before you play it, and what to show.
//
// An obvious move (the only legal one, a recapture) gets one line. A move with a point that is not
// on the board gets the idea: the threat it stops (from ideas-<band>.json.gz, worked out offline by
// Stockfish), whether it is the only good move here (from the tree's evals), and what it prepares
// (your next move in the line, when this move is what makes it work). Everything else gets the
// plain reading of the board from explain.ts, as before. Pure, so it is unit tested.
import { Chess, type Square, type PieceSymbol, type Color, type Move } from 'chess.js';
import { fenOf } from './chess';
import { explain } from './explain';
import type { Idea, TreeNode } from './data';

const NAME: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

export interface TeachInput {
  /** position before your move (your turn) and the move */
  epd: string;
  uci: string;
  /** the opponent's move just before: where it went, and whether it took something */
  last?: { to: string; captured: boolean };
  /** the tree's node here, and its children's nodes, for shares and evals */
  node?: TreeNode;
  childNode?: (uci: string) => TreeNode | undefined;
  idea?: Idea;
  /** your next move in the line after the most played reply */
  next?: { reply: string; move: string };
}

export interface Teach {
  /** one line, nothing to walk through */
  plain: boolean;
  text: string;
  /** the opponent's move this one stops, to draw and to show (played as if you had passed) */
  threat?: string;
  /** what it prepares, to show: your move, their reply, your next move */
  prepares?: string[];
}

const load = (epd: string) => { try { return new Chess(fenOf(epd)); } catch { return null; } };
const play = (c: Chess, u: string): Move | null => { try { return c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch { return null; } };
/** the position with the other side to move: you passed */
export const passed = (epd: string) => { const f = epd.split(' '); return `${f[0]} ${f[1] === 'w' ? 'b' : 'w'} ${f[2]} -`; };

/** What the threat would do, as the end of "Stops …Bg4, which would …". */
function threatWhat(epd: string, t: string): { san: string; what: string } | null {
  const c = load(passed(epd));
  if (!c) return null;
  const me = c.turn() === 'w' ? 'b' : 'w', them = c.turn() as Color;
  const mv = play(c, t);
  if (!mv) return null;
  const san = (them === 'b' ? '…' : '') + mv.san;
  if (c.isCheckmate()) return { san, what: 'which would be checkmate' };
  if (mv.captured) return { san, what: `which would take the ${NAME[mv.captured]} on ${mv.to}` };
  // a pin: a long-range piece lined up through one of yours to your king or queen
  if ('brq'.includes(mv.piece)) {
    const [f0, r0] = [mv.to.charCodeAt(0), +mv.to[1]];
    for (const [df, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      if (mv.piece === 'b' && (df === 0 || dr === 0)) continue;
      if (mv.piece === 'r' && df !== 0 && dr !== 0) continue;
      let first: { sq: string; p: PieceSymbol } | null = null;
      for (let k = 1; k < 8; k++) {
        const f = f0 + df * k, r = r0 + dr * k;
        if (f < 97 || f > 104 || r < 1 || r > 8) break;
        const sq = String.fromCharCode(f) + r, p = c.get(sq as Square);
        if (!p) continue;
        if (p.color !== me) break;
        if (!first) { first = { sq, p: p.type }; continue; }
        if ((p.type === 'k' || p.type === 'q') && VALUE[p.type] > VALUE[first.p]) return { san, what: `which would pin the ${NAME[first.p]} on ${first.sq} to your ${NAME[p.type]}` };
        break;
      }
    }
  }
  if (c.inCheck()) return { san, what: 'which would give check' };
  const hit: string[] = [];
  for (const sq of c.board().flat()) {
    if (!sq || sq.color !== me || sq.type === 'k') continue;
    if (!c.attackers(sq.square, them).includes(mv.to)) continue;
    if (VALUE[sq.type] > VALUE[mv.piece] || !c.isAttacked(sq.square, me)) hit.push(`the ${NAME[sq.type]} on ${sq.square}`);
  }
  if (hit.length) return { san, what: `which would hit ${hit.slice(0, 2).join(' and ')}` };
  // the engine's favourite with nothing concrete in it is not a threat worth naming
  return null;
}

/** Your next move, when this move is what makes it work. */
function preparesText(epd: string, uci: string, next: { reply: string; move: string }): string | null {
  const before = load(epd), c = load(epd);
  if (!before || !c) return null;
  const me = c.turn();
  const m = play(c, uci);
  if (!m || !play(c, next.reply)) return null;
  const n = c.moves({ verbose: true }).find((x) => x.from + x.to + (x.promotion ?? '') === next.move);
  if (!n) return null;
  // castling that was not possible before this move
  if (n.isKingsideCastle() || n.isQueensideCastle()) {
    const could = before.moves({ verbose: true }).some((x) => x.isKingsideCastle() || x.isQueensideCastle());
    return could ? null : 'Clears the way to castle.';
  }
  // the moved piece or pawn backs up the square your next move goes to
  // (only where they contest that square: backing up a square nobody attacks is no reason)
  if (c.attackers(n.to as Square, me).includes(m.to as Square) && n.from !== m.to && c.isAttacked(n.to as Square, me === 'w' ? 'b' : 'w')) {
    return `Prepares ${n.san}: the ${NAME[m.piece]} on ${m.to} will support it.`;
  }
  // it got out of the way of a long-range piece
  if ('brq'.includes(n.piece)) {
    const between = (a: string, b: string, x: string) => {
      const [fa, ra, fb, rb, fx, rx] = [a.charCodeAt(0), +a[1], b.charCodeAt(0), +b[1], x.charCodeAt(0), +x[1]];
      const df = Math.sign(fb - fa), dr = Math.sign(rb - ra);
      for (let f = fa + df, r = ra + dr; f !== fb || r !== rb; f += df, r += dr) if (f === fx && r === rx) return true;
      return false;
    };
    if (between(n.from, n.to, m.from)) return `Opens the way for ${n.san}.`;
  }
  return null;
}

/** "The only good move here": every other move played at this level loses at least a pawn. */
function onlyGood(epd: string, uci: string, node?: TreeNode, childNode?: (u: string) => TreeNode | undefined): string | null {
  if (!node || !childNode || !node.g) return null;
  const white = epd.split(' ')[1] === 'w';
  const pov = (u: string) => { const n = childNode(u); return n ? (white ? n.e : -n.e) : null; };
  const mine = pov(uci);
  if (mine === null) return null;
  const others = node.m.filter(([u, g]) => u !== uci && g >= Math.max(10, node.g * 0.02)).map(([u]) => pov(u)).filter((x): x is number => x !== null);
  if (!others.length) return null;
  const loss = mine - Math.max(...others);
  if (loss < 100) return null;
  const pawns = Math.round(loss / 50) / 2;
  return `The only good move here: the others played at your level lose about ${pawns} pawn${pawns === 1 ? '' : 's'}.`;
}

export function teach(i: TeachInput): Teach {
  const c = load(i.epd);
  const share = (() => { const row = i.node?.m.find((r) => r[0] === i.uci); return i.node?.g && row ? row[1] / i.node.g : undefined; })();
  const board = explain(i.epd, i.uci, share);
  if (!c) return { plain: true, text: board };
  const legal = c.moves({ verbose: true });
  if (legal.length === 1) return { plain: true, text: 'The only legal move.' };
  const m = legal.find((x) => x.from + x.to + (x.promotion ?? '') === i.uci);
  if (!m) return { plain: true, text: board };
  if (c.inCheck() && legal.length <= 3) return { plain: true, text: 'Gets out of check.' };
  if (m.san.endsWith('#')) return { plain: true, text: 'Checkmate.' };
  // a recapture: they just took on this square
  if (i.last?.captured && m.captured && i.last.to === m.to) return { plain: true, text: `Recapture on ${m.to}.` };
  const facts: string[] = [];
  let threat: string | undefined, prepares: string[] | undefined;
  if (i.idea?.s.includes(i.uci)) {
    const w = threatWhat(i.epd, i.idea.t);
    if (w) { facts.push(`Stops ${w.san}, ${w.what}.`); threat = i.idea.t; }
  }
  const only = onlyGood(i.epd, i.uci, i.node, i.childNode);
  if (only) facts.push(only);
  if (i.next) {
    const p = preparesText(i.epd, i.uci, i.next);
    if (p) { facts.push(p); prepares = [i.uci, i.next.reply, i.next.move]; }
  }
  if (!facts.length) return { plain: true, text: board };
  // the board's own reading first when it says something the facts do not
  const lead = board && !/^(Played in|The main move)/.test(board) ? board.split(/(?<=\.) /)[0] : '';
  return { plain: false, text: [lead, ...facts.slice(0, 2)].filter(Boolean).join(' '), threat, prepares };
}
