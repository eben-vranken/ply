# Ply — Chess SRS App Build Brief

Nov 14, 2026 · @Eben Vranken

## Summary

Ply is an offline, installable phone app (PWA) that trains chess openings, opening traps and your own mistakes with spaced repetition. Every named opening ships inside the app: you never type in lines. It should look and feel like an impressive, premium mobile app; the visual design is entirely the builder's call (see Design direction).

Three ways to train:

- **Today**: the daily spaced-repetition queue, capped by limits you set.
- **Explore → Learn**: pick any position in the opening tree and learn the lines below it, adding them to your spaced-repetition reviews.
- **Explore → Drill**: practice any subtree on demand without touching your schedule.

Goals for v1:

1. Never be surprised in the first 8–12 moves of your openings by a reply people at your rating actually play.
2. Know every common trap in your openings, both how to punish it and how to avoid falling into it.
3. Turn each real mistake from your chess.com games into a card you review until it sticks.

The working name is Ply. It stays a separate app from Construct for v1.

## Locked decisions

Everything below is decided. Change a row here first, then the code.

| Topic | Decision |
| --- | --- |
| Platform | Offline-first installable PWA for Android Chrome (Samsung Galaxy S20 FE), designed for the phone in portrait; responsive layouts for landscape, tablets and desktop (DESIGN.md, "Wide screens"). The installed app's manifest still asks for portrait |
| Hosting | GitHub Pages, repo `eben-vranken/ply`, license GPL-3.0 (required by chessground and Stockfish) |
| Frontend | Svelte 5 + TypeScript + Vite |
| Board | `@lichess-org/chessground` |
| Rules / move validation | `chess.js` |
| SRS algorithm | FSRS via `ts-fsrs`, desired retention 0.90, max interval 365 days, fuzz on |
| On-device engine | Stockfish lite WASM (single-threaded) in a Web Worker; used only to analyze imported games |
| Storage | IndexedDB via Dexie |
| Data pipeline | Rust CLI (`shakmaty`, `pgn-reader`, `zstd`) run on the desktop; native Stockfish 17 for gaps |
| Opening data | Lichess `chess-openings` (names, ECO), Lichess game database (frequencies), Lichess evaluation database (evals), Lichess puzzle database (traps). All CC0 |
| Rating bands | Lichess bands 1000, 1200, 1400, 1600, 1800, 2000 (the pipeline can add higher bands; the app offers whatever the manifest lists). Your band = chess.com rapid rating + 350, rounded to the nearest band |
| Your moves (default) | Per position: the most-played move at your band whose eval is within 30 centipawns of the best move |
| Opponent moves | Every reply with at least 3% frequency at your band, minimum 50 games |
| Line depth | Auto by chess.com rapid rating: under 1000 → 8 of your moves, 1000–1299 → 10, 1300–1599 → 12, 1600+ → 14 |
| Starter repertoire | White: 1.e4, Italian Game (Giuoco Piano). Black vs 1.e4: 1...e5. Black vs 1.d4: 1...d5, Queen's Gambit Declined. Black vs anything else: 1...d5 or 1...e5 by the default-move rule. Fully editable |
| Grading | Automatic: no Anki buttons |
| Day rollover | 04:00 local time |
| Mistake source | chess.com public API (rapid by default), with PGN paste as fallback |
| Construct link | None in v1; the backup JSON format is documented so Construct can read it later |
| Visual design | Fully open: the builder owns the visual design (see Design direction). The only fixed constraints are the ones listed there |

## Tech stack and repo layout

One monorepo with two parts: a Rust pipeline that builds the data on your desktop, and the PWA that ships it.

```
ply/
  pipeline/            Rust CLI: ply-data
    src/
      openings.rs      parse chess-openings TSVs
      games.rs         stream Lichess games, count moves per band
      evals.rs         join Lichess eval DB, Stockfish for misses
      traps.rs         puzzles + punish/danger detection
      emit.rs          write app data files
  app/                 Svelte PWA
    src/
      lib/board/       chessground wrapper
      lib/srs/         FSRS wrapper, queue builder, grading
      lib/tree/        tree loading, lookups by position key
      lib/db/          Dexie schema + migrations
      lib/engine/      Stockfish worker
      lib/import/      chess.com client, PGN parser, mistake finder
      routes/          Today, Explore, Repertoire, Settings
    public/data/       pipeline output (committed directly; the size budget keeps every file under 50 MB)
  docs/backup-format.md
```

- Position key everywhere: the first four FEN fields (pieces, side to move, castling, en passant), called **EPD**. It merges transpositions.
- `vite-plugin-pwa` generates the service worker. App shell and the active band's data are precached.
- Tests: Vitest for SRS, queue and grading logic; `cargo test` for the pipeline.
- Deployment: GitHub Actions builds `app/` and publishes to GitHub Pages on every push to `main`.

## Data pipeline (ply-data)

The pipeline runs once on the desktop (Ryzen 5 5600X, 32 GB) and writes everything the app needs to `app/public/data/`. The phone never downloads raw Lichess data. Command: `ply-data build --month <YYYY-MM> --out ../app/public/data`, using the most recent complete month.

1. **Opening names.** Download the five TSVs (`a.tsv` to `e.tsv`) from `github.com/lichess-org/chess-openings`. Play each row's PGN, take the final EPD, and map EPD → {eco, name}. A tree node without its own name shows the name of its nearest named ancestor.
2. **Move frequencies.** Stream `lichess_db_standard_rated_<month>.pgn.zst` from database.lichess.org without unpacking to disk. Keep games where:
   - estimated duration (base + 40 × increment) is at least 180 seconds, so no bullet;
   - both players' ratings fall in the same band window: band − 100 to band + 99;
   - counting stops for a band after 3,000,000 games. For the first 40 plies (move 20), add each (EPD, move) pair with its white-win / draw / black-win result to that band's counts.
3. **Prune.** Drop nodes reached by fewer than 50 games in a band. Size budget: 25 MB gzipped per band. If a band goes over, raise the minimum to 100 games and rebuild it.
4. **Evaluations.** Join every kept EPD against `lichess_db_eval.jsonl.zst`, taking the deepest eval per position. Positions it lacks are run through native Stockfish 17 at depth 18 (10 threads, 1 GB hash). Store eval as centipawns from White's view, with mate scores clamped to ±10000.
5. **Default moves.** For every node, for the side to move: the most-played move at that band whose resulting eval is within 30 cp of the best move. If no played move qualifies, use Stockfish's best move.
6. **Win% and move loss.** Win% = 50 + 50 × (2 / (1 + e^(−0.00368208 × cp)) − 1), the formula Lichess uses. Move loss = the mover's win% before the move minus after.
7. **Punish traps.** For each node and each move with frequency ≥ 3% and move loss ≥ 15 win% points, emit a Punish card: position after that mistake. The answer is Stockfish's best reply, with the principal variation kept for up to 3 of the punishing side's moves.
8. **Danger traps.** For each node and each move with frequency ≥ 5% and move loss ≥ 15, emit a Danger card from the mover's view: position before the move, the answer is the default move, and the card stores the tempting wrong move and its refutation line.
9. **Puzzle traps.** From `lichess_db_puzzle.csv.zst` keep puzzles where OpeningTags is not empty, the FEN's full-move number is ≤ 15, Popularity ≥ 80, NbPlays ≥ 300 and Rating ≤ 2000. Link them to openings by tag (underscores → spaces, matched to family and variation names). Keep up to 150 per opening family, most-played first. The puzzle FEN is the position before the opponent's move: the first move in `Moves` is played automatically.
10. **Emit** the files in the next section, and write `manifest.json` with a data version (`<month>-<git short hash>`) and a SHA-256 per file.

Rebuild whenever you want fresher frequencies. The app treats a new data version as an update (see Growing with rating).

## Data formats

The app downloads `manifest.json`, `openings.json`, `puzzles.json.gz` and the files for your current band at first launch, then keeps them in IndexedDB. Other bands download only when you switch to them.

| File | Contents | Scope |
| --- | --- | --- |
| `manifest.json` | Data version, list of files, SHA-256 per file | Global |
| `openings.json` | Every named opening: id, ECO, name, family, EPD | Global |
| `tree-<band>.json.gz` | Opening tree nodes for one band | Per band |
| `traps-<band>.json.gz` | Punish and Danger cards for one band | Per band |
| `puzzles.json.gz` | Filtered Lichess opening puzzles | Global |

```ts
// tree-<band>.json.gz
type Tree = Record<string /* EPD */, TreeNode>;
interface TreeNode {
  g: number;              // games reaching this node
  e: number;              // eval, cp from White
  o?: number;             // opening id (own or nearest named ancestor)
  d: string;              // default move (UCI) for side to move
  m: [uci: string, games: number, w: number, dr: number, b: number][];
}

// traps-<band>.json.gz
interface Trap {
  id: string;             // stable hash of epd + kind + move
  kind: 'punish' | 'danger';
  epd: string;            // position shown on the card
  side: 'w' | 'b';        // side you play on this card
  answer: string[];       // your moves (UCI), opponent replies auto-played between
  line: string[];         // full move sequence answer + replies
  bait?: string;          // danger only: the tempting wrong move
  refute?: string[];      // danger only: how the wrong move gets punished
  loss: number;           // win% points lost by the mistake
  freq: number;           // how often the mistake is played at this band, 0–1
  o: number;              // opening id
}

// puzzles.json.gz
interface Puzzle {
  id: string;             // Lichess puzzle id
  fen: string;            // before the opponent's move
  moves: string[];        // UCI, first one auto-played
  rating: number;
  themes: string[];
  families: number[];     // opening ids it belongs to
}
```

## SRS engine

Every card is one position with one or more moves you must find. FSRS schedules each card on its own, and lines are just the way move cards are presented.

### Repertoire and lines

- A repertoire is two maps, one for White and one for Black: EPD → one or more of your moves. Positions without an override use the tree's default move. One move per position is the default; adding a second move is a deliberate choice in Repertoire.
- Lines are generated, never entered. Walk from the start position: on your turn follow each of your moves, one branch per move; on the opponent's turn branch into every reply with ≥ 3% frequency and ≥ 50 games. Stop at the depth limit or when the tree runs out.
- Line probability = product of the opponent reply frequencies along it. Probability decides the order new moves are introduced in.
- At a position that has a Punish trap, your move is forced to the trap's first move, so the in-line answer always punishes.
- Black repertoires are generated separately from 1.e4, 1.d4, 1.c4, 1.Nf3 and every other first move with ≥ 1% frequency.

### Card identity and branches

- A Move card is identified by side + EPD + expected move: `id = hash('move', side, epd, uci)`. Two move orders that reach the same position with the same expected move share one card. The same position with two different moves of yours is two cards with separate schedules.
- Marking a second move at a position creates a branch: lines are generated below each of your moves separately.
- **Branch label (required, do not skip).** Whenever a line passes a position where you have more than one move, the review must say which branch it is testing, or you cannot know the expected answer. The label is the opening name and ECO of the position after the expected move, for example "Blackmar–Diemer Gambit (D00)". It shows from move 1 of the line until that position is passed, even when "Show opening name while answering" is off, and only on lines that pass such a position.
- Playing your *other* repertoire move at a branch position is not a mistake. The app says "That's your \<other branch> move. This line is the \<branch>." You retry, and the card is graded as if that attempt never happened.
- In Drill there is no target line, so any of your moves is accepted and the drill continues down the branch you picked.

### Card labels

Every card carries a label: the name and ECO of its position (or of the nearest named position before it) plus the most common move order reaching it, for example "Queen's Gambit Declined (D30) · 1.d4 d5 2.c4 e6 3.?". When other move orders reach the same position the label adds "also in N other lines", which lists them on tap. Trap, Puzzle and Mistake cards add their source: "Punish · played by 6% at your band" or "From your game vs \<opponent>, \<date>".

| Where | Label shown |
| --- | --- |
| Lists: Weakest cards, Mistakes, Stats, Repertoire | Always |
| Explorer | Always |
| Answer screen, after you play | Always |
| During a question | Hidden by default, so you read the board, not a cue. The setting "Show opening name while answering" turns it on. Branch labels always show |

### Card types

| Type | Position | Answer | Created by |
| --- | --- | --- | --- |
| Move | A position in your lines with you to move | Your repertoire move | Line generation |
| Punish | After a common opponent mistake | Up to 3 of your moves, opponent replies auto-played | Pipeline step 7 |
| Danger | Before a popular losing move | The safe move; then the bait and its refutation are shown | Pipeline step 8 |
| Puzzle | Lichess puzzle in one of your openings, your colour | The full puzzle solution | Pipeline step 9 |
| Mistake | From your own game, before your mistake | Any move within 30 cp of the engine's best | chess.com import |

Only traps whose position appears in your generated lines are added (Punish, Danger). Puzzles are added when their opening family is in your repertoire and the solving side is your colour in that opening.

### Grading (automatic)

| What happened | FSRS rating |
| --- | --- |
| Wrong move on the first try | Again |
| Correct, but slower than the Hard threshold (default 10 s per move) | Hard |
| Correct on the first try, within the threshold | Good |

- Easy is never given automatically, to keep intervals honest.
- After a wrong move the correct move is shown with an arrow, and you must play it to continue.
- In a Move card, a different move within 30 cp of best is not wrong. The app says "Playable, but your move is X" and you retry. If you then play it correctly, the card counts as Hard.
- Multi-move cards (Punish, Puzzle, Mistake): any wrong move gives Again. The time threshold applies to your average time per move.

### FSRS settings

- Library `ts-fsrs` with default weights, desired retention 0.90, maximum interval 365 days, fuzz on.
- Learning steps 1 minute and 10 minutes; relearning step 10 minutes. Cards due again within the session are re-queued while the app is open.
- Weights are not optimized in v1; the full review log is stored so optimization can be added later.

### Reviewing move cards as lines

A line is the card you play; each of your moves in it is a subcard with its own FSRS schedule. Moves you fail come back within days, moves you know drift out to months, so the lines you see most are the ones holding your weakest moves.

1. Collect all due Move cards and group them: pick the deepest due card, take the most probable line that reaches it, and include every other due card on that path.
2. Play the line from the start. Opponent moves auto-play after 400 ms. You play all your own moves.
3. Only due cards on the path change schedule when answered correctly. A wrong answer on any card on the path, due or not, gives that card Again.
4. The line ends after your move at its deepest due card.

### Daily queue

The Today queue is built at the 04:00 rollover and rebuilt whenever limits change. Order:

1. Due Mistake cards
2. Due Move cards, as lines
3. Due Punish, Danger and Puzzle cards
4. New Move cards, up to the new-moves limit, highest line probability first
5. New trap cards, up to the new-traps limit: Punish and Danger by frequency × loss, then Puzzles by play count
6. New Mistake cards, up to the new-mistakes limit, newest game first

When due cards exceed the daily review limit, the ones with the lowest current retrievability go first and the rest roll to the next day. A new Move card is introduced in Learn style: the line plays up to it, an arrow shows the move and its note, you play it, and it enters learning step 1.

## Screens and UI

Five tabs in a bottom bar: **Today**, **Explore**, **Repertoire**, **Settings, Stats**. Every training screen shares one layout: the board is full-width at the top, with a one-line prompt and the move list under it.

### Shared board behaviour

- Your side is at the bottom. Move by tapping the piece then the square, or by dragging.
- Promotion opens a four-piece picker.
- Wrong move: the piece snaps back, the square flashes red, and the phone vibrates for 50 ms.
- Sounds are a short WebAudio click per move and a low tone when wrong. They can be turned off.
- Above the board: the branch label when one applies, and the card label only after you answer (see Card labels).
- **Hint** button: highlights the piece to move. Using it caps the rating at Hard.
- After each card: the position's note (if any) and a **Next** button. **Undo grade** reverses the last rating once.

### Today

- Top: three counts (Due, New, Done today), streak in days, and 7-day retention %.
- One big **Start** button that runs the queue in the order from SRS engine. The session can be left at any time; progress is saved after every card.
- Prompts by card type: Move → "Your move"; Punish → "They blundered. Punish it"; Danger → "Careful. Find the safe move"; Puzzle → "Find the best line"; Mistake → "From your game vs \<opponent>, \<date>".
- When the queue is empty: "Done for today", plus buttons for Explore and for **Extra new moves** (+5, which counts as learning beyond the limit).
- Bottom card: average eval after move 10 and move 15 in your last 30 imported games, as a sparkline over time.

### Repertoire

- Two sections, White and Black (Black split into vs 1.e4, vs 1.d4, vs others).
- Each opening shows: lines, move cards learned / total, coverage % (share of your band's games that stay inside your lines through your depth).
- Tap a position to change your move or add a second one (creating a branch): the list shows every move with frequency, win/draw/loss bar and eval. Changing a move retires the old cards below it and generates new ones.
- **Reset to defaults** per section.
- A **Mistakes** list: imported games with their mistake cards. Swipe to delete a card.

### Design direction

The visual design is deliberately not specified. The builder has full creative freedom and should use it: the goal is an app that looks like an impressive, polished, premium mobile app, the kind people screenshot. Ignore any instinct toward a plain or minimal developer-tool look.

- **Yours to decide:** colour palette, light/dark, typography, iconography, board and piece style, layout, cards and surfaces, motion and transitions, micro-interactions, celebratory moments (streaks, finished sessions, cards turning mature), empty states, onboarding, and how the Stats charts look.
- **Before building the UI,** do a dedicated design pass: choose a clear visual identity, write it down in `docs/DESIGN.md` (palette, type scale, spacing, components, motion rules), then build every screen from it so the app feels like one designed product.
- **What stays fixed** is behaviour, not looks: the screens, flows, information and rules in this brief. Rearrange and restyle freely, as long as every feature and piece of information is still there.

The only design constraints:

1. Works one-handed in portrait on a 6.5-inch Android phone (Samsung Galaxy S20 FE); touch targets at least 44 px.
2. Smooth on that phone: 60 fps animations, board moves feel instant, no jank while the engine analyzes.
3. Fully offline: fonts, icons and images are bundled, never loaded from a CDN.
4. Readable: text contrast at least WCAG AA, and correct / wrong feedback never relies on colour alone.
5. Board and piece assets must have a licence compatible with GPL-3.0.

## Explorer: Learn and Drill

The Explorer is the full baked-in tree for your band. From any position it can **Learn** (adds cards to your schedule) or **Drill** (practice that never touches the schedule).

### Browsing

- Top: a **Playing as White / Black** toggle (sets whose moves are "yours"), a search box over every opening name, and a breadcrumb of moves played.
- Board, with a list of moves from the current position under it. Each row shows: move, frequency %, game count, win/draw/loss bar, eval.
- Markers on rows: ★ your repertoire move (one per branch), • default move, ⚔ a Punish trap follows, ⚠ a Danger trap (popular but losing).
- Below the list: traps and puzzles that start in this subtree, with counts and a tap to preview.
- Tap a move to step forward; swipe right on the board or press back to step back.

### Learn from here

1. If the path to this position contains your moves that differ from your repertoire, a dialog lists them and **Set as my repertoire** applies them all.
2. The app generates every line in the subtree (same rules as line generation, same depth limit) and finds the new Move cards.
3. Rounds of 5 new moves, highest probability first: each move is shown in Learn style, then all 5 are quizzed in their lines. Missed ones repeat at the end of the round.
4. Continue until the subtree is fully learned or you press **Stop**. Every learned move enters FSRS learning step 1.
5. Explorer learning counts toward today's "New" number but is never blocked by the daily limit: choosing to learn here is an explicit override.
6. Traps and puzzles in the subtree are added to the new-traps queue and introduced under the normal daily limit.

### Drill from here

- Three modes: **Lines**, **Traps** (Punish, Danger and Puzzle cards in the subtree) and **Mixed** (alternates line, trap).
- Works on any position, even outside your repertoire: your side uses your repertoire move where one exists and the default move elsewhere.
- Opponent replies are picked at random, weighted by frequency at your band. A **Rare replies** toggle picks evenly among all replies ≥ 3%, so you practise the odd ones too.
- Each mistake shows the correct move, which you then play. Drill does not change any schedule.
- Runs until you press **Stop**. Summary: moves played, accuracy %, and the list of missed positions.
- **Mark missed as Again** in the summary applies Again to the missed positions that are existing cards. Missed positions that are not cards yet get a **Learn these** button that runs them through Learn.

## Stats

A Stats tab shows your progress the way Anki does, overall, per opening and per move. Everything is computed from the `cards` and `reviews` tables, so it needs no extra storage.

### Card stages

| Stage | Rule | Colour |
| --- | --- | --- |
| New | Never reviewed | Grey |
| Learning | In a learning or relearning step | Orange |
| Young | Interval under 21 days | Light green |
| Mature | Interval 21 days or more | Dark green |
| Suspended | Retired or suspended | Hidden from counts, listed separately |

### What the Stats tab shows

1. **Totals:** card counts by stage, split by type (Move, Punish, Danger, Puzzle, Mistake).
2. **Forecast:** bar chart of reviews due per day for the next 30 days.
3. **History:** calendar heatmap of reviews per day over the past year, plus time spent per day.
4. **Retention:** % correct on first try for mature and young cards, over the last 7 and 30 days, compared with your desired retention.
5. **Per opening:** one stacked bar per opening in your repertoire (new / learning / young / mature), with % mature and coverage %. Tap one to open it in Repertoire.
6. **Weakest cards:** the 10 cards with the most lapses in the last 30 days, each opening the position, with a **Drill these** button that runs all 10 in Drill.
7. **Games:** your average eval after move 10 and move 15 over imported games, by month, next to your chess.com rapid rating.

### Progress on the board

- In Explorer and Repertoire every one of your moves carries a dot in its stage colour, so you can see how well each line is known.
- Each opening in Repertoire shows a thin stage bar under its name.

The Stats tab is built in milestone 6.

## Mistake import (chess.com)

Your chess.com games are pulled through the public API, analyzed on the phone, and each real mistake becomes a Mistake card.

### Fetching

- `GET https://api.chess.com/pub/player/{username}/games/archives` for the monthly archive list, then each month's archive for its games (PGN, time class, players, end time, URL).
- `GET https://api.chess.com/pub/player/{username}/stats` for `chess_rapid.last.rating`, used for the rating band and line depth.
- Sync runs automatically when the app opens if the last sync was more than 24 hours ago, plus a **Sync now** button in Settings.
- The first sync imports the last 3 months. Later syncs import only games not seen before, keyed by game URL.
- Only rated games in the selected time classes are imported (default: rapid).
- If the API is unreachable, the app shows the error and offers **Paste PGN** (one or many games). Pasted games go through the same analysis.

### Analysis

1. Runs in a Web Worker with Stockfish lite WASM: MultiPV 3, 300 ms per position, every position where it is your move. About 12 seconds per game on the S20 FE. A progress bar shows while it runs; unfinished games resume on the next open.
2. A move is a mistake when it loses ≥ 20 win% points from your view and your win% before it was between 10 and 90 (the game was not already decided).
3. At most 3 Mistake cards per game: the largest losses.
4. Each card stores the position, every MultiPV move within 30 cp of the best (all accepted as correct), the move you played, and the engine's punishing reply line (3 plies).
5. After you answer, the card shows the move you played in the game and how it gets punished.

### Repertoire checks

- You left your repertoire at a position that is a Move card → that card gets Again, and the sync summary lists it.
- Your opponent played a reply not covered by your lines → it goes on an **Uncovered in your games** list in Repertoire with a **Learn from here** button. Nothing is added automatically.
- Every analyzed game stores its per-move evals, which feed the move-10 / move-15 stat on Today.

## Growing with rating

The app re-fits your lines to your rating by itself. Your progress is never lost, because Move cards are keyed by side + EPD + expected move, not by line.

- **Band switch.** After each sync the app computes band = chess.com rapid + 350. When a new band holds for 7 days in a row, the app downloads that band's files, regenerates your lines, and shows a one-line notice. A **Band lock** in Settings turns this off.
- **Depth increase.** When your rating crosses a depth threshold (1000, 1300, 1600), the depth limit rises and the deeper moves join the new-moves queue.
- **New replies.** Replies that reach ≥ 3% at the new band become new Move cards, introduced under the normal daily limit.
- **Replies that faded.** Cards whose position is no longer in your lines stay and keep their schedule. Repertoire marks them "rare", with a **Retire rare cards** button that suspends them in bulk.
- **Data updates.** When `manifest.json` has a new data version, the app downloads the changed files on Wi-Fi and regenerates lines the same way.
- **Traps follow the band.** Punish and Danger cards come from the band's trap file, so the traps you train match the mistakes people at your level actually make.

## Settings and defaults

Every daily limit is yours to set. Changing a limit rebuilds today's queue immediately.

| Setting | Default | Range |
| --- | --- | --- |
| New moves per day | 10 | 0–50 |
| New traps per day (Punish, Danger, Puzzle) | 5 | 0–30 |
| New mistake cards per day | 10 | 0–30 |
| Maximum reviews per day (all types) | 150 | 20–999 |
| Hard threshold per move | 10 s | 3–30 s |
| Desired retention | 0.90 | 0.80–0.97 |
| Line depth (your moves) | Auto by rating | Auto, or fixed 4–20 |
| Opponent reply threshold | 3% | 1–10% |
| Rating band | Auto (chess.com rapid + 350) | Auto, or locked to one band |
| chess.com username | empty | text |
| Time classes to import | Rapid | Rapid, Blitz, Daily (multi-select) |
| Day rollover | 04:00 | 00:00–06:00 |
| Sounds / vibration | On / On | On, Off |
| Opponent move delay | 400 ms | 0–1500 ms |
| Show opening name while answering | Off | On, Off (branch labels always show) |

Settings also holds **Sync now**, **Export backup**, **Import backup**, and **Reset all progress** (needs you to type RESET).

## Storage, offline and backup

All user data lives on the phone in IndexedDB. There is no server and no account. After the first launch everything works offline except chess.com sync.

| Dexie table | Key | Holds |
| --- | --- | --- |
| `settings` | `key` | All settings from the table above |
| `repertoire` | `[side+epd]` | Your moves per position (one or more, in branch order) and position notes |
| `cards` | `id` | Type, side, EPD, expected move, label, answer data, FSRS state, suspended flag, created date |
| `reviews` | auto | Card id, timestamp, rating, time taken in ms, mode (today / learn / drill-again) |
| `games` | game URL | PGN, colour, opponent, result, date, per-move evals, analyzed flag |
| `data` | file name | Baked data files and the data version |

- At first launch the app calls `navigator.storage.persist()` so Android does not evict the data.
- **Export backup** writes one JSON file (`ply-backup-YYYY-MM-DD.json`) with every table except `data`, and hands it to the Android share sheet (Web Share API), with a plain download as fallback.
- **Import backup** replaces all user tables after a confirmation, then regenerates lines.
- A banner on Today appears when the last backup is more than 7 days old.
- The format is documented in `docs/backup-format.md` with a `schemaVersion` field; Dexie migrations bump it.

## Milestones

Six milestones, in order. Each one is done when every check under it passes on the S20 FE.

1. **Pipeline v1:** openings, frequencies, evals, default moves.
   - `ply-data build` produces `openings.json` and all six `tree-<band>.json.gz` files, each ≤ 25 MB gzipped.
   - After 1.e4 e5 2.Nf3 Nc6 3.Bc4 the node is named Italian Game (C50), and its default move for Black is in the tree.
   - `cargo test` covers EPD keys, band filtering and the default-move rule.
2. **App shell + Explorer browsing.**
   - PWA installs from Chrome, opens offline after the first launch, and data survives a restart.
   - Explorer shows frequencies, W/D/L, eval and markers for any position, and opening search works.
3. **Repertoire + Today with Move cards.**
   - The starter repertoire generates lines; Repertoire shows coverage per opening.
   - The Today queue respects all four limits; auto-grading follows the Grading table; FSRS state persists.
   - Vitest covers the queue builder, line grouping and grading.
4. **Learn and Drill.**
   - Learn from here works on a position inside and outside the repertoire, including the override dialog.
   - Drill in all three modes changes no schedule; Mark missed as Again works.
5. **Traps.**
   - Pipeline writes `traps-<band>.json.gz` and `puzzles.json.gz`.
   - The starter repertoire at band 1200 gets ≥ 20 Punish cards and ≥ 50 Puzzle cards, each opening correctly from its position.
   - Danger markers show in the Explorer and the bait and refutation appear after a Danger card.
6. **chess.com import + rating growth + backup.**
   - Sync imports the last 3 months for the username; analysis finishes in under 15 s per game.
   - Mistake cards appear with accepted alternatives; repertoire deviations lapse their cards.
   - Changing the locked band regenerates lines without losing any card's schedule.
   - Export and import round-trip without losing data.

## Not in v1

These are deliberately left out of v1, so none of them blocks the build:

- iOS support, a native Android build (Capacitor) and Play Store release
- Accounts, cloud sync, or sync between devices (backup files cover this)
- Any link to Construct beyond the documented backup format
- Lichess game import (chess.com only)
- FSRS weight optimization from your review log
- Written opening plans or explanations beyond your own notes
- User-selectable themes in Settings (the shipped design itself is the builder's choice)
- Middlegame or endgame training outside the opening tree and your Mistake cards
