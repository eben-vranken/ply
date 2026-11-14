# Data contract: pipeline → app

`ply-data build` writes these files to `app/public/data/`. The app downloads them once, keeps them in IndexedDB (`data` table) and reads nothing else from the network except chess.com.

All positions are keyed by **EPD**: the first four FEN fields (pieces, side to move, castling, en passant). The en passant square is written only when an en passant capture is legal, so transpositions always merge. The Rust side uses shakmaty's `EnPassantMode::Legal`; the app's `epdOf()` / `child()` in `app/src/lib/chess.ts` produce the same strings (tested in `srs.test.ts`).

Moves are UCI everywhere (`e2e4`, `e1g1` for castling, `e7e8q` for promotion).

## Files

| File | Scope | Contents |
| --- | --- | --- |
| `manifest.json` | global | data version, month, build date, bands, `{name, bytes, sha256}` per file |
| `openings.json` | global | every named opening (plain JSON) |
| `tree-<band>.json.gz` | per band | the opening tree for one band |
| `traps-<band>.json.gz` | per band | Punish and Danger cards for one band |
| `puzzles.json.gz` | global | filtered Lichess opening puzzles |

Bands: 1000, 1200, 1400, 1600, 1800, 2000. A band covers games where **both** players are rated band − 100 … band + 99 on Lichess.

The `.gz` files are plain gzip. GitHub Pages serves them as binary, so the app decompresses them itself (`DecompressionStream('gzip')`). If a server has already decoded them, the app notices the missing gzip magic bytes and reads the text as is.

## manifest.json

```json
{
  "version": "2026-10-ddd7893",
  "month": "2026-10",
  "built": "2026-11-14",
  "bands": [1000, 1200, 1400, 1600, 1800, 2000],
  "files": [{ "name": "tree-1200.json.gz", "bytes": 4123456, "sha256": "…" }]
}
```

`version` is `<month>-<git short hash>`. A different version on launch (on Wi-Fi) makes the app re-download every file whose `sha256` changed and regenerate your lines.

## openings.json

```ts
interface Opening {
  id: number;      // index in this array; stable within one data version
  eco: string;     // "C50"
  name: string;    // "Italian Game: Giuoco Piano"
  family: string;  // "Italian Game" (name before the colon)
  epd: string;     // final position of the opening's moves
  uci: string[];   // the moves from the start position (extra field, used by search)
  san: string;     // the same moves in SAN (extra field)
}
```

When several rows end in the same position, the first row (ECO order) names it.

## tree-&lt;band&gt;.json.gz

```ts
type Tree = Record<string /* EPD */, TreeNode>;
interface TreeNode {
  g: number;   // games reaching this node at this band
  e: number;   // eval, centipawns from White; mates are ±(10000 − n)
  o?: number;  // opening id: its own name, else the nearest named ancestor
  d: string;   // default move for the side to move (UCI)
  m: [uci: string, games: number, whiteWins: number, draws: number, blackWins: number][];
}
```

- The tree covers the first 40 plies. A node is kept when at least 50 games reach it, and only if it is reachable from the start through kept nodes. If a band's gzipped file is over 25 MB, it is cut again at 100 games, then doubled until it fits.
- `m` lists every move played in at least 10 games, most played first. A move's child position may be below the 50-game cut and therefore missing from the tree; the app shows those rows without an eval and treats them as "the book ends here".
- `d` is the most-played move whose resulting eval is within 30 cp of the position's eval (the best move), from the mover's view. If none qualifies, it is the engine's best move.
- Counts come from lossy counting (see `pipeline/README.md`): any count can be low by at most about 10 games. Frequencies are `games / g`.

## traps-&lt;band&gt;.json.gz

```ts
interface Trap {
  id: string;               // first 8 bytes of sha256(epd, kind, move), hex
  kind: 'punish' | 'danger';
  epd: string;              // position shown on the card
  side: 'w' | 'b';          // side you play on this card
  answer: string[];         // your moves
  line: string[];           // answer moves with the opponent's replies between them
  bait?: string;            // danger: the tempting losing move
  refute?: string[];        // danger: how the bait gets punished (up to 5 plies)
  loss: number;             // win% points lost by the mistake (Lichess formula)
  freq: number;             // share of this node's games that play the mistake, 0–1
  o: number;                // opening id
}
```

- **Punish:** a move with frequency ≥ 3% and loss ≥ 15 whose resulting position is in the tree. `epd` is the position after the mistake. The answer is the engine's principal variation, cut so that every punishing move after the first is a capture or a check (quiet follow-ups have many good moves and would grade a fine answer as wrong), up to 3 punishing moves.
- **Danger:** the same moves when frequency ≥ 5%. `epd` is the position before the move, `answer` is the default move, `bait` is the losing move. The app replaces `answer` with your repertoire move when it differs and is not the bait.

## puzzles.json.gz

```ts
interface Puzzle {
  id: string;         // Lichess puzzle id
  fen: string;        // full FEN, before the opponent's move
  moves: string[];    // UCI; the first move is the opponent's and plays automatically
  rating: number;
  themes: string[];
  families: number[]; // opening ids matched from OpeningTags
  plays: number;      // NbPlays (extra field, orders new puzzles)
}
```

Kept: OpeningTags not empty, full-move number ≤ 15, Popularity ≥ 80, NbPlays ≥ 300, Rating ≤ 2000. Tags match opening names with underscores turned into spaces, case and punctuation ignored. At most 150 per opening family (the first tag), most played first.

## Sources and licences

All inputs are CC0: lichess-org/chess-openings, the Lichess standard rated games database, the Lichess evaluation database and the Lichess puzzle database. Positions missing from the evaluation database are analysed with Stockfish 17 (GPL-3.0) at depth 18.
