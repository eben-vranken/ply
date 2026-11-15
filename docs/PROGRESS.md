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

## Trust and table stakes (from November 2026)

Work from build-order steps 1 and 2 of `reports/Ply subscription readiness gaps.md`. Everything here is part of the free tier.

- **Arcade memory in the backup:** the positions Arcade brings back after a miss lived in localStorage, outside IndexedDB and the backup. They are now a `settings` row (`key: "arcade"`), moved over on first launch; backup format 2 (`docs/backup-format.md`).
- **Promotion choice everywhere:** Play it out and the Explore board always made a queen. Both now open the trainer's four-piece picker (`lib/Promo.svelte`, also keys q / r / b / n and Escape). `npm run smoke` underpromotes to a knight on both boards.
- **Keep going's review mode removed:** the `'extra'` mode outlived the feature. Database version 2 rewrites any such reviews as `'today'` (they were reviews of due cards, graded like Today), and backups holding them import the same way.
- **Pinch zoom:** `user-scalable=no` is gone; `touch-action: manipulation` keeps double-tap from zooming when you tap a piece and then a nearby square. Checked in Chromium at page scale 2: taps still land on the right squares (e2, e4 played 1.e4). Synthetic pinch gestures do not work in Playwright, so the pinch itself is still to check on the phone.
- **Smoke test in CI:** GitHub Actions installs Playwright's Chromium and runs `npm run smoke` after the build; on a failure the screenshots are uploaded as an artifact. Passes locally; not yet seen on GitHub (nothing pushed).
- **`model.svelte.ts` not split:** the only self-contained block is Arcade, and nothing below changes it. New features live in their own modules and use the model's exported functions instead.
- **Tablet, desktop and landscape layouts** (DESIGN.md, "Wide screens"): landscape windows put the board beside the rest in the trainer, Play it out and Explore; list screens become a centred column; a phone on its side gets a tab rail on the right; an upright tablet keeps one column with a larger board. `npm run layouts` captures the main screens at 412×915, 915×412, 820×1180, 1180×820 and 1440×900. The phone screenshots were compared pixel by pixel against the previous build: the only differences are animation frames (Birch breathing, pulsing tiles). The installed app no longer locks portrait (manifest `orientation: any`): a phone with auto-rotate off stays upright as before.
- **Keyboard:** type moves in SAN or UCI on the trainer, Play it out and Explore boards (`lib/keys.ts`, `lib/MoveInput.svelte`): `Nf3`, `nf3`, `exd5`, `ed5`, `O-O`/`0-0`, `e8=N`/`e8n`, `g1f3`. A move plays as soon as only one move is meant; when lower case could mean a bishop or a b-pawn, or O-O could still become O-O-O, it waits for Enter and shows the options. With nothing typed: `?` hint, Enter / Space / → continue, Backspace undo grade (Explore: step back), ← step back, Esc stop. Shortcut hints show only with a mouse and keyboard. Vitest covers the matching; `npm run smoke` types moves in Explore and answers a card by keyboard.
- **Safari:** the whole smoke session (onboarding, a Today session with wrong answers, every tab, Drill, Play it out with Stockfish, promotion, keyboard) passes in Playwright WebKit 26 on desktop and as an iPhone 13 (`BROWSER=webkit DEVICE=iphone npm run smoke`, also in CI). Fixed for Safari: text no longer selects on a long press (`-webkit-user-select`, no touch callout), an `apple-touch-icon` for the Home Screen, the Vibration switch only where the browser can vibrate (not on iPhone), and a one-time note on Today in Safari outside the Home Screen: Safari deletes a website's stored data after 7 days without a visit, which would take every card with it.
  Still to check on a real iPhone: Add to Home Screen and the app opening standalone (the manifest asks for `fullscreen`, which iOS may treat differently), offline start after a restart, that IndexedDB survives (installed apps are exempt from the 7-day rule), sound after the first tap and with the silent switch on, the Stockfish worker's speed and memory on a phone during game analysis, the share sheet for backups, drag and tap on the board, pinch zoom, safe areas around the notch and home bar, and the on-screen keyboard over the search and username fields. iOS 16.4 or later is needed (`DecompressionStream` for the opening data).
- **PGN import** (Repertoire → Import PGN; `lib/pgn.ts`, `lib/import/repertoire.ts`, `lib/ImportSheet.svelte`): paste or pick a file with one game or many; variations, comments and NAGs are read, Lichess `[%cal]`-style commands dropped. The side comes from `[Orientation]` or you pick it. The preview shows what is added, what is already yours, conflicts with moves you chose yourself (PGN / mine / both, one by one or all at once), positions where the PGN gives you two moves (main line only unless you keep branches), moves past the end of the band's data, moves deeper than your line depth, notes, and games skipped with the reason (illegal move and where, a set-up start position). Comments become notes but never replace yours.
  Before this, the move editor only offered moves from the band's tree and lines stopped where the tree ended. Now the opponent's moves from an import are kept as your own **book** (a `book` table, database version 3, backup format 3), and lines, Drill and the skill tree follow them past the end of the tree and below the reply threshold; a book reply the tree does not know counts as 1% for ordering. Explore's **Set as my repertoire** keeps the opponent's moves on the way the same way, so lines of your own can be built there too.
- **PGN export** (Repertoire → Export PGN: everything, White, Black or one opening; the share icon on an opening's skill tree; `lib/export.ts`): one game per colour with every line as variations, the most played move first, your notes as comments after your moves and transpositions marked. A Vitest round trip exports White, imports it back and finds every move card and note; the smoke test downloads the file. Android's share sheet does not take `.pgn` files, so it downloads.
- **Lichess study import** (Import PGN → Lichess study; `lib/import/lichess.ts`): paste a study address (every chapter, or the chapter in the address) and it goes through the same preview. `GET /api/study/{id}.pgn` (or `/{chapterId}.pgn`) with `orientation=true`, so each chapter's side comes along; no token, so only public studies (the docs: unauthenticated requests read public, non-unlisted chapters). All Lichess requests share one queue (one at a time) and wait 60 s after a 429 before retrying, up to three tries. Games in other variants are skipped with the reason. Checked live once against a public study, from Node and from the built app in Chromium (CORS allows it).
  Not done as asked: a descriptive `User-Agent`. Browsers do not let a page set it reliably, and Lichess's CORS rules only allow `Origin, Authorization, If-Modified-Since, Cache-Control, Content-Type` across origins, so a browser that sends the header (Firefox) would fail the request. The browser's own User-Agent and the `Origin` header (the site Ply runs on) identify it instead.
- **Lichess game sync** (Settings → Your games; onboarding asks for either name): `GET /api/games/user/{name}` as NDJSON with the PGN in each line, no token needed (anonymous: 20 games a second). The first sync takes the last three months, later syncs only games that started after the newest one seen. The games go through the same pipeline as chess.com: repertoire deviations lapse their cards, uncovered replies are listed, and the on-device analysis makes mistake cards. Without a chess.com name, the Lichess rapid rating sets the band (the brief's chess.com + 350 is Lichess's scale). Sync on open and Sync now take both sources; one failing does not stop the other. Vitest runs a sync against a stubbed Lichess on the real data sample; checked once live against a real player's games.
- **Game filters** (Settings → Your games, both sites; `lib/import/filters.ts`): rated, casual or both; time controls Bullet, Blitz, Rapid, Classical (Lichess only) and Daily (chess.com daily, Lichess correspondence); a from / to date range, both days included. A start date replaces the three-month first-sync window. On Lichess the filters go into the request (`rated`, `perfType`, `since`, `until`); on chess.com only the months in the range are fetched and each game is checked. Changing a filter makes the next sync go over the whole window again; games already stored are skipped.
- **Catching up after a lapse** (`lib/srs/catchup.ts`, Today): with at least 50 reviews due and either more than a day's limit or three days away, Today offers to spread them over 3, 5 or 7 days (about 40 a day suggested) or take them at once. While it runs, each day takes an even share, the reviews closest to slipping first as before, and new cards wait; a line on Today says which day it is, with Stop. Due counts stay honest: Today's Due is now every due review, with "· N today" when the day's limit (catch-up or the normal maximum) leaves some for later. Before, Due showed only the capped queue.
- **Import backup in Settings was broken** (found while testing, not in the report): the parsed file sat in a Svelte `$state`, whose proxies IndexedDB cannot store, so every import from the Settings screen failed with a `DataCloneError` (only the model-level round trip had been tested). It is kept raw now, and the confirmation goes to the app-wide notice because reloading the lines unmounts Settings. `npm run smoke` exports a backup and imports it back through the screen.
- **Streak freezes** (`lib/streak.ts`): earned by playing, never sold. Every 7 study days in a row earn one (at most 2 held); a day without study while you hold one uses it, and the streak survives that day without growing. They are worked out from the review log alone, so they need no storage and a restored backup brings them back exactly (the Stats window is the last 371 days). Shown on Today (a snowflake count beside the streak, frozen days in the week strip, Birch saying when one covered yesterday), on the session-complete screen when one is earned, and on Stats (freezes held, days saved this year, frozen days in the calendar). Checked by restoring a backup with 14 study days and a missed yesterday: 14-day streak, one freeze used, one held.
- **Wider onboarding** (`lib/OpeningPicker.svelte`): the first run still offers two openings per colour, so tapping straight through is as short as before. A third button, Something else, opens every opening family where the defining move is yours (95 for White, the most played at your band first) with search over all 3,865 named variations by name, ECO code or moves; only openings the band's data reaches are listed. Your moves along the chosen line become your starter repertoire and it becomes an opening you master. The last step adds your level (Beginner, 1200 … 2000+ on Lichess's scale): it sets the band and line depth until a synced chess.com or Lichess rating replaces it. Checked in Chromium: picking the London System at 1600 gives a 1600-band repertoire mastering it.

### FSRS weight optimisation

- **Your schedule** in Settings fits FSRS's 21 weights to your own review log, on the device, once you have 1,000 reviews. The fit runs in a Web Worker (about 0.1 s for 1,500 reviews in Chromium, 0.5 s in WebKit). The weights apply from each card's next review, card dates are not rewritten, and **Defaults** goes back.
- The optimiser is `optimizer/`: fsrs-rs 6.6 (BSD-3-Clause, the optimiser Anki uses; FSRS-6, the same 21 weights ts-fsrs 5 schedules with) compiled to plain single-threaded WebAssembly, 200 KB, with no imports. The published browser build (fsrs-browser) uses threads, which need cross-origin isolation that GitHub Pages cannot provide; this build needs nothing special. `npm run optimizer` rebuilds `app/public/fsrs/ply_optimizer.wasm`; CI runs its Rust tests.
- The review log becomes one history per card: each rating and the study days since the card's previous review (counted from the rollover hour). A new move's introduction is logged as Again, which is how ts-fsrs scheduled it, so the fit learns from exactly what happened. (An earlier note here said this would skew a fit. It does not.)
- Tested: history building, a fit in the shipped WASM from Vitest, weights changing intervals and the defaults returning, and a fit from the Settings screen in Chromium and iPhone WebKit after restoring a backup with 1,500 reviews. Not checked: how much a fit improves real users' schedules (no real log of that size yet).

### Position counts (`ply-data positions`, data 2026-10)

Distinct positions across the six band trees, deduplicated by EPD (the FEN without move counters; the trees are keyed that way, so transpositions and bands count once). "One band" uses a position's most games in any band; "summed" adds the bands. Every position has at least 50 games in some band because the trees are pruned at 50.

| | Total | ≥ 50 games (one band / summed) | ≥ 200 | ≥ 1,000 |
| --- | --- | --- | --- | --- |
| Positions | 115,110 | 115,110 / 115,110 | 26,572 / 59,102 | 4,770 / 15,852 |
| Position + move pairs | 319,212 | 114,369 / 182,457 | 25,792 / 72,298 | 4,538 / 15,439 |

Per band: 47,054 (1000) · 50,720 (1200) · 53,976 (1400) · 57,129 (1600) · 62,116 (1800) · 68,214 (2000).

### Higher bands (pipeline support only; nothing downloaded or built)

`ply-data build --bands … --extra-months …` (pipeline/README.md, "Higher bands") builds bands above 2000 from the same CC0 Lichess game dumps; the app reads the band list from the manifest. Tested on the local 60 MB slice of the October dump: only the new bands were counted, only their new positions went to the eval lookup, and the stream carried on into a second file.

What a real build would take, estimated from that slice (192,720 games: 2.2 % qualify for 2200, both players 2100–2299 at 3+ minutes; 0.46 % for 2400) and from Lichess's published sizes (October 2026: 95.4M games, 31.0 GB; September 89.6M, 29.2 GB; August 91.9M, 30.1 GB). The slice is the first hours of one month, so the rates are rough.

| Band | Games to 3M | Dumps to read | Download | Time at the October build's pace (2.2M games/min) |
| --- | --- | --- | --- | --- |
| 2200 | about 138M | October and about half of September | about 4 GB more of October (26.8 GB are cached) and 14 GB of September | about 65 min, plus the eval lookup over the cached 22.5 GB eval database |
| 2400 | about 650M | about seven months | about 210 GB | about 5 hours |

A 2400 band capped at what three months give (about 1.26M games, `--max-games 1200000`) needs about 90 GB and 2 hours; a smaller tree, but it would be built from more games than the 1000–2000 bands' prune threshold needs. Not run: it needs your go-ahead.

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
