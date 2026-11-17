// What the training room plays. Every card type becomes an Item: a start
// position, moves set up instantly, then a sequence where the opponent's moves
// auto-play and yours are asked. Moves are UCI throughout.
import type { Side } from './chess';
import type { MoveSpec } from './srs/lines';

export interface Ask {
  /** card answered at this move (Move cards in a line) */
  card?: string;
  /** this answer changes the schedule when correct (due or new) */
  graded?: boolean;
  /** Learn style: arrow and note, then play it */
  intro?: boolean;
  /** any of these is correct (Mistake cards) */
  accepted?: string[];
  /** your other moves at a branch position */
  other?: string[];
  /** at a branch position: what tells this move apart from your others (lib/cue.ts) */
  cue?: string;
}

export type Kind = 'line' | 'new' | 'punish' | 'danger' | 'puzzle' | 'mistake' | 'drill';

export interface Item {
  kind: Kind;
  side: Side;
  /** EPD or full FEN the item starts from */
  start: string;
  setup: string[];
  moves: string[];
  asks: Record<number, Ask>;
  prompt: string;
  /** "Italian Game: Giuoco Piano (C50)" for the answer screen */
  label: string;
  /** moves from the game start to the card position, for "1.e4 e5 2.?" */
  order: string;
  /** other move orders reaching it, shown on tap */
  others?: string[];
  source?: string;
  note?: string;
  /** Danger: the tempting wrong move and how it is punished */
  bait?: { uci: string; san: string; refute: string[] };
  /** Mistake: what you played in the game and how it was punished */
  played?: { uci: string; refute: string[] };
  /** single-card items (traps, puzzles, mistakes): graded as one card */
  card?: string;
  /** a trap or puzzle not yet a card: created when answered */
  intro?: { kind: 'trap' | 'puzzle'; ref: string };
  /** a new Move card introduced in this item */
  spec?: MoveSpec;
  /** Drill: replies are drawn live from the tree, any of your moves is accepted */
  drill?: { depth: number; rare: boolean };
  /** a Lichess puzzle's id, to fetch the game before it */
  puzzle?: string;
  /** Arcade: what the position is, how hard it is, and whether it came back after a miss */
  arcade?: { key: string; level: number; back?: boolean };
  /** Today item came from the daily queue (counts toward Done today) */
  today?: boolean;
}

export interface AskResult {
  wrong: boolean;
  hinted: boolean;
  playable: boolean;
  ms: number;
  /** the move finally played (Drill can branch) */
  uci: string;
  epd: string;
}

export interface Outcome {
  item: Item;
  results: Record<number, AskResult>;
}
