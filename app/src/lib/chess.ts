// Position helpers. The position key everywhere is the EPD: the first four FEN
// fields, with en passant only when a capture is legal (the pipeline does the same).
//
// `child()` applies a UCI move straight to an EPD string without chess.js. Line
// generation walks tens of thousands of positions and chess.js is too slow for
// that on a phone; moves come from the tree, so they are already legal.
import { Chess } from 'chess.js';

export type Side = 'w' | 'b';
export const START_EPD = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
export const START_FEN = START_EPD + ' 0 1';

export const fenOf = (epd: string) => (epd.split(' ').length > 4 ? epd : epd + ' 0 1');
export const turnOf = (epd: string): Side => (epd.split(' ')[1] as Side);

/** EPD of a chess.js game or FEN, normalised. */
export function epdOf(x: Chess | string): string {
  const c = typeof x === 'string' ? null : x;
  const fen = c ? c.fen() : x as string;
  const f = fen.split(' ');
  if (f[3] !== '-') {
    const g = c ?? new Chess(fenOf(f.slice(0, 4).join(' ')));
    if (!g.moves({ verbose: true }).some((m) => m.isEnPassant())) f[3] = '-';
  }
  return f.slice(0, 4).join(' ');
}

const sq = (s: string) => (s.charCodeAt(0) - 97) + (s.charCodeAt(1) - 49) * 8;
const name = (i: number) => String.fromCharCode(97 + (i & 7)) + String.fromCharCode(49 + (i >> 3));

function board(placement: string): string[] {
  const b: string[] = new Array(64).fill('');
  const ranks = placement.split('/');
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of ranks[7 - r]) {
      if (ch >= '1' && ch <= '8') f += +ch;
      else b[r * 8 + f++] = ch;
    }
  }
  return b;
}
function placementOf(b: string[]): string {
  const rows: string[] = [];
  for (let r = 7; r >= 0; r--) {
    let row = '', empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = b[r * 8 + f];
      if (!p) empty++;
      else { if (empty) row += empty; empty = 0; row += p; }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return rows.join('/');
}

const childCache = new Map<string, string>();

/** The EPD after playing `uci` (assumed legal) from `epd`. */
export function child(epd: string, uci: string): string {
  const k = epd + '|' + uci;
  const hit = childCache.get(k);
  if (hit) return hit;
  const [pl, turn, castle] = epd.split(' ');
  const b = board(pl);
  const from = sq(uci.slice(0, 2)), to = sq(uci.slice(2, 4));
  const p = b[from];
  const white = turn === 'w';
  const isPawn = p === 'P' || p === 'p';
  // en passant capture: a pawn moving diagonally onto an empty square
  if (isPawn && (from & 7) !== (to & 7) && !b[to]) b[to + (white ? -8 : 8)] = '';
  b[to] = uci.length > 4 ? (white ? uci[4].toUpperCase() : uci[4]) : p;
  b[from] = '';
  // castling moves the rook too
  if ((p === 'K' || p === 'k') && Math.abs((to & 7) - (from & 7)) === 2) {
    const rank = from & ~7;
    if ((to & 7) === 6) { b[rank + 5] = b[rank + 7]; b[rank + 7] = ''; }
    else { b[rank + 3] = b[rank]; b[rank] = ''; }
  }
  let c = castle === '-' ? '' : castle;
  const drop = (chars: string) => { for (const ch of chars) c = c.replace(ch, ''); };
  if (p === 'K') drop('KQ');
  if (p === 'k') drop('kq');
  for (const s of [from, to]) {
    if (s === 0) drop('Q'); if (s === 7) drop('K'); if (s === 56) drop('q'); if (s === 63) drop('k');
  }
  let ep = '-';
  if (isPawn && Math.abs(to - from) === 16) {
    const enemy = white ? 'p' : 'P';
    const f = to & 7;
    if ((f > 0 && b[to - 1] === enemy) || (f < 7 && b[to + 1] === enemy)) ep = name((from + to) / 2);
  }
  let out = `${placementOf(b)} ${white ? 'b' : 'w'} ${c || '-'} ${ep}`;
  if (ep !== '-') out = epdOf(out); // only keep it when the capture is legal
  childCache.set(k, out);
  if (childCache.size > 400_000) childCache.clear();
  return out;
}

/** Walk a UCI path from the start position. */
export function epdAfter(path: string[], from = START_EPD): string {
  let e = from;
  for (const u of path) e = child(e, u);
  return e;
}

const sanCache = new Map<string, string>();
/** SAN of a UCI move in a position. */
export function san(epd: string, uci: string): string {
  const k = epd + '|' + uci;
  let s = sanCache.get(k);
  if (s) return s;
  try {
    const c = new Chess(fenOf(epd));
    s = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch { s = uci; }
  sanCache.set(k, s);
  return s;
}

/** SAN list for a UCI path. */
export function sans(path: string[], from = START_EPD): string[] {
  const out: string[] = [];
  let e = from;
  for (const u of path) { out.push(san(e, u)); e = child(e, u); }
  return out;
}

export const uciOf = (m: { from: string; to: string; promotion?: string }) => m.from + m.to + (m.promotion ?? '');

/** "1.e4 e5 2.Nf3", optionally ending in "?" for the move being asked. */
export function moveOrder(sanList: string[], ask = false, firstPly = 0): string {
  let s = '';
  sanList.forEach((m, i) => {
    const ply = firstPly + i;
    if (ply % 2 === 0) s += `${ply / 2 + 1}.`;
    else if (i === 0) s += `${(ply + 1) / 2}...`;
    s += m + ' ';
  });
  if (ask) {
    const ply = firstPly + sanList.length;
    s += ply % 2 === 0 ? `${ply / 2 + 1}.?` : sanList.length ? '?' : `${(ply + 1) / 2}...?`;
  }
  return s.trim();
}

/** Lichess win% from centipawns (mover's view). */
export const winPct = (cp: number) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-10000, Math.min(10000, cp)))) - 1);

/** Informant-style evaluation symbol from White's view. */
export function evalGlyph(cp: number): string {
  const a = Math.abs(cp);
  if (a >= 9000) return cp > 0 ? '+−' : '−+';
  if (a < 20) return '=';
  if (a < 60) return cp > 0 ? '⩲' : '⩱';
  if (a < 150) return cp > 0 ? '±' : '∓';
  return cp > 0 ? '+−' : '−+';
}
export function evalText(cp: number): string {
  if (Math.abs(cp) >= 9000) return (cp > 0 ? '#' : '−#') + (10000 - Math.abs(cp));
  return (cp >= 0 ? '+' : '−') + (Math.abs(cp) / 100).toFixed(1);
}

/** Small stable string hash (FNV-1a, two lanes) for card ids. */
export function hashId(...parts: string[]): string {
  const s = parts.join('\u0000');
  let a = 0x811c9dc5, b = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ c, 2246822519) ^ (b >>> 15);
  }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36);
}

/** Legal destinations for chessground. */
export function dests(c: Chess): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const mv of c.moves({ verbose: true })) m.set(mv.from, [...(m.get(mv.from) ?? []), mv.to]);
  return m;
}
