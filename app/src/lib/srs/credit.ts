// Credit for the moves you play on a line that were not due (docs/ROADMAP.md, phase 1a).
//
// A miss on such a move always gives Again. A correct answer is a real FSRS review at its real
// elapsed time too: FSRS already gives an early review little gain (at R = 0.97 about 29% of an
// on-time one), so it needs no discount of its own. Some cards get no credit from a correct answer:
//  - cards in a learning or relearning step: their short steps bring them back by themselves;
//  - hard cards (FSRS difficulty ≥ 8): they need their own reviews, not credit in passing;
//  - cards already reviewed today: the moves every line shares (1.e4) count once a day, not in every line.
import { State, type Card } from './fsrs';

export const HARD_DIFFICULTY = 8;

export function earnsCredit(c: Card, reviewedToday: boolean): boolean {
  return !reviewedToday && c.state === State.Review && c.difficulty < HARD_DIFFICULTY;
}
