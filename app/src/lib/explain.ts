// Why a move is played, in a sentence or two, worked out from the position itself:
// what it takes, what it attacks, what it develops, where the king goes. It is a
// plain reading of the board, not engine analysis, so it never claims more than it sees.
import { Chess, type Square, type PieceSymbol, type Color } from 'chess.js';
import { fenOf } from './chess';

const NAME: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const CENTRE = ['d4', 'e4', 'd5', 'e5'];
const SQUARES = 'abcdefgh'.split('').flatMap((f) => [1, 2, 3, 4, 5, 6, 7, 8].map((r) => (f + r) as Square));
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs.at(-1));

/**
 * @param share how often the move is played here at your level (0..1), when known
 */
export function explain(epd: string, uci: string, share?: number): string {
  let c: Chess;
  try { c = new Chess(fenOf(epd)); } catch { return ''; }
  const me = c.turn() as Color, them: Color = me === 'w' ? 'b' : 'w';
  const side = them === 'w' ? 'White' : 'Black';
  const from = uci.slice(0, 2) as Square;
  const hung = c.isAttacked(from, them) && !c.isAttacked(from, me);
  let mv;
  try { mv = c.move({ from, to: uci.slice(2, 4), promotion: uci[4] }); } catch { return ''; }
  const to = mv.to as Square, piece = mv.piece, out: string[] = [];
  const homeRank = me === 'w' ? '1' : '8';

  if (c.isCheckmate()) return 'Checkmate.';
  if (mv.isKingsideCastle() || mv.isQueensideCastle()) out.push('Castles: the king leaves the centre and the rook comes into the game.');
  else if (mv.captured) {
    const defended = c.isAttacked(to, them);
    if (VALUE[mv.captured] > VALUE[piece]) out.push(`Wins the ${NAME[mv.captured]} for a ${NAME[piece]}.`);
    else if (!defended) out.push(`Takes the ${NAME[mv.captured]} on ${to}, and nothing can take back.`);
    else if (VALUE[mv.captured] === VALUE[piece] || (VALUE[mv.captured] === 3 && VALUE[piece] === 3)) out.push(`Trades ${NAME[piece]} for ${NAME[mv.captured]} on ${to}.`);
    else out.push(`Takes the ${NAME[mv.captured]} on ${to}.`);
  }
  if (mv.promotion) out.push(`Promotes to a ${NAME[mv.promotion]}.`);

  // what the moved piece now attacks: anything worth more than it, or anything loose
  const targets: string[] = [];
  let weak = '';
  for (const s of SQUARES) {
    const p = c.get(s);
    if (!p || p.color !== them || p.type === 'k') continue;
    if (!c.attackers(s, me).includes(to)) continue;
    const loose = !c.isAttacked(s, them);
    if ((s === 'f7' || s === 'f2') && p.type === 'p' && c.attackers(s, them).length === 1 && c.get(s === 'f7' ? 'e8' : 'e1')?.type === 'k') weak = s;
    else if (VALUE[p.type] > VALUE[piece] || (loose && p.type !== 'p')) targets.push(`the ${NAME[p.type]} on ${s}`);
    else if (loose && p.type === 'p' && piece !== 'p') targets.push(`the loose pawn on ${s}`);
  }
  if (c.inCheck()) out.push(targets.length ? `Check, and it also hits ${list(targets.slice(0, 2))}: ${side} cannot save both.` : `Check: ${side} has to deal with it before anything else.`);
  else if (targets.length) out.push(`Attacks ${list(targets.slice(0, 2))}.`);
  if (weak) out.push(`Aims at ${weak}, the weakest point in ${side}'s camp: only the king guards it.`);

  if (!out.length || (out.length === 1 && weak)) {
    const centre = CENTRE.filter((s) => c.attackers(s as Square, me).includes(to));
    if (piece === 'p') {
      const two = Math.abs(+to[1] - +from[1]) === 2;
      if (CENTRE.includes(to)) out.push(two ? 'Takes space in the centre and opens lines for the pieces behind it.' : 'Puts a pawn in the centre.');
      else if ('cf'.includes(to[0]) && two) out.push(`Fights for the centre from the side: it eyes ${centre[0] ?? 'the middle'} without giving up a centre pawn.`);
      else if ('de'.includes(to[0])) out.push('Props up the centre and lets the bishop out.');
      else if ('ah'.includes(to[0])) out.push(`A small safety move: it keeps ${side}'s pieces off ${to[0] === 'h' ? 'g' : 'b'}${me === 'w' ? 4 : 5} and gives the king air later.`);
      else if ('bg'.includes(to[0])) out.push('Makes room to put the bishop on the long diagonal.');
      else out.push('Gains space on the wing.');
    } else if (piece === 'b' && ['g2', 'b2', 'g7', 'b7'].includes(to)) out.push('Fianchettoes the bishop: from here it rakes the long diagonal.');
    else if ((piece === 'n' || piece === 'b') && from[1] === homeRank) {
      out.push(`Develops the ${NAME[piece]}${centre.length ? `, where it watches ${list(centre)}` : ' to an active square'}.`);
    } else if (hung) out.push(`Moves the ${NAME[piece]} out of danger${centre.length ? ` and keeps an eye on ${list(centre)}` : ''}.`);
    else if (piece === 'q') out.push('Brings the queen to a square where she is useful and hard to chase.');
    else if (piece === 'r') out.push(c.get((to[0] + (me === 'w' ? 2 : 7)) as Square)?.type === 'p' ? 'Puts the rook behind its pawn, ready for the file to open.' : 'Brings the rook to an open line.');
    else if (piece === 'k') out.push('Steps the king to a safer square.');
    else if (centre.length) out.push(`Improves the ${NAME[piece]}: from ${to} it watches ${list(centre)}.`);
  }
  if (share !== undefined && share >= 0.02 && out.length < 2) out.push(share >= 0.5 ? `The main move at your level, played in ${Math.round(share * 100)}% of games.` : `Played in ${Math.round(share * 100)}% of games at your level.`);
  return out.slice(0, 2).join(' ');
}
