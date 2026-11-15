// PGN with variations and comments, in and out. Pure, so it is tested.
//
// Reading keeps the whole move tree of every game: the main line and each variation, comments
// (without Lichess's [%cal …] / [%csl …] / [%clk …] / [%eval …] commands) and NAGs dropped.
// chess.js checks every move; a game with an illegal move is reported, not half-imported.
import { Chess } from 'chess.js';
import { START_FEN } from './chess';

export interface PgnNode {
  /** SAN as chess.js writes it (Nf3, exd5, O-O, e8=Q+) */
  san: string;
  uci: string;
  /** FEN before the move */
  before: string;
  /** comment after the move */
  comment?: string;
  /** the next moves: the main line first, then the variations */
  children: PgnNode[];
}

export interface PgnGame {
  headers: Record<string, string>;
  /** comment before the first move */
  comment?: string;
  /** first moves: the main line first, then variations of the first move */
  moves: PgnNode[];
  /** set when the game could not be read; the moves stop where the problem is */
  error?: string;
  /** starts from a set-up position (a FEN header that is not the usual start) */
  setup?: boolean;
}

/** Remove Lichess / ChessBase commands from a comment and tidy the spaces. */
export function cleanComment(c: string): string {
  return c.replace(/\[%[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
}

type Tok = { t: 'tag'; k: string; v: string } | { t: 'com'; v: string } | { t: '(' } | { t: ')' } | { t: 'move'; v: string } | { t: 'end'; v: string };

const WORD = /[^\s(){};[\]]+/y;

function tokens(text: string): Tok[] {
  const out: Tok[] = [];
  const s = text.replace(/\r/g, '').replace(/^%.*$/gm, '');
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '[') {
      const end = s.indexOf(']', i);
      const m = /^\[\s*(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]$/.exec(s.slice(i, end + 1));
      if (m) out.push({ t: 'tag', k: m[1], v: m[2].replace(/\\(.)/g, '$1') });
      i = end < 0 ? s.length : end + 1;
      continue;
    }
    if (c === '{') { const end = s.indexOf('}', i); out.push({ t: 'com', v: s.slice(i + 1, end < 0 ? s.length : end) }); i = end < 0 ? s.length : end + 1; continue; }
    if (c === ';') { const end = s.indexOf('\n', i); out.push({ t: 'com', v: s.slice(i + 1, end < 0 ? s.length : end) }); i = end < 0 ? s.length : end + 1; continue; }
    if (c === '(' || c === ')') { out.push({ t: c }); i++; continue; }
    WORD.lastIndex = i;
    const m = WORD.exec(s);
    if (!m) { i++; continue; } // a stray } or ]
    const w = m[0];
    i += w.length;
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(w)) { out.push({ t: 'end', v: w }); continue; }
    if (/^\$\d+$/.test(w)) continue; // NAG
    // move numbers, possibly glued to the move: "12.", "12...", "12.Nf3"
    const mv = w.replace(/^\d+\.+/, '');
    if (!mv || /^\.+$/.test(mv)) continue;
    out.push({ t: 'move', v: mv });
  }
  return out;
}

/** Every game in a PGN text (several games, or a whole Lichess study). */
export function readPgn(text: string): PgnGame[] {
  const toks = tokens(text);
  const games: PgnGame[] = [];
  let i = 0;
  while (i < toks.length) {
    const headers: Record<string, string> = {};
    while (i < toks.length && toks[i].t === 'tag') { const t = toks[i++] as { k: string; v: string }; headers[t.k] = t.v; }
    const body: Tok[] = [];
    let depth = 0;
    while (i < toks.length) {
      const t = toks[i];
      if (t.t === 'tag' && depth === 0) break;
      i++;
      if (t.t === '(') depth++;
      if (t.t === ')') depth = Math.max(0, depth - 1);
      if (t.t === 'end' && depth === 0) break;
      body.push(t);
    }
    if (!Object.keys(headers).length && !body.length) continue;
    games.push(build(headers, body));
  }
  return games;
}

function build(headers: Record<string, string>, body: Tok[]): PgnGame {
  const game: PgnGame = { headers, moves: [] };
  const fen = headers.SetUp === '1' || headers.FEN ? headers.FEN : undefined;
  const start = fen ?? START_FEN;
  if (fen && fen.split(' ').slice(0, 4).join(' ') !== START_FEN.split(' ').slice(0, 4).join(' ')) game.setup = true;
  const chess = new Chess();
  try { chess.load(start); } catch { game.error = 'The FEN header is not a legal position'; return game; }
  // the line being read: where the next move goes, the position before it, and the last move played
  // `owner` is the move whose children `list` holds (null: the first moves), so an error can say where it is
  interface Line { list: PgnNode[]; owner: PgnNode | null; fen: string; last: PgnNode | null; prev: { list: PgnNode[]; owner: PgnNode | null; fen: string } | null }
  let line: Line = { list: game.moves, owner: null, fen: start, last: null, prev: null };
  const stack: Line[] = [];
  let skip = 0; // inside a variation that could not be read
  let pending = ''; // a comment before a move (start of a variation)
  for (const t of body) {
    if (skip) { if (t.t === '(') skip++; else if (t.t === ')') skip--; continue; }
    if (t.t === 'com') {
      const c = cleanComment(t.v);
      if (!c) continue;
      if (line.last) line.last.comment = line.last.comment ? `${line.last.comment} ${c}` : c;
      else if (!stack.length && !game.moves.length) game.comment = game.comment ? `${game.comment} ${c}` : c;
      else pending = pending ? `${pending} ${c}` : c;
      continue;
    }
    if (t.t === '(') {
      // a variation replaces the last move played: it starts from the position before it
      if (!line.last || !line.prev) { skip = 1; continue; }
      stack.push(line);
      line = { ...line.prev, last: null, prev: null };
      continue;
    }
    if (t.t === ')') { if (stack.length) line = stack.pop()!; pending = ''; continue; }
    if (t.t !== 'move') continue;
    const san = t.v.replace(/[!?]+$/, '').replace(/^0-0(-0)?/, (m) => m.replace(/0/g, 'O'));
    chess.load(line.fen);
    let mv = null;
    if (san !== '--' && san !== 'Z0') { try { mv = chess.move(san); } catch { mv = null; } }
    if (!mv) {
      const where = movesTo(game, line.owner);
      const what = san === '--' || san === 'Z0' ? 'A null move' : `Illegal move ${t.v}`;
      game.error ??= `${what}${where ? ` after ${where}` : ' at the start'}`;
      // drop the rest of this line; the other lines still count
      if (stack.length) { skip = 1; line = stack.pop()!; } else break;
      continue;
    }
    const uci = mv.from + mv.to + (mv.promotion ?? '');
    // the same move twice at one position (a repeated variation) shares its node
    let node = line.list.find((n) => n.uci === uci);
    if (!node) { node = { san: mv.san, uci, before: line.fen, children: [] }; line.list.push(node); }
    if (pending) { node.comment = node.comment ? `${pending} ${node.comment}` : pending; pending = ''; }
    line = { list: node.children, owner: node, fen: chess.fen(), last: node, prev: { list: line.list, owner: line.owner, fen: line.fen } };
  }
  return game;
}

/** "1.e4 e5 2.Nf3" for the line being read, to say where an error is. */
function movesTo(game: PgnGame, last: PgnNode | null): string {
  if (!last) return '';
  // find the path to the node
  const path: PgnNode[] = [];
  const dfs = (list: PgnNode[]): boolean => {
    for (const n of list) { path.push(n); if (n === last || dfs(n.children)) return true; path.pop(); }
    return false;
  };
  dfs(game.moves);
  return path.map((n, i) => (i % 2 === 0 ? `${i / 2 + 1}.` : '') + n.san).join(' ');
}

/** Walk every node of a game: the moves before it (UCI) and the node. */
export function walk(game: PgnGame, f: (path: string[], n: PgnNode) => void) {
  const rec = (list: PgnNode[], path: string[]) => { for (const n of list) { f(path, n); rec(n.children, [...path, n.uci]); } };
  rec(game.moves, []);
}

// ---------------------------------------------------------------- writing
export interface OutNode { san: string; comment?: string; children: OutNode[] }
export interface OutGame { headers: Record<string, string>; comment?: string; moves: OutNode[]; ply0?: number }

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const com = (s?: string) => (s ? `{ ${s.replace(/[{}]/g, '')} } ` : '');

/** A game as PGN: the first child is the main line, the others become variations. */
export function writePgn(g: OutGame): string {
  const head = Object.entries(g.headers).map(([k, v]) => `[${k} "${esc(v)}"]`).join('\n');
  let body = com(g.comment);
  const num = (ply: number, force: boolean) => (ply % 2 === 0 ? `${ply / 2 + 1}. ` : force ? `${(ply + 1) / 2}... ` : '');
  const line = (list: OutNode[], ply: number, force: boolean): string => {
    if (!list.length) return '';
    const [main, ...alts] = list;
    let s = num(ply, force) + main.san + ' ' + com(main.comment);
    // the alternatives to this move, each in brackets, before the main line goes on
    for (const a of alts) s += '(' + (num(ply, true) + a.san + ' ' + com(a.comment) + line(a.children, ply + 1, !!a.comment)).trim() + ') ';
    return s + line(main.children, ply + 1, alts.length > 0 || !!main.comment);
  };
  body += line(g.moves, g.ply0 ?? 0, true);
  const result = g.headers.Result ?? '*';
  // wrap at 80 columns like most PGN writers
  const words = (body + result).split(' ').filter(Boolean);
  const rows: string[] = [];
  let cur = '';
  for (const w of words) { if (cur && cur.length + 1 + w.length > 80) { rows.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w; }
  if (cur) rows.push(cur);
  return `${head}\n\n${rows.join('\n')}\n`;
}
