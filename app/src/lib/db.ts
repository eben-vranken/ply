// IndexedDB via Dexie. Schema documented in docs/backup-format.md.
import Dexie, { type Table, type IndexableType } from 'dexie';
import type { Card as FsrsCard } from 'ts-fsrs';
import type { Side } from './chess';

/** Dexie schema version: every change to the stores bumps it and adds a version() block. */
export const DB_VERSION = 4;
/**
 * Backup file format (docs/backup-format.md, `schemaVersion`): bumps whenever what the
 * file holds changes shape. Every older version stays importable.
 * 2: Arcade's miss memory is a `settings` row (key "arcade"); it lived in localStorage before.
 * 3: the `book` table: opponent replies you added yourself (imported PGN, Explore).
 * 4: rows carry `updatedAt` (sync change time) and the "app" settings row its per-key `stamps`.
 */
export const BACKUP_VERSION = 4;

/** Arcade: positions you missed (key → solves still needed) and the ones seen lately. */
export interface ArcadeMemory { miss: Record<string, number>; recent: string[] }

export type CardType = 'move' | 'punish' | 'danger' | 'puzzle' | 'mistake';
export type Mode = 'today' | 'learn' | 'drill-again';
/**
 * Keep going (removed) logged its reviews as 'extra': real reviews of due cards, graded like
 * Today. Old databases and backups can still hold the value; it reads as 'today'.
 */
export const LEGACY_MODES: Record<string, Mode> = { extra: 'today' };

export interface CardRow extends Tracked {
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

export interface ReviewRow extends Tracked {
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
  /** 1 when the card was not due: a move played on the way along a line (docs/ROADMAP.md, phase 1a) */
  implicit?: 1;
  /** review lines: the session's A/B arm (1: played from the landmark, 0: from move 1) */
  seg?: 0 | 1;
  /** a miss: the move played first */
  played?: string;
  /** at a branch: your other move was played first (not a miss) */
  sibling?: 1;
  /** a miss at a branch within 3 days of a review of your other move there (interference) */
  sib?: 1;
}

export interface RepRow extends Tracked {
  side: Side;
  epd: string;
  moves: string[];
  note?: string;
}

/** Opponent replies your lines follow at a position, beyond the band's tree (imported PGN, Explore). */
export interface BookRow extends Tracked {
  side: Side;
  epd: string;
  replies: string[];
}

export interface GameRow extends Tracked {
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

export interface SettingRow extends Tracked {
  key: string;
  value: unknown;
  /** the "app" row: when each setting last changed (ms; 0 = an onboarding or default value), for sync */
  stamps?: Record<string, number>;
}

/** Sync (lib/cloud): when a row last changed on this device, ms since the epoch. 0 = a default nobody chose. */
export interface Tracked { updatedAt?: number }
/** A deleted row of a synced table, kept so the deletion reaches your other devices. */
export interface TombRow { t: SyncedTable; k: string; at: number }
/** Device-only bookkeeping (sync cursors). Never synced, never in a backup. */
export interface MetaRow { key: string; value: unknown }

/** The tables that sync. The opening data (`data`) never does. */
export const SYNCED = ['settings', 'repertoire', 'book', 'cards', 'reviews', 'games'] as const;
export type SyncedTable = (typeof SYNCED)[number];

export class PlyDB extends Dexie {
  settings!: Table<SettingRow, string>;
  repertoire!: Table<RepRow, [Side, string]>;
  cards!: Table<CardRow, string>;
  reviews!: Table<ReviewRow, number>;
  games!: Table<GameRow, string>;
  book!: Table<BookRow, [Side, string]>;
  data!: Table<DataRow, string>;
  tomb!: Table<TombRow, [string, string]>;
  meta!: Table<MetaRow, string>;
  /** track: stamp every write with updatedAt (the app). The sync engine writes through an untracked connection. */
  constructor(name = 'ply', track = true) {
    super(name);
    this.version(1).stores({
      settings: 'key',
      repertoire: '[side+epd], side',
      cards: 'id, type, due, suspended, side, epd',
      reviews: '++id, cardId, at',
      games: 'url, date, analyzed',
      data: 'name'
    });
    // 2: reviews logged by Keep going ('extra') become ordinary 'today' reviews
    this.version(2).stores({}).upgrade((tx) => tx.table('reviews').toCollection().modify((r: { mode: string }) => { if (r.mode in LEGACY_MODES) r.mode = LEGACY_MODES[r.mode]; }));
    // 3: your own book replies
    this.version(3).stores({ book: '[side+epd], side' });
    // 4: sync. Every synced row gets updatedAt (existing rows: now), deletions leave a tombstone,
    // reviews get a natural key (card + time) since their numeric ids differ per device
    this.version(4).stores({
      settings: 'key, updatedAt',
      repertoire: '[side+epd], side, updatedAt',
      book: '[side+epd], side, updatedAt',
      cards: 'id, type, due, suspended, side, epd, updatedAt',
      reviews: '++id, cardId, at, [cardId+at], updatedAt',
      games: 'url, date, analyzed, updatedAt',
      tomb: '[t+k], at',
      meta: 'key'
    }).upgrade(async (tx) => {
      const now = Date.now();
      for (const t of SYNCED) await tx.table(t).toCollection().modify((r: Tracked & Partial<SettingRow>) => {
        r.updatedAt = now;
        if (t === 'settings' && r.key === 'app' && r.value && typeof r.value === 'object') r.stamps = Object.fromEntries(Object.keys(r.value).map((k) => [k, now]));
      });
    });
    if (track) for (const t of SYNCED) {
      const table = this.table(t);
      table.hook('creating', (_k, obj: Tracked) => { obj.updatedAt = Date.now(); });
      table.hook('updating', () => ({ updatedAt: Date.now() }));
    }
  }
}

export const db = new PlyDB();
let rawConn: PlyDB | null = null;
/** The same database without change stamps: for the sync engine and for defaults written with updatedAt 0. */
export const rawDb = () => (rawConn ??= new PlyDB(db.name, false));

/** The sync key of a row: one string per row, the same on every device. */
export function rowKey(t: SyncedTable, r: Record<string, unknown>): string {
  switch (t) {
    case 'settings': return r.key as string;
    case 'repertoire': case 'book': return r.side + '|' + r.epd;
    case 'cards': return r.id as string;
    case 'reviews': return r.cardId + '|' + r.at;
    case 'games': return r.url as string;
  }
}

/** Delete rows from a synced table and leave tombstones, so the deletion syncs. */
export async function removeRows(t: Exclude<SyncedTable, 'reviews'>, keys: IndexableType[]) {
  if (!keys.length) return;
  const table = db.table(t);
  await db.transaction('rw', [table, db.tomb], async () => {
    const rows = (await table.bulkGet(keys)).filter(Boolean) as Record<string, unknown>[];
    const at = Date.now();
    await db.tomb.bulkPut(rows.map((r) => ({ t, k: rowKey(t, r), at })));
    await table.bulkDelete(keys);
  });
}
/** Delete a review by its local id, leaving a tombstone (Undo grade). */
export async function removeReview(id: number) {
  await db.transaction('rw', [db.reviews, db.tomb], async () => {
    const r = await db.reviews.get(id);
    if (!r) return;
    await db.tomb.put({ t: 'reviews', k: rowKey('reviews', r as unknown as Record<string, unknown>), at: Date.now() });
    await db.reviews.delete(id);
  });
}
