// Game parsing and the mistake rule (docs/BRIEF.md, "Analysis"). Pure, so it is tested.
import { Chess } from 'chess.js';
import { winPct, epdOf, uciOf, type Side } from '../chess';

export interface ParsedGame {
  white: string;
  black: string;
  result: string;
  date: number;
  url: string;
  moves: string[]; // UCI
  fens: string[]; // FEN before each move, plus the final position
}

/** Split a paste of one or many PGNs. */
export function splitPgns(text: string): string[] {
  const parts = text.replace(/\r/g, '').split(/\n\s*\n(?=\[)/);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

export function parsePgn(pgn: string): ParsedGame | null {
  const c = new Chess();
  try { c.loadPgn(pgn); } catch { return null; }
  const h = c.getHeaders();
  const hist = c.history({ verbose: true });
  const fens: string[] = [];
  const moves: string[] = [];
  for (const m of hist) { fens.push(m.before); moves.push(uciOf(m)); }
  fens.push(c.fen());
  const d = (h.UTCDate ?? h.Date ?? '').replace(/\./g, '-');
  const t = Date.parse(d + (h.UTCTime ? 'T' + h.UTCTime + 'Z' : ''));
  const url = h.Link ?? h.Site ?? '';
  return { white: h.White ?? '?', black: h.Black ?? '?', result: h.Result ?? '*', date: Number.isFinite(t) ? t : Date.now(), url: url.startsWith('http') ? url : 'pgn:' + hashPgn(pgn), moves, fens };
}
function hashPgn(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

export interface PlyAnalysis {
  ply: number;
  /** MultiPV lines for the mover, cp from the mover's view, best first */
  lines: { cp: number; pv: string[] }[];
  played: string;
  /** cp after the played move, mover's view */
  afterCp: number;
  /** engine reply line after the played move */
  reply: string[];
}

export interface MistakeFound {
  ply: number;
  loss: number;
  before: number;
  accepted: string[];
  best: string;
  played: string;
  refute: string[];
}

/**
 * A mistake loses ≥ 20 win% points from your view while your win% before it
 * was between 10 and 90. At most 3 per game: the largest losses. Every MultiPV
 * move within 30 cp of the best is accepted as correct.
 */
export function findMistakes(plies: PlyAnalysis[], max = 3): MistakeFound[] {
  const out: MistakeFound[] = [];
  for (const p of plies) {
    const best = p.lines[0];
    if (!best) continue;
    const before = winPct(best.cp);
    const loss = before - winPct(p.afterCp);
    if (loss < 20 || before < 10 || before > 90) continue;
    const accepted = p.lines.filter((l) => l.cp >= best.cp - 30).map((l) => l.pv[0]).filter(Boolean);
    if (accepted.includes(p.played)) continue;
    out.push({ ply: p.ply, loss, before, accepted, best: best.pv[0], played: p.played, refute: p.reply.slice(0, 3) });
  }
  return out.sort((a, b) => b.loss - a.loss).slice(0, max);
}

export const sideOf = (g: ParsedGame, user: string): Side | null =>
  g.white.toLowerCase() === user.toLowerCase() ? 'w' : g.black.toLowerCase() === user.toLowerCase() ? 'b' : null;

export const epdAt = (g: ParsedGame, ply: number) => epdOf(g.fens[ply]);
