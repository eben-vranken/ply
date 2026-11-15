# Progress

Everything in `docs/BRIEF.md` is built. The app runs on real data built by the pipeline from the Lichess October 2026 database.

## Pipeline (`pipeline/`, Rust)

- `ply-data build`: opening names, move frequencies per band (streamed, resumable), pruned trees, Lichess eval join, Stockfish 17 for gaps, default moves, win% and move loss, Punish / Danger traps, opening puzzles, `manifest.json` with SHA-256 per file. Each stage is cached; `--keep-downloads` keeps the raw files for fast re-runs.
- `cargo test`: EPD keys and en passant, transpositions, move packing, band windows, bullet filter, PGN filter and counting, tree rebuild, eval DB parsing, the default-move rule, move loss, punish-line cutting, puzzle tag matching, opening TSV parsing.

## App (`app/`)

- **Data:** first launch downloads the manifest, `openings.json`, `puzzles.json.gz` and the band's tree and traps into IndexedDB with a progress screen; afterwards everything loads offline. New data versions download on Wi-Fi and regenerate lines. `navigator.storage.persist()` at launch.
- **SRS engine:** ts-fsrs (retention from settings, 365-day cap, fuzz, 1m/10m learning, 10m relearning). Move cards keyed by side + EPD + move. Lines generated best-first from the tree (your moves, replies ≥ threshold and ≥ 50 games, Black from every first move ≥ 1%, punish answers forced). Line grouping (deepest due card, most probable path, every due card on it), daily queue in the brief's order with all four limits and the review cap by lowest retrievability, 04:00 rollover, re-queue of learning cards in the session, extra +5 new moves.
- **Grading:** automatic per the brief: Again on a wrong first try, Hard when slow (average per move on multi-move cards), after a hint, or after "Playable, but your move is X"; your other branch move is not a mistake ("That's your … move. This line is the …"). Undo grade restores the card and deletes the review.
- **Training room:** every card type (Move lines, new moves in Learn style with arrow and note, Punish, Danger with the bait replay, Puzzle with the first move auto-played, Mistake with your game move and how it was punished), branch labels, card labels with "also in N other lines", promotion picker, sounds and haptics.
- **Today:** Due / New / Done today, streak, 7-day retention, this week, backup banner, analysis progress, out-of-the-opening sparkline from your games.
- **Explore:** real tree for your band, search over every named opening, breadcrumb, play moves on the board, rows with frequency, games, W/D/L and eval, markers ★ • ⚔ ⚠ and stage icons, change your move or add a second one (move editor with notes), traps and puzzles below with previews. Learn from here (override dialog, rounds of 5, missed ones repeat) and Drill (Lines / Traps / Mixed, Rare replies, summary with Mark missed as Again and Learn these).
- **Skill tree** (beyond the brief): tap an opening in Repertoire or Stats. It grows sideways on a dark canvas: each of your moves is a circle, your opponent's replies are the curved edges with how often they are played, and each main branch has its own colour, title and learned count. Moves light up in their branch colour as they go from learning to mature (1/3, 2/3, 3/3), lapsed moves get a red ring. Three levels show at a time; "+N" chips step into deeper parts, with a trail back. Tapping a move shows its line, stage and buttons for Explore and Drill.
- **Game layer:** openings you are mastering (several per colour; onboarding, Settings, the star in the tree) feed half of each day's new moves; XP, levels and ranks, a daily goal ring, streak flame, combos, a coloured answer panel that moves on after a clean answer, a session-complete celebration and trophies on Stats. See DESIGN.md, "The game layer".
- **Teaching:** every new move and every miss comes with a sentence on why the move is played, read from the position (`lib/explain.ts`: captures, threats, f7/f2, development, castling, pawn roles) plus how often it is played at your level; your own note still wins. Birch explains each thing once in the first session (new move, recall, a miss, the schedule). Openings are split into chapters (the opponent's main branches), shown on Today's mastering cards and in the tree's sheet. Play it out (`routes/Play.svelte`): eight moves on from any line against book replies at your level and then Stockfish, each move measured against the engine's best; no card is touched.
- **Birch:** the mascot (`lib/Mascot.svelte`, a small birch pawn in a blue scarf, with six moods, little arms and a breathing idle) and its voice (`lib/voice.ts`): a line on Today that knows your streak and queue, a face on every answer, the session-complete screen and the play-out verdict.
- **Is it working?:** Today compares your last 10 analysed games with the 20 before: eval after move 10, share of games that stayed inside your lines, win rate.
- **Grading fix:** an answer given after a wrong first try is now recorded, so a missed card is graded Again (before, it was skipped, and single cards came out Good).
- **Skill tree:** now full screen (no tab bar), with a Next up button that jumps to the move you can learn next.
- **Repertoire:** White and Black (vs 1.e4, 1.d4, others), per opening: lines, learned / total, coverage %, stage bar; Reset to defaults per section; Uncovered in your games; Mistakes with swipe to delete; Rare cards with Retire.
- **Stats:** all seven sections from the cards, reviews and games tables.
- **chess.com:** sync on open after 24 h and Sync now; first sync imports 3 months, then new games by URL; rated games in the chosen time classes; Paste PGN fallback. On-phone analysis in up to three parallel Web Workers (Stockfish lite, MultiPV 3, 300 ms per position; book moves judged from the tree's evals, decided positions get a 60 ms look only), resumable; later syncs never reach back before the first three-month window; up to 3 mistake cards per game; repertoire deviations lapse their cards; uncovered replies listed.
- **Growing with rating:** band from rapid + 350, switched after holding 7 days (Band lock in Settings), depth rises at 1000 / 1300 / 1600, rare cards kept with their schedule.
- **Backup:** export via the share sheet (download fallback), import with confirmation, documented in `docs/backup-format.md`; Reset all progress behind typing RESET.
- **Tests:** Vitest for chess helpers, line generation, coverage, line grouping, the queue and its limits, grading, FSRS steps, the mistake rule, PGN import, the backup format, and the model end to end on a real data sample with an in-memory IndexedDB. `npm run smoke` plays a session in headless Chromium.

## Data build 2026-10 (14 Nov 2026)

| Stage | Result |
| --- | --- |
| Openings | 3,865 named positions |
| Games | 82.1M games read in 38 min; 3,000,000 per band |
| Trees | 47,054 (1000) · 50,720 (1200) · 53,976 (1400) · 57,129 (1600) · 62,116 (1800) · 68,214 (2000) positions; 1.5–2.0 MB gzipped each |
| Evaluations | 115,038 of 115,110 positions from the Lichess eval database; 72 by Stockfish 17 at depth 18 |
| Traps | 1000: 2,156 punish / 1,923 danger … 2000: 646 / 569 |
| Puzzles | 15,383 |
| Total | 69 minutes; a re-run from the cache takes 12 seconds |

## Milestone checks

`src/lib/milestones.test.ts` checks these on the shipped data on every CI run:

| Milestone | Check | Result |
| --- | --- | --- |
| 1 | Every tree ≤ 25 MB gzipped | 2.0 MB at most |
| 1 | After 1.e4 e5 2.Nf3 Nc6 3.Bc4: Italian Game (C50), Black's default move in the tree | Pass (default ...Nf6) |
| 1 | `cargo test`: EPD keys, band filtering, default-move rule | 17 tests pass |
| 3 | Starter repertoire generates lines with coverage per opening | Pass (White 51% covered through 8 moves at 1200) |
| 3 | Today queue respects the limits; grading; FSRS state persists | Pass (Vitest, model test on IndexedDB) |
| 5 | Starter repertoire at 1200: ≥ 20 Punish, ≥ 50 Puzzle cards | 85 Punish, 145 Danger, 5,132 Puzzle candidates |
| 5 | Every trap and puzzle opens correctly from its position | Pass (all legal, you to move) |
| 5 | Danger cards carry bait and refutation; markers in Explorer | Pass |
| 6 | Changing the band regenerates lines without losing a schedule | Pass (1200 → 1600) |
| 6 | Export / import round-trips without losing data | Pass |

Still to check on the S20 FE itself: installing from Chrome, opening offline after a restart, 60 fps, a real chess.com sync and analysis under 15 s per game. Headless Chromium boots the app from stored data and plays a full session without errors (`npm run smoke`).
