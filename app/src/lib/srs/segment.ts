// Where a review line starts in earnest (docs/ROADMAP.md, phase 2).
//
// A line still begins at move 1, but the moves before its landmark play fast by themselves: the
// trunk you know is not asked again. The landmark is the opponent's last reply before the first
// due move that is not the most played one (the reply that makes this line this line), else your
// last branch or transposition before it. That reply is paused on and named: "Rare …Nf6, 7% at your
// level". A trunk move that is nearly due or weak is still asked. Pure: everything comes in as
// arguments, so it is unit tested.
import { turnOf, type Side } from '../chess';

export interface SegmentInput {
  side: Side;
  path: string[];
  /** epds[i]: the position before path[i] */
  epds: string[];
  /** indices of the moves that are due (graded) */
  due: number[];
  /** the most played reply at an opponent position, by the band's data */
  top: (epd: string) => string | undefined;
  /** a branch of yours or a position reached by more than one move order */
  landmark: (epd: string) => boolean;
  /** play the whole line from move 1 this time (reintegration) */
  full?: boolean;
}

export interface Segment {
  /** moves before this index without an ask play fast by themselves */
  scrub: number;
  /** the opponent reply that sets this line apart, paused on and named */
  deviation?: number;
}

/** Fewer moves than this before the landmark: not worth scrubbing. */
const MIN_SCRUB = 2;

export function segment(s: SegmentInput): Segment {
  if (!s.due.length) return { scrub: 0 };
  const first = Math.min(...s.due);
  let deviation: number | undefined;
  for (let j = first - 1; j >= 0; j--) {
    if (turnOf(s.epds[j]) === s.side) continue;
    const t = s.top(s.epds[j]);
    if (t && t !== s.path[j]) { deviation = j; break; }
  }
  let at = deviation ?? 0;
  if (deviation === undefined) for (let k = first; k > 0; k--) if (s.landmark(s.epds[k])) { at = k; break; }
  const scrub = s.full || at < MIN_SCRUB ? 0 : at;
  return { scrub, deviation };
}

/** "Rare …Nf6: 7% at your level" / "…Nf6: 31% at your level, not the main reply" */
export function deviationText(san: string, share: number | undefined, byBlack: boolean): string {
  const m = (byBlack ? '…' : '') + san;
  if (share === undefined) return `${m}: a reply from your own book`;
  const pct = Math.max(1, Math.round(share * 100));
  return share < 0.15 ? `Rare ${m}: ${pct}% at your level` : `${m}: ${pct}% at your level, not the main reply`;
}

/** Every few days a line plays from move 1 with nothing scrubbed: a stable, varying fifth of lines. */
export function wholeLineToday(path: string[], studyDay: number): boolean {
  let h = Math.floor(studyDay / 864e5) | 0;
  for (const u of path) for (let i = 0; i < u.length; i++) h = (Math.imul(h, 31) + u.charCodeAt(i)) | 0;
  return ((h >>> 0) % 5) === 0;
}
