// Game review: what each move was worth. Pure, so it is tested.
//
// Every move is judged by the win% it gave away against the engine's best (from the mover's view,
// Lichess's winning-chances curve), the same idea as the big sites' "expected points":
//   best       the engine's first choice, or within 0.5 points of it
//   excellent  < 2      good  < 5      inaccuracy < 10      mistake < 20      blunder ≥ 20
// and four that need more than the loss:
//   book       still in the opening data for your band (enough games, and the move is common)
//   great      the only good move: the engine's best, and its second choice is ≥ 15 points worse,
//              in a position that was not already won
//   brilliant  a best move that leaves a piece en prise (a sacrifice the engine approves of), not
//              already winning before, not losing after
//   miss       the opponent's last move was a mistake or blunder and yours gave the chance back
// Accuracy per move is Lichess's formula, 103.1668·e^(−0.04354·loss) − 3.1669; the game's accuracy
// is the mean of the arithmetic and the harmonic mean of the moves (both of them, as Lichess does,
// so one blunder costs more than an average would say).
import { Chess, type Square } from 'chess.js';
import { winPct } from './chess';

export type Kind = 'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'book' | 'inaccuracy' | 'mistake' | 'miss' | 'blunder';
export const KINDS: Kind[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];
export const KIND_LABEL: Record<Kind, string> = { brilliant: 'Brilliant', great: 'Great move', best: 'Best', excellent: 'Excellent', good: 'Good', book: 'Book', inaccuracy: 'Inaccuracy', mistake: 'Mistake', miss: 'Miss', blunder: 'Blunder' };
/** the classic annotation glyph where there is one */
export const KIND_GLYPH: Partial<Record<Kind, string>> = { brilliant: '!!', great: '!', inaccuracy: '?!', mistake: '?', blunder: '??' };

/** the engine's view of one position: cp from the side to move (mates ±(10000 − n)), best first */
/** the engine's view of one position: cp from the side to move (mates ±(10000 − n)), best first;
 *  `book`: the move played from here is a book move at your band */
export interface PosEval { lines: { cp: number; pv: string[] }[]; book?: boolean }

export interface MoveVerdict {
  ply: number;
  kind: Kind;
  /** win% given away, mover's view, 0–100 */
  loss: number;
  accuracy: number;
  /** eval after the move, White's view */
  cpAfter: number;
  /** the engine's best in the position before, UCI ('' when unknown) */
  best: string;
  bestCp: number;
}

const PIECE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** did this move leave one of the mover's pieces (knight or more) hanging that was not before? */
export function sacrifices(fenBefore: string, uci: string): boolean {
  const c = new Chess(fenBefore);
  const me = c.turn();
  const hangingNow = (x: Chess) => {
    const out = new Set<string>();
    for (const row of x.board()) for (const p of row) {
      if (!p || p.color !== me || PIECE[p.type] < 3) continue;
      const them = x.attackers(p.square as Square, me === 'w' ? 'b' : 'w');
      if (!them.length) continue;
      const mine = x.attackers(p.square as Square, me);
      const cheapest = Math.min(...them.map((s) => PIECE[x.get(s)!.type] || 100));
      if (!mine.length || cheapest < PIECE[p.type]) out.add(p.type + p.square);
    }
    return out;
  };
  const before = hangingNow(c);
  let m;
  try { m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); } catch { return false; }
  // a capture that wins back as much as it risks is a trade, not a sacrifice
  const gained = m.captured ? PIECE[m.captured] : 0;
  const after = hangingNow(c);
  for (const k of after) if (!before.has(k) && PIECE[k[0]] > gained) return true;
  return false;
}

export const moveAccuracy = (loss: number) => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * Math.max(0, loss)) - 3.1669));

export function gameAccuracy(acc: number[]): number | null {
  if (!acc.length) return null;
  const mean = acc.reduce((s, a) => s + a, 0) / acc.length;
  const harm = acc.length / acc.reduce((s, a) => s + 1 / Math.max(1, a), 0);
  return (mean + harm) / 2;
}

/**
 * Classify every move. `fens[i]` is the position before move i (plus the final position),
 * `moves[i]` the UCI move, `evals[i]` the engine's view of `fens[i]` (the last one is the final
 * position). A move whose positions are not analysed yet is left out.
 */
export function classify(fens: string[], moves: string[], evals: (PosEval | undefined)[]): (MoveVerdict | null)[] {
  const out: (MoveVerdict | null)[] = [];
  for (let i = 0; i < moves.length; i++) {
    const e0 = evals[i], e1 = evals[i + 1];
    const white = fens[i].split(' ')[1] === 'w';
    const fin = gameEnd(fens[i + 1]);
    if (!e0?.lines.length || (!e1?.lines.length && fin === null)) { out.push(null); continue; }
    const bestCp = e0.lines[0].cp;
    // after the move it is the opponent's turn: flip to the mover's view. When the played move is one
    // of the engine's own lines here, that line's score is used: the same search, so no noise between two
    const inLines = e0.lines.find((l) => l.pv[0] === moves[i]);
    const after = fin ?? (inLines ? inLines.cp : -e1!.lines[0].cp);
    const wpBest = winPct(bestCp), wpAfter = winPct(after);
    const played = moves[i], best = e0.lines[0].pv[0] ?? '';
    const isBest = played === best;
    const loss = isBest ? 0 : Math.max(0, wpBest - wpAfter);
    let kind: Kind;
    if (e0.book && loss < 5) kind = 'book';
    else if (isBest || loss < 0.5) kind = 'best';
    else if (loss < 2) kind = 'excellent';
    else if (loss < 5) kind = 'good';
    else if (loss < 10) kind = 'inaccuracy';
    else if (loss < 20) kind = 'mistake';
    else kind = 'blunder';
    if (kind === 'best' && isBest) {
      const second = e0.lines[1];
      const open = wpBest < 90 && wpBest > 10;
      if (open && wpAfter >= 50 && sacrifices(fens[i], played)) kind = 'brilliant';
      else if (open && second && wpBest - winPct(second.cp) >= 15) kind = 'great';
    }
    // a chance given back: the opponent had just erred, and this move lets it go
    const prev = out[i - 1];
    if ((kind === 'mistake' || kind === 'blunder' || kind === 'inaccuracy') && prev && (prev.kind === 'mistake' || prev.kind === 'blunder') && loss >= 8 && wpAfter < 70 && wpBest >= 60) kind = 'miss';
    out.push({ ply: i, kind, loss, accuracy: moveAccuracy(loss), cpAfter: white ? after : -after, best, bestCp });
  }
  return out;
}

/** mate or a draw on the board: the result from the side that just moved (cp), else null */
function gameEnd(fen: string | undefined): number | null {
  if (!fen) return null;
  const c = new Chess(fen);
  if (c.isCheckmate()) return 10000;
  if (c.isDraw() || c.isStalemate()) return 0;
  return null;
}

export interface SideSummary { accuracy: number | null; counts: Record<Kind, number> }
export function summarise(v: (MoveVerdict | null)[], whiteFirst: boolean): { w: SideSummary; b: SideSummary } {
  const mk = (): SideSummary => ({ accuracy: null, counts: Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<Kind, number> });
  const w = mk(), b = mk();
  const acc: { w: number[]; b: number[] } = { w: [], b: [] };
  v.forEach((x, i) => {
    if (!x) return;
    const s = (i % 2 === 0) === whiteFirst ? 'w' : 'b';
    (s === 'w' ? w : b).counts[x.kind]++;
    if (x.kind !== 'book') acc[s].push(x.accuracy);
  });
  w.accuracy = gameAccuracy(acc.w); b.accuracy = gameAccuracy(acc.b);
  return { w, b };
}
