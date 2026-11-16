// Typing moves on a keyboard (desktop). Pure, so it is tested: given the legal moves of a
// position and what has been typed so far, which move is meant, and is it certain yet.
//
// Accepted: SAN with or without x, +, #, = and annotation marks (Nf3, exd5, e8=Q, e8q),
// piece letters in lower case (nf3), castling as O-O, 0-0, oo, and UCI (g1f3, e7e8q).
// Upper case decides between a bishop and a b-pawn (Bc4 / bc4); lower case "bc4" alone
// waits for Enter when both a bishop and a b-pawn could go there.

export interface Legal { san: string; uci: string }

/** SAN or typed text reduced to what identifies the move. */
export function normMove(s: string): string {
  const c = s.replace(/[\s+#!?:]/g, '');
  if (/^[oO0](-?[oO0]){1,2}$/.test(c)) return c.replace(/-/g, '').replace(/[o0]/g, 'O');
  return c.replace(/[xX=\-]/g, '');
}

export interface Match {
  /** the move to play now, when the typing can only mean one move */
  sure: Legal | null;
  /** the move Enter plays (null: nothing certain yet) */
  best: Legal | null;
  /** moves the typing could still become, best first */
  options: Legal[];
}

export function matchMove(typed: string, legal: Legal[]): Match {
  const t = normMove(typed);
  if (!t) return { sure: null, best: null, options: [] };
  const lt = t.toLowerCase();
  const keyed = legal.map((m) => ({ m, k: normMove(m.san), u: m.uci.toLowerCase() }));
  const exact = keyed.filter((x) => x.k === t);
  const loose = keyed.filter((x) => x.k.toLowerCase() === lt || x.u === lt);
  const starts = keyed.filter((x) => x.k.toLowerCase().startsWith(lt) || x.u.startsWith(lt));
  // exact case first (bc4 is the pawn, Bc4 the bishop), then a single case-insensitive or UCI match
  const best = exact.length === 1 ? exact[0] : loose.length === 1 ? loose[0] : null;
  // certain: one reading, and nothing longer starts with it (O-O versus O-O-O). A capital piece
  // letter is never in doubt; lower case has to be certain ignoring case as well.
  const capital = /^[NBRQK]/.test(t);
  const plain = typed.replace(/[\s+#!?]/g, '');
  const literal = legal.filter((m) => m.san.replace(/[+#]/g, '') === plain);
  const sure = !best ? null
    : literal.length === 1 && literal[0] === best.m && starts.length <= (loose.length || 1) ? best.m
    : capital ? (exact.length === 1 && keyed.filter((x) => x.k.startsWith(t)).length === 1 ? best.m : null)
    : loose.length === 1 && starts.length === 1 ? best.m : null;
  const options = [...new Set([...exact, ...loose, ...starts].map((x) => x.m))].slice(0, 6);
  return { sure, best: best?.m ?? (starts.length === 1 ? starts[0].m : null), options };
}

/** Keys that are never part of a move, so they can drive the screen while nothing is typed. */
export type KeyAction = 'hint' | 'next' | 'undo' | 'back' | 'fwd' | 'stop';
export function actionOf(e: { key: string }): KeyAction | null {
  if (e.key === '?') return 'hint';
  if (e.key === 'Enter' || e.key === ' ') return 'next';
  if (e.key === 'ArrowRight') return 'fwd';
  if (e.key === 'Backspace') return 'undo';
  if (e.key === 'ArrowLeft') return 'back';
  if (e.key === 'Escape') return 'stop';
  return null;
}

/** Characters that can start or continue a typed move. */
export const isMoveChar = (k: string) => k.length === 1 && /[a-hA-H1-8nNbBrRqQkKoO0xX=+#\-]/.test(k);
