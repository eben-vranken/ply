// What the review log says about the roadmap's changes (docs/ROADMAP.md 1c, 2h, 3a). Pure, so it is
// tested; `npm run log-check -- backup.json` prints it for a backup file.
import type { CardRow, RepRow, ReviewRow } from './db';

export interface Rate { n: number; rate: number | null }
const rate = (hits: number, n: number): Rate => ({ n, rate: n ? hits / n : null });

export interface LogCheck {
  reviews: number;
  credit: {
    /** misses on cards that were not due, of all misses (the size of the old bias) */
    againNotDue: Rate;
    implicitSuccesses: number;
    /** a lapse at the card's next due review, after a correct answer that was credited on the way / on time */
    lapseAfterImplicit: Rate;
    lapseAfterOnTime: Rate;
  };
  segments: {
    /** first-try correct on due reviews, by arm */
    firstTry: { landmark: Rate; move1: Rate };
    /** correct at the card's next due review, by the arm of the review before */
    nextReview: { landmark: Rate; move1: Rate };
    secondsPerMove: { landmark: number | null; move1: number | null };
  };
  branches: {
    /** lapses on due reviews at a branch of yours, and elsewhere */
    lapseAtBranch: Rate;
    lapseElsewhere: Rate;
    /** misses at a branch where the move played first was your other move there */
    siblingMisses: Rate;
    /** your other move played first, not counted as a miss */
    siblingAttempts: number;
    /** lapses at a branch when the other move was reviewed in the 3 days before, and when not */
    lapseTwinRecent: Rate;
    lapseTwinNot: Rate;
  };
}

const DAY = 864e5;
const isDue = (r: ReviewRow) => !r.implicit && r.mode !== 'drill-again' && (r.stage === 'young' || r.stage === 'mature');

export function logCheck(reviews: ReviewRow[], cards: CardRow[], rep: RepRow[]): LogCheck {
  const rs = [...reviews].sort((a, b) => a.at - b.at);
  const byCard = new Map<string, ReviewRow[]>();
  for (const r of rs) (byCard.get(r.cardId) ?? byCard.set(r.cardId, []).get(r.cardId)!).push(r);
  const card = new Map(cards.map((c) => [c.id, c]));
  const branchMoves = new Map<string, string[]>();
  for (const p of rep) if (p.moves.length > 1) branchMoves.set(p.side + p.epd, p.moves);
  const branchOf = (id: string) => { const c = card.get(id); return c && c.type === 'move' ? branchMoves.get(c.side + c.epd) : undefined; };
  const twinIds = (id: string) => {
    const c = card.get(id)!, ms = branchOf(id) ?? [];
    return cards.filter((x) => x.type === 'move' && x.side === c.side && x.epd === c.epd && x.move !== c.move && ms.includes(x.move)).map((x) => x.id);
  };
  /** the card's next review after `i` that was not credited on the way */
  const nextDue = (list: ReviewRow[], i: number) => list.slice(i + 1).find((x) => !x.implicit && x.mode !== 'drill-again');

  // 1c
  const misses = rs.filter((r) => r.rating === 1 && r.stage !== 'new' && r.mode !== 'drill-again');
  const notDue = misses.filter((r) => r.implicit || (r.prev && +new Date(r.prev.due) > r.at));
  let li = 0, ln = 0, oi = 0, on = 0;
  for (const list of byCard.values()) list.forEach((r, i) => {
    if (r.rating < 2 || r.stage === 'new' || r.stage === 'learning') return;
    const n = nextDue(list, i);
    if (!n) return;
    if (r.implicit) { ln++; if (n.rating === 1) li++; } else if (isDue(r)) { on++; if (n.rating === 1) oi++; }
  });

  // 2h
  const arm = (k: 0 | 1) => rs.filter((r) => isDue(r) && r.seg === k);
  const ft = (k: 0 | 1) => { const a = arm(k); return rate(a.filter((r) => r.rating > 1).length, a.length); };
  const secs = (k: 0 | 1) => { const a = arm(k); return a.length ? a.reduce((s, r) => s + r.ms, 0) / a.length / 1000 : null; };
  const nxt = (k: 0 | 1) => {
    let hit = 0, n = 0;
    for (const list of byCard.values()) list.forEach((r, i) => { if (r.seg !== k) return; const x = nextDue(list, i); if (x) { n++; if (x.rating > 1) hit++; } });
    return rate(hit, n);
  };

  // 3a
  const due = rs.filter(isDue);
  const atB = due.filter((r) => branchOf(r.cardId)), elsewhere = due.filter((r) => !branchOf(r.cardId));
  const bMiss = misses.filter((r) => branchOf(r.cardId));
  const sibMiss = bMiss.filter((r) => r.played && branchOf(r.cardId)!.includes(r.played));
  let tr = 0, trn = 0, tn = 0, tnn = 0;
  for (const r of atB) {
    const recent = twinIds(r.cardId).some((t) => (byCard.get(t) ?? []).some((x) => x.at < r.at && x.at >= r.at - 3 * DAY));
    if (recent) { trn++; if (r.rating === 1) tr++; } else { tnn++; if (r.rating === 1) tn++; }
  }

  return {
    reviews: rs.length,
    credit: { againNotDue: rate(notDue.length, misses.length), implicitSuccesses: rs.filter((r) => r.implicit && r.rating > 1).length, lapseAfterImplicit: rate(li, ln), lapseAfterOnTime: rate(oi, on) },
    segments: { firstTry: { landmark: ft(1), move1: ft(0) }, nextReview: { landmark: nxt(1), move1: nxt(0) }, secondsPerMove: { landmark: secs(1), move1: secs(0) } },
    branches: {
      lapseAtBranch: rate(atB.filter((r) => r.rating === 1).length, atB.length), lapseElsewhere: rate(elsewhere.filter((r) => r.rating === 1).length, elsewhere.length),
      siblingMisses: rate(sibMiss.length, bMiss.length), siblingAttempts: rs.filter((r) => r.sibling).length,
      lapseTwinRecent: rate(tr, trn), lapseTwinNot: rate(tn, tnn)
    }
  };
}

const pct = (r: Rate) => (r.rate === null ? '—' : `${(r.rate * 100).toFixed(1)}%`) + ` (n=${r.n})`;

export function formatLogCheck(c: LogCheck): string {
  return [
    `${c.reviews} reviews`,
    '',
    '1c. Credit on the way',
    `  misses on cards that were not due: ${pct(c.credit.againNotDue)} of misses`,
    `  correct answers credited on the way: ${c.credit.implicitSuccesses}`,
    `  lapse at the next due review, after credit on the way: ${pct(c.credit.lapseAfterImplicit)}`,
    `  lapse at the next due review, after an on-time review: ${pct(c.credit.lapseAfterOnTime)}`,
    '',
    '2h. Landmark lines (A/B)',
    `  first try correct: landmark ${pct(c.segments.firstTry.landmark)}, move 1 ${pct(c.segments.firstTry.move1)}`,
    `  correct at the next due review: landmark ${pct(c.segments.nextReview.landmark)}, move 1 ${pct(c.segments.nextReview.move1)}`,
    `  seconds per move: landmark ${c.segments.secondsPerMove.landmark?.toFixed(1) ?? '—'}, move 1 ${c.segments.secondsPerMove.move1?.toFixed(1) ?? '—'}`,
    '',
    '3a. Branches',
    `  lapse rate at a branch: ${pct(c.branches.lapseAtBranch)}; elsewhere: ${pct(c.branches.lapseElsewhere)}`,
    `  misses at a branch that were your other move: ${pct(c.branches.siblingMisses)}`,
    `  your other move played first (not a miss): ${c.branches.siblingAttempts}`,
    `  lapse at a branch, other move reviewed in the 3 days before: ${pct(c.branches.lapseTwinRecent)}; not: ${pct(c.branches.lapseTwinNot)}`,
    '',
    'Lapse rates are not controlled for stability: compare them with care while the counts are small.'
  ].join('\n');
}
