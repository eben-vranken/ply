# Ply backup format

**Export backup** in Settings writes one JSON file, `ply-backup-YYYY-MM-DD.json`, and hands it to the Android share sheet (plain download where sharing files is not supported). **Import backup** checks the file, asks for confirmation, replaces every user table with its contents and regenerates your lines. The baked opening data is not in the backup; it is downloaded again from the site.

This document is the contract for anything else that reads the file (Construct, scripts). `schemaVersion` is the version of this file format: it changes whenever what the file holds changes shape, and every older version stays importable. It is separate from the IndexedDB schema version inside the app.

| schemaVersion | Change |
| --- | --- |
| 1 | First format |
| 2 | Arcade's miss memory is a second `settings` row, `key: "arcade"` (it lived in the browser's localStorage before, outside the backup). A version 1 file restores with an empty Arcade memory |
| 3 | The `book` table: opponent replies you added yourself (PGN import, Explore). Older files restore with an empty book |

```ts
interface Backup {
  app: 'ply';
  schemaVersion: 3;
  exportedAt: string;          // ISO 8601
  dataVersion?: string;        // manifest version the backup was made with
  tables: {
    settings: { key: string; value: unknown }[];
    repertoire: RepRow[];
    cards: CardRow[];
    reviews: ReviewRow[];
    games: GameRow[];
    book?: BookRow[];          // from schemaVersion 3
  };
}
```

Dates inside FSRS card objects are ISO strings in the file; every other time is milliseconds since the Unix epoch. Moves are UCI, positions are EPD (first four FEN fields, see `docs/DATA_CONTRACT.md`).

## settings

### `key: "app"`

One row whose `value` holds every setting: daily limits (`newMoves`, `newTraps`, `newMistakes`, `maxReviews`), `hardSeconds`, `retention` (percent), `depth` (0 = auto), `replyPct`, `band` (0 = auto), `timeClasses`, `rollover` (hour), `sounds`, `vibration`, `delay` (ms), `showName`, `theme`, `autoNext`, `storageNoteSeen` (Safari's 7-day storage rule was explained), the focus openings (`focusW`, `focusB`: the UCI moves to the opening's position, space separated, or null),  the arcade numbers (`arcadeRating`, `arcadeBest`, `arcadeSolved`, `arcadeMissed`), `username`, the onboarding choices (`white`, `blackE4`, `blackD4`) and bookkeeping (`rating`, `autoBand`, `bandSet`, `pendingBand`, `pendingSince`, `lastBackup`, `lastSync`, `syncedArchives`, `extraNew`, `extraDay`).

### `key: "arcade"`

Arcade's memory, so positions you missed keep coming back after a restore.

```ts
interface ArcadeMemory {
  miss: Record<string, number>; // position key → clean solves still needed (traps 2, others 1)
  recent: string[];             // the last 600 position keys shown, so new ones come first
}
```

Position keys are `z:<puzzle id>`, `t:<trap id>`, `k:<mistake card id>` and `m:<side>:<move card id>`.

## repertoire

Your moves where they differ from the tree's default move. A position not listed uses the default.

```ts
interface RepRow {
  side: 'w' | 'b';   // which repertoire
  epd: string;       // position, you to move
  moves: string[];   // your moves in branch order (two or more = a branch)
  note?: string;     // your note for the position
}
```

## book

Opponent replies your lines follow at a position even where the band's opening tree has no data for it, or where the reply is below your reply threshold. They come from an imported PGN (the opponent's moves in it) and from **Set as my repertoire** in Explore. A position you have a move at (`repertoire`) plus the replies here are what lets your lines continue past the end of the tree.

```ts
interface BookRow {
  side: 'w' | 'b';   // which repertoire
  epd: string;       // position, opponent to move
  replies: string[]; // UCI moves your lines follow from here
}
```

## cards

```ts
interface CardRow {
  id: string;        // 'm…' move, 't<trap id>' punish/danger, 'z<puzzle id>' puzzle, 'k…' mistake
  type: 'move' | 'punish' | 'danger' | 'puzzle' | 'mistake';
  side: 'w' | 'b';
  epd: string;       // position shown (puzzles: after the opponent's first move)
  move: string;      // expected first move
  answer: string[];  // your moves (multi-move cards)
  line: string[];    // full sequence with replies
  accepted?: string[]; // mistake: every move within 30 cp of best
  played?: string;   // mistake: the move played in the game
  bait?: string; refute?: string[];
  label: string;     // "Italian Game: Giuoco Piano (C50)"
  path?: string[];   // most common move order from the start
  source?: string;   // "Punish · played by 6% at your band", "From your game vs …"
  fen?: string;      // puzzle start FEN
  ref?: string;      // trap id, puzzle id or game URL
  opening?: number;  // opening id in openings.json of the data version
  fsrs: {            // ts-fsrs Card
    due: string; stability: number; difficulty: number; elapsed_days: number;
    scheduled_days: number; learning_steps: number; reps: number; lapses: number;
    state: 0 | 1 | 2 | 3; // New, Learning, Review, Relearning
    last_review?: string;
  };
  due: number;       // fsrs.due as epoch ms (indexed)
  suspended: 0 | 1;  // retired or suspended
  created: number;
  lapses: number;
  loss?: number;     // mistake: win% lost in the game
}
```

A Move card id is a hash of side + EPD + expected move, so the same position reached by another move order is the same card, and a band or data change never loses a schedule.

## reviews

The full review log, kept so FSRS weights can be optimised later.

```ts
interface ReviewRow {
  id: number;
  cardId: string;
  at: number;                       // epoch ms
  rating: 1 | 2 | 3 | 4;            // Again, Hard, Good, Easy (Easy is never given)
  ms: number;                       // time taken
  mode: 'today' | 'learn' | 'drill-again';
  stage: 'new' | 'learning' | 'young' | 'mature'; // before this review
  prev?: object | null;             // FSRS card before the review (for Undo grade)
}
```

Files written while the Keep going mode existed (November 2026) can hold `mode: 'extra'`: reviews of due cards graded like Today. They import as `'today'`.

## games

```ts
interface GameRow {
  url: string;                      // chess.com game URL, or 'pgn:<hash>' for pasted games
  pgn: string;
  colour: 'w' | 'b';
  opponent: string;
  result: 'win' | 'loss' | 'draw';
  date: number;
  timeClass: string;                // rapid, blitz, daily, pasted
  rating?: number;                  // your rating in that game
  evals: (number | null)[];         // per ply, cp from White, null where not analysed
  analyzed: 0 | 1;
  mistakes?: string[];              // mistake card ids from this game
  uncovered?: string[];             // first reply your lines did not cover (UCI path)
}
```
