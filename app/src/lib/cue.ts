// What Birch says at a branch: a position where you have more than one move of your own.
// The board is the same for each, so something has to say which one is being asked. A cue
// is the plainest true difference between your moves there, found by walking down a list
// and taking the first thing that tells every move apart:
//   what the move does on the board (castle, take, check, which piece, which pawn),
//   then how often it is played at your level,
//   then the opening name, and at the very end the move itself.
// It depends only on the position, your moves and the data, so a branch reads the same
// way every time it comes round.
import { Chess, type PieceSymbol, type Square } from 'chess.js';
import { fenOf, type Side } from './chess';

const NAME: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

interface Info { piece: PieceSymbol; from: Square; to: Square; captured?: PieceSymbol; castle: '' | 'short' | 'long'; check: boolean; san: string }

export interface CueData {
  /** share of games playing the move here at your level (0..1), when known */
  share?: (uci: string) => number | undefined;
  /** opening name the move leads to */
  name?: (uci: string) => string | undefined;
}

/** One label per move, or null when this rung says nothing about it. */
type Rung = (ms: Info[], ucis: string[]) => { labels: (string | null)[]; rest?: string } | null;

const wing = (sq: string) => (sq[0] <= 'd' ? 'queenside' : 'kingside');
const shade = (sq: string) => ((sq.charCodeAt(0) - 97 + +sq[1]) % 2 ? 'light-squared' : 'dark-squared');
const same = (xs: unknown[]) => xs.every((x) => x === xs[0]);

const board: Rung[] = [
  (ms) => {
    const both = ms.some((m) => m.castle === 'short') && ms.some((m) => m.castle === 'long');
    return { labels: ms.map((m) => (m.castle ? (both ? `castle ${m.castle}` : 'castle') : null)), rest: "don't castle yet" };
  },
  (ms) => ({ labels: ms.map((m) => (m.captured ? `take the ${NAME[m.captured]}` : null)), rest: "don't take" }),
  (ms) => ({ labels: ms.map((m) => (m.captured ? `take with the ${NAME[m.piece]}` : null)), rest: "don't take" }),
  (ms) => ({ labels: ms.map((m) => (m.check ? 'give check' : null)), rest: 'no check' }),
  (ms) => ({ labels: ms.map((m) => (m.piece === 'p' ? 'move a pawn' : `move the ${NAME[m.piece]}`)) }),
  (ms) => (ms.every((m) => m.piece === 'p') ? { labels: ms.map((m) => `push the ${m.from[0]}-pawn`) } : null),
  (ms) => (ms.every((m) => m.piece === 'p') && same(ms.map((m) => m.from)) && !ms.some((m) => m.captured)
    ? { labels: ms.map((m) => `push the pawn ${Math.abs(+m.to[1] - +m.from[1]) === 2 ? 'two squares' : 'one square'}`) } : null),
  (ms) => (same(ms.map((m) => m.piece)) && ms[0].piece === 'b' ? { labels: ms.map((m) => `move the ${shade(m.from)} bishop`) } : null),
  (ms) => (same(ms.map((m) => m.piece)) && 'nr'.includes(ms[0].piece) ? { labels: ms.map((m) => `move the ${wing(m.from)} ${NAME[m.piece]}`) } : null)
];

/** Main move and sideline: only when the numbers are far enough apart to stay that way. */
const played = (share: NonNullable<CueData['share']>): Rung => (_ms, ucis) => {
  const s = ucis.map((u) => share(u));
  if (ucis.length > 3 || s.some((x) => x === undefined || x <= 0)) return null;
  const order = ucis.map((_, i) => i).sort((a, b) => s[b]! - s[a]!);
  for (let i = 1; i < order.length; i++) if (s[order[i - 1]]! < 1.5 * s[order[i]]!) return null;
  const words = ucis.length === 2 ? ['play the main move', 'play the sideline'] : ['play the most popular move', 'play the second choice', 'play the rare one'];
  const labels: string[] = [];
  order.forEach((idx, rank) => (labels[idx] = words[rank]));
  return { labels };
};

/** The opening name, without the part every move shares ("Italian Game: "). */
const named = (name: NonNullable<CueData['name']>): Rung => (_ms, ucis) => {
  const ns = ucis.map((u) => name(u) ?? '');
  if (ns.some((n) => !n)) return null;
  const fam = ns.map((n) => (n.includes(': ') ? n.slice(0, n.indexOf(': ')) : ''));
  const cut = fam[0] && same(fam) ? fam[0].length + 2 : 0;
  return { labels: ns.map((n) => `play the ${n.slice(cut)}`) };
};

/**
 * A cue for each of your moves at a position, in the order given. Every cue is different
 * from the others; with fewer than two moves there is nothing to tell apart.
 */
export function branchCues(epd: string, ucis: string[], data: CueData = {}): string[] {
  if (ucis.length < 2) return ucis.map(() => '');
  const ms: Info[] = [];
  for (const u of ucis) {
    try {
      const c = new Chess(fenOf(epd));
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      ms.push({ piece: m.piece, from: m.from, to: m.to, captured: m.captured, castle: m.isKingsideCastle() ? 'short' : m.isQueensideCastle() ? 'long' : '', check: c.inCheck(), san: m.san });
    } catch { return ucis.map((x) => `play ${x}`); }
  }
  const rungs = [...board, ...(data.share ? [played(data.share)] : []), ...(data.name ? [named(data.name)] : [])];
  for (const rung of rungs) {
    const r = rung(ms, ucis);
    if (!r) continue;
    const none = r.labels.filter((l) => l === null).length;
    // a rung has to say something, and may leave at most one move as "the one that does not"
    if (none === r.labels.length || none > (r.rest ? 1 : 0)) continue;
    const out = r.labels.map((l) => l ?? r.rest!);
    if (new Set(out).size === out.length) return out;
  }
  return ms.map((m) => `play ${m.san}`);
}

// Look-alikes: two positions a piece or two apart where you play different moves. Nothing on
// the board says "this is the other one", so Birch points at what is different here.
const cells = (epd: string) => epd.split(' ')[0].replace(/\d/g, (d) => '.'.repeat(+d)).replace(/\//g, '');
const square = (i: number) => 'abcdefgh'[i % 8] + (8 - Math.floor(i / 8));

/** How many squares differ between two positions, counting no further than `max` + 1. */
export function boardDiff(a: string, b: string, max = 4): number {
  const A = cells(a), B = cells(b);
  let n = 0;
  for (let i = 0; i < 64 && n <= max; i++) if (A[i] !== B[i]) n++;
  return n;
}

/**
 * What is different here compared with a look-alike, from your side of the board:
 * "their bishop is on c5, not e7". null when the two are not look-alikes (the same
 * board, or more than two things to point at).
 */
export function lookalikeNote(here: string, there: string, side: Side): string | null {
  const A = cells(here), B = cells(there);
  const on: [string, string][] = [], off: [string, string][] = []; // [piece, square]: only here, only there
  for (let i = 0; i < 64; i++) if (A[i] !== B[i]) {
    if (A[i] !== '.') on.push([A[i], square(i)]);
    if (B[i] !== '.') off.push([B[i], square(i)]);
  }
  if (!on.length && !off.length) return null;
  const who = (p: string) => `${(p === p.toUpperCase()) === (side === 'w') ? 'your' : 'their'} ${NAME[p.toLowerCase() as PieceSymbol]}`;
  const out: string[] = [];
  for (const [p, sq] of on) {
    const j = off.findIndex(([q]) => q === p);
    if (j >= 0) { out.push(`${who(p)} is on ${sq}, not ${off[j][1]}`); off.splice(j, 1); }
    else out.push(`${who(p)} is on ${sq}`);
  }
  for (const [p, sq] of off) out.push(`${who(p)} is gone from ${sq}`);
  return out.length > 2 ? null : out.join(' and ');
}
