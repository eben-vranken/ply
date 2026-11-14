// IndexedDB via Dexie. Schema documented in docs/backup-format.md; every schema
// change bumps SCHEMA_VERSION and adds a Dexie version() block.
import Dexie, { type Table } from 'dexie';
import type { Card as FsrsCard } from 'ts-fsrs';
import type { Side } from './chess';

export const SCHEMA_VERSION = 1;

export type CardType = 'move' | 'punish' | 'danger' | 'puzzle' | 'mistake';
export type Mode = 'today' | 'learn' | 'drill-again';

export interface CardRow {
  id: string;
  type: CardType;
  side: Side;
  /** position shown on the card (for puzzles: after the opponent's first move) */
  epd: string;
  /** the expected first move (UCI) */
  move: string;
  /** your moves, opponent replies auto-played between */
  answer: string[];
  /** full sequence: answer moves and replies */
  line: string[];
  /** mistake cards: every move within 30 cp of best */
  accepted?: string[];
  /** mistake cards: the move played in the game */
  played?: string;
  bait?: string;
  refute?: string[];
  /** opening name and ECO, e.g. "Italian Game (C50)" */
  label: string;
  /** most common move order reaching the position, UCI from the start */
  path?: string[];
  /** "Punish · played by 6% at your band" / "From your game vs X, date" */
  source?: string;
  /** puzzles: start FEN before the auto-played first move */
  fen?: string;
  ref?: string; // trap id, puzzle id or game url
  opening?: number;
  fsrs: FsrsCard;
  due: number;
  suspended: 0 | 1;
  created: number;
  /** lapses in the last reviews, maintained for the Weakest list */
  lapses: number;
  /** mistake cards: win% lost in the game */
  loss?: number;
}

export interface ReviewRow {
  id?: number;
  cardId: string;
  at: number;
  rating: 1 | 2 | 3 | 4;
  ms: number;
  mode: Mode;
  /** stage before this review, for retention by young / mature */
  stage: 'new' | 'learning' | 'young' | 'mature';
  /** card before the review, so Undo grade can restore it */
  prev?: FsrsCard | null;
}

export interface RepRow {
  side: Side;
  epd: string;
  moves: string[];
  note?: string;
}

export interface GameRow {
  url: string;
  pgn: string;
  colour: Side;
  opponent: string;
  result: 'win' | 'loss' | 'draw';
  date: number;
  timeClass: string;
  rating?: number;
  /** eval after each ply, cp from White, null where not analysed */
  evals: (number | null)[];
  analyzed: 0 | 1;
  mistakes?: string[];
  /** first opponent reply your lines do not cover (UCI path from the start) */
  uncovered?: string[];
}

export interface DataRow {
  name: string;
  bytes?: ArrayBuffer;
  text?: string;
  sha256: string;
  version: string;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

export class PlyDB extends Dexie {
  settings!: Table<SettingRow, string>;
  repertoire!: Table<RepRow, [Side, string]>;
  cards!: Table<CardRow, string>;
  reviews!: Table<ReviewRow, number>;
  games!: Table<GameRow, string>;
  data!: Table<DataRow, string>;
  constructor(name = 'ply') {
    super(name);
    this.version(1).stores({
      settings: 'key',
      repertoire: '[side+epd], side',
      cards: 'id, type, due, suspended, side, epd',
      reviews: '++id, cardId, at',
      games: 'url, date, analyzed',
      data: 'name'
    });
  }
}

export const db = new PlyDB();
