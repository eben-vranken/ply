// Importing a repertoire from PGN (a file, a paste or a Lichess study). Pure: the planner reads the
// games against what you play now and returns what would change, so the preview can show it and
// nothing is written until you confirm.
//
// - Your moves are the moves of the side you play (the game's [Orientation], else the side you pick).
//   Where the PGN gives you two moves at one position, the first (its main line) is kept unless you
//   keep the others as branches.
// - The opponent's moves are kept as your own book replies, so the lines follow them even past the
//   end of the Lichess tree or below the reply threshold.
// - A comment after your move becomes the note of the position you play it in; a comment after the
//   opponent's move becomes the note of the position you then face. Your own notes are never replaced.
import { START_EPD, child, turnOf, type Side } from '../chess';
import type { PgnGame, PgnNode } from '../pgn';

export interface GameInfo { name: string; side: Side | null; moves: number; skipped?: string }
export interface Pick { key: string; side: Side; epd: string; path: string[]; moves: string[]; note?: string; mineCount: number }
export interface Conflict { key: string; side: Side; epd: string; path: string[]; mine: string[]; theirs: string[] }
export interface Plan {
  games: GameInfo[];
  picks: Map<string, Pick>;
  replies: Map<string, { side: Side; epd: string; replies: string[] }>;
  /** you already play another move here (your own choice, not the default) */
  conflicts: Conflict[];
  /** positions the PGN adds as your own choice (where you had no choice of your own yet) */
  added: number;
  /** already your own choice */
  same: number;
  /** positions where the PGN gives you more than one move */
  branchy: Pick[];
  /** your moves at positions the band's tree does not reach */
  outside: number;
  /** your moves deeper than your line depth: kept, but not in your lines until the depth is raised */
  deep: number;
  notes: number;
  /** positions that already have a note of yours, kept as it is */
  notesKept: number;
}
export interface PlanInput {
  games: PgnGame[];
  /** the side for games without an [Orientation] header; null asks */
  side: Side | null;
  /** what you play now at a position, and whether it is your own choice */
  current: (side: Side, epd: string) => { moves: string[]; own: boolean };
  note: (side: Side, epd: string) => string | undefined;
  inTree: (epd: string) => boolean;
  depth: number;
}

export const gameName = (g: PgnGame, i: number) => {
  const h = g.headers;
  // a Lichess study chapter is "Study: Chapter"
  if (h.Event && h.Event !== '?' && !/^(Casual|Rated|Live Chess)\b/.test(h.Event)) return h.Event;
  if (h.White && h.Black && h.White !== '?') return `${h.White} – ${h.Black}`;
  return `Game ${i + 1}`;
};
export const sideOfGame = (g: PgnGame): Side | null => (/^w/i.test(g.headers.Orientation ?? '') ? 'w' : /^b/i.test(g.headers.Orientation ?? '') ? 'b' : null);

export function plan(input: PlanInput): Plan {
  const picks = new Map<string, Pick>();
  const replies = new Map<string, { side: Side; epd: string; replies: string[] }>();
  const games: GameInfo[] = [];
  input.games.forEach((g, i) => {
    const side = sideOfGame(g) ?? input.side;
    const info: GameInfo = { name: gameName(g, i), side, moves: 0 };
    games.push(info);
    if (g.setup) { info.skipped = 'Starts from a set-up position, not the opening position'; return; }
    if (g.error) { info.skipped = g.error; return; }
    if (!g.moves.length) { info.skipped = 'No moves'; return; }
    if (!side) { info.skipped = 'Pick the side you play'; return; }
    const rec = (list: PgnNode[], epd: string, path: string[], mine: number) => {
      for (const n of list) {
        info.moves++;
        const next = child(epd, n.uci);
        if (turnOf(epd) === side) {
          const key = side + '|' + epd;
          const p = picks.get(key) ?? { key, side, epd, path, moves: [], mineCount: mine };
          if (!p.moves.includes(n.uci)) p.moves.push(n.uci);
          if (n.comment) p.note = p.note ? `${p.note} ${n.comment}` : n.comment;
          picks.set(key, p);
          rec(n.children, next, [...path, n.uci], mine + 1);
        } else {
          const key = side + '|' + epd;
          const r = replies.get(key) ?? { side, epd, replies: [] };
          if (!r.replies.includes(n.uci)) r.replies.push(n.uci);
          replies.set(key, r);
          if (n.comment) {
            // the note goes with the position you face next
            const k2 = side + '|' + next;
            const p = picks.get(k2) ?? { key: k2, side, epd: next, path: [...path, n.uci], moves: [], mineCount: mine };
            p.note = p.note ? `${p.note} ${n.comment}` : n.comment;
            picks.set(k2, p);
          }
          rec(n.children, next, [...path, n.uci], mine);
        }
      }
    };
    rec(g.moves, START_EPD, [], 0);
  });
  // a note on a position where the PGN gives no move of yours stays only if you have a move there
  for (const [k, p] of picks) if (!p.moves.length && !input.current(p.side, p.epd).moves.length) picks.delete(k);

  const out: Plan = { games, picks, replies, conflicts: [], added: 0, same: 0, branchy: [], outside: 0, deep: 0, notes: 0, notesKept: 0 };
  for (const p of picks.values()) {
    if (p.note) { if (input.note(p.side, p.epd)) out.notesKept++; else out.notes++; }
    if (!p.moves.length) continue;
    if (p.moves.length > 1) out.branchy.push(p);
    if (!input.inTree(p.epd)) out.outside++;
    if (p.mineCount >= input.depth) out.deep++;
    const cur = input.current(p.side, p.epd);
    const same = cur.moves.length === p.moves.length && cur.moves.every((m) => p.moves.includes(m));
    if (!cur.own || !cur.moves.length) out.added++;
    else if (same) out.same++;
    else out.conflicts.push({ key: p.key, side: p.side, epd: p.epd, path: p.path, mine: cur.moves, theirs: p.moves });
  }
  out.conflicts.sort((a, b) => a.path.length - b.path.length);
  return out;
}

export type Choice = 'pgn' | 'mine' | 'both';
export interface Apply {
  rep: { side: Side; epd: string; moves: string[]; note?: string }[];
  book: { side: Side; epd: string; replies: string[] }[];
}

/** What to write: your choice per conflict, and whether extra moves of yours become branches. */
export function rows(p: Plan, opts: { choices: Record<string, Choice>; branches: boolean; current: PlanInput['current']; note: PlanInput['note'] }): Apply {
  const rep: Apply['rep'] = [];
  for (const pk of p.picks.values()) {
    const choice = opts.choices[pk.key] ?? 'pgn';
    const cur = opts.current(pk.side, pk.epd);
    const theirs = opts.branches ? pk.moves : pk.moves.slice(0, 1);
    const moves = !theirs.length ? cur.moves
      : choice === 'mine' ? cur.moves
      : choice === 'both' ? [...cur.moves, ...theirs.filter((m) => !cur.moves.includes(m))]
      : theirs;
    if (!moves.length) continue;
    // your own note stays; the PGN's note only fills an empty one, and not for a move you kept instead
    const note = pk.note && !opts.note(pk.side, pk.epd) && choice !== 'mine' ? pk.note : undefined;
    const unchanged = cur.own && moves.length === cur.moves.length && moves.every((m, i) => m === cur.moves[i]);
    if (unchanged && !note) continue;
    rep.push({ side: pk.side, epd: pk.epd, moves, note });
  }
  return { rep, book: [...p.replies.values()] };
}
