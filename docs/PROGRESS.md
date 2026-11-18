# Progress

Everything in `docs/BRIEF.md` is built. The app runs on real data built by the pipeline from the Lichess October 2026 database.

## Pipeline (`pipeline/`, Rust)

- `ply-data build`: opening names, move frequencies per band (streamed, resumable), pruned trees, Lichess eval join, Stockfish 17 for gaps, default moves, win% and move loss, Punish / Danger traps, opening puzzles, `manifest.json` with SHA-256 per file. Each stage is cached; `--keep-downloads` keeps the raw files for fast re-runs.
- `cargo test`: EPD keys and en passant, transpositions, move packing, band windows, bullet filter, PGN filter and counting, tree rebuild, eval DB parsing, the default-move rule, move loss, punish-line cutting, puzzle tag matching, opening TSV parsing.

## App (`app/`)

- **Data:** first launch downloads the manifest, `openings.json`, `puzzles.json.gz` and the band's tree and traps into IndexedDB with a progress screen; afterwards everything loads offline. New data versions download on Wi-Fi and regenerate lines. `navigator.storage.persist()` at launch.
- **SRS engine:** ts-fsrs (retention from settings, 365-day cap, fuzz, 1m/10m learning, 10m relearning). Move cards keyed by side + EPD + move. Lines generated best-first from the tree (your moves, replies ≥ threshold and ≥ 50 games, Black from every first move ≥ 1%, punish answers forced). Line grouping (deepest due card, most probable path, every due card on it), daily queue in the brief's order with all four limits and the review cap by lowest retrievability, 04:00 rollover, re-queue of learning cards in the session, extra +5 new moves.
- **Grading:** automatic per the brief: Again on a wrong first try, Hard when slow (average per move on multi-move cards), after a hint, or after "Playable, but your move is X"; your other branch move is not a mistake ("That is your other move here. This time: …"). Undo grade restores the card and deletes the review.
- **Training room:** every card type (Move lines, new moves in Learn style with arrow and note, Punish, Danger with the bait replay, Puzzle with the first move auto-played in Arcade and Drill; puzzles and game mistakes are not cards since Nov 18), branch cues from Birch where you have two moves in one position (`lib/cue.ts`), card labels with "also in N other lines", promotion picker, sounds and haptics.
- **Today:** Due / New / Done today, streak, 7-day retention, this week, backup banner, analysis progress, out-of-the-opening sparkline from your games.
- **Explore:** real tree for your band, search over every named opening, breadcrumb, play moves on the board, rows with frequency, games, W/D/L and eval, markers ★ • ⚔ ⚠ and stage icons, change your move or add a second one (move editor with notes), traps and puzzles below with previews. Learn from here (override dialog, rounds of 5, missed ones repeat) and Drill (Lines / Traps / Mixed, Rare replies, summary with Mark missed as Again and Learn these).
- **Skill tree** (beyond the brief): tap an opening in Repertoire or Stats. It grows sideways on a dark canvas: each of your moves is a circle, your opponent's replies are the curved edges with how often they are played, and each main branch has its own colour, title and learned count. Moves light up in their branch colour as they go from learning to mature (1/3, 2/3, 3/3), lapsed moves get a red ring. Three levels show at a time; "+N" chips step into deeper parts, with a trail back. Tapping a move shows its line, stage and buttons for Explore and Drill.
- **Game layer:** openings you are mastering (several per colour; onboarding, Settings, the star in the tree) feed half of each day's new moves; XP, levels and ranks, a daily goal ring, streak flame, combos, a coloured answer panel that moves on after a clean answer, a session-complete celebration and trophies on Stats. See DESIGN.md, "The game layer".
- **Teaching:** every new move and every miss comes with a sentence on why the move is played, read from the position (`lib/explain.ts`: captures, threats, f7/f2, development, castling, pawn roles) plus how often it is played at your level; your own note still wins. Birch explains each thing once in the first session (new move, recall, a miss, the schedule). Openings are split into chapters (the opponent's main branches), shown on Today's mastering cards and in the tree's sheet. Play it out (`routes/Play.svelte`): eight moves on from any line against book replies at your level and then Stockfish, each move measured against the engine's best; no card is touched.
- **Birch:** the mascot (`lib/Mascot.svelte`, a small birch pawn in a blue scarf, with six moods, little arms and a breathing idle) and its voice (`lib/voice.ts`): a line on Today that knows your streak and queue, a face on every answer, the session-complete screen and the play-out verdict.
- **Is it working?:** Today compares your last 10 analysed games with the 20 before: eval after move 10, share of games that stayed inside your lines, win rate.
- **Grading fix:** an answer given after a wrong first try is now recorded, so a missed card is graded Again (before, it was skipped, and single cards came out Good).
- **Skill tree:** now full screen (no tab bar), with a Next up button that jumps to the move you can learn next.
- **Repertoire:** White and Black (vs 1.e4, 1.d4, others), per opening: lines, learned / total, coverage %, stage bar; Reset to defaults per section; Uncovered in your games; Rare cards with Retire.
- **Stats:** all seven sections from the cards, reviews and games tables.
- **chess.com:** sync on open after 24 h and Sync now; first sync imports 3 months, then new games by URL; rated games in the chosen time classes; Paste PGN fallback. On-phone analysis in up to three parallel Web Workers (Stockfish lite, 300 ms per position, for the Today and Stats eval charts; book moves judged from the tree's evals, decided positions get a 60 ms look only), resumable; later syncs never reach back before the first three-month window; repertoire deviations lapse their cards; uncovered replies listed.
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
- **Lichess game sync** (Settings → Your games; onboarding asks for either name): `GET /api/games/user/{name}` as NDJSON with the PGN in each line, no token needed (anonymous: 20 games a second). The first sync takes the last three months, later syncs only games that started after the newest one seen. The games go through the same pipeline as chess.com: repertoire deviations lapse their cards, uncovered replies are listed, and the on-device analysis fills the eval charts. Without a chess.com name, the Lichess rapid rating sets the band (the brief's chess.com + 350 is Lichess's scale). Sync on open and Sync now take both sources; one failing does not stop the other. Vitest runs a sync against a stubbed Lichess on the real data sample; checked once live against a real player's games.
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

### Higher bands: 2200 and 2400 built (16 Nov 2026)

`ply-data build --bands … --extra-months …` (pipeline/README.md, "Higher bands") builds bands above 2000 from the same CC0 Lichess game dumps; the app reads the band list from the manifest, and onboarding and Settings offer every band it lists.

Built from October 2026 (cached) plus September and August 2026, streamed and not kept: 263.7M games read in 101 min, 104.5 min in all.

| Band | Games | Nodes | Tree | Traps (punish / danger) |
| --- | --- | --- | --- | --- |
| 2200 | 3,000,000 (the cap) | 76,463 | 2.3 MB gz | 357 / 327 |
| 2400 | 1,431,557 (all three months had) | 40,190 | 1.3 MB gz | 110 / 101 |

2400 is built from fewer games than the others, so its tree is smaller and thinner past the main lines. 29,644 new positions went to the eval database (29,555 found) and 17 to Stockfish. The 1000–2000 trees kept every node and count; the new evaluations changed only the default move on 58 (1000) to 2,345 (2000) positions, where the old default was an engine move nobody in the band plays and the new one is a played move within the engine's tolerance. Cargo tests, type check, Vitest (107) and the smoke test in Chromium and WebKit iPhone pass on the new data.

The estimate made before the build, for the record: it was estimated from that slice (192,720 games: 2.2 % qualify for 2200, both players 2100–2299 at 3+ minutes; 0.46 % for 2400) and from Lichess's published sizes (October 2026: 95.4M games, 31.0 GB; September 89.6M, 29.2 GB; August 91.9M, 30.1 GB). The slice is the first hours of one month, so the rates are rough.

| Band | Games to 3M | Dumps to read | Download | Time at the October build's pace (2.2M games/min) |
| --- | --- | --- | --- | --- |
| 2200 | about 138M | October and about half of September | about 4 GB more of October (26.8 GB are cached) and 14 GB of September | about 65 min, plus the eval lookup over the cached 22.5 GB eval database |
| 2400 | about 650M | about seven months | about 210 GB | about 5 hours |

The three-month 2400 band was the route taken.

## Accounts and sync (16 Nov 2026)

Build-order step 3 of `reports/Ply subscription readiness gaps.md`. Everything here is free.

- **Accounts:** with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the build (repo root `.env.local`, see `.env.example`; CI secrets), login is the first screen and progress lives on the account. The deployed build always has them. Builds without them (CI's smoke tests, forks) run on the device only. Log in with email and password ("Forgot password?" emails a reset link; Settings can change the password) or with Lichess (`supabase/functions/lichess-login`). A second device skips onboarding and pulls the account's progress ("Bringing in your progress"); a device that already had data merges it in and says what came in.
- **Server:** `supabase/migrations/20261116000000_sync.sql`: one table per synced IndexedDB table (`settings`, `repertoire`, `book`, `cards`, `reviews`, `games`) with the natural key, `data jsonb`, `updated_at`, `deleted`, and a server `seq` / `synced_at` to pull by; Row Level Security (`auth.uid() = user_id`) on all of them; triggers that refuse older writes by the merge rules; `delete_my_account()`. The opening data never syncs. Checked in a local Postgres (PGlite, with Supabase's `auth.uid()` and roles stood in for): 27 checks on the merge rules, per-setting merge, deletions, the reset, Row Level Security between two users, no access without a login, and account deletion.
- **Change tracking:** Dexie version 4: `updatedAt` on every synced row through hooks, existing rows stamped at the upgrade, tombstones in `tomb`, sync state in `meta`, reviews indexed by card + time. Settings get per-setting stamps.
- **Merge and sync engine** (`lib/cloud/merge.ts`, `lib/cloud/engine.ts`): pull, merge in one transaction, push, save the cursor. Triggers: login, opening the app, leaving a session or Play it out, finishing onboarding, the connection returning, Sync now. Status in Settings → Account ("Synced 2 min ago", "Offline, will sync later", the error).
- **Settings → Account:** who you are, status, Sync now, Log out (a last sync, then the device is cleared; it warns if that sync failed), Delete my account and synced data. Reset all progress resets the account too.
- **Honesty:** onboarding no longer says Ply keeps no account; the privacy draft says what is stored with Supabase and how to delete it; the landing draft and the brief match.
- **Tests:** Vitest for the merge rules (12) and the sync engine with two simulated devices and the server's rules in memory (12: offline training on both, deletions, undo, per-setting merge, onboarding defaults, failed pull and push, paging, late writes, stale pushes, another account). `npm run devices` (also in CI): two Playwright browser contexts as two devices against a stand-in Supabase. A onboards and trains, B logs in and gets it, both train offline and change different settings, both sync: identical tables, every review from both kept (the union), each card at its latest review, both settings changes kept; B logs out (cleared) and back in (everything returns); no request leaves for anywhere else. `npm run smoke` passes on a build without keys.
- **Not done or not checked:** the migration is applied to the real project and `lichess-login` is deployed (2026-11-16), but logins have not been tried end to end from here. Google login is out for now. XP and other counters in settings merge like any setting, so XP earned on two devices offline at the same time keeps one device's total.

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

## Desktop and the landing page (Nov 16)

- **Landing page** (`routes/Landing.svelte`, `src/landing/`): shown to anyone not logged in, at every width; ends in the login, restyled as a birch slab. A live board plays the 1200 band's own main line into the Fried Liver with the replies fanning out and a card flipping from New to Learned; one position at all eight bands (pinned, driven by the scroll or the band control); the three ways to train; a real trap played both ways (6.Qf3, 22% at 1200); the slips your level makes (a Danger trap); a small real skill tree; 24 sigils; Birch; devices; free and open, with what is stored where; the login. Numbers and moves come from `lib/landing/demo.json`, built by `npm run landing-data` from `public/data` and checked by `demo.test.ts`. Builds without accounts keep opening into the app and have the page at `#/welcome`.
- **Loads light:** the page is its own chunk (about 21 KB of JS and 7 KB of CSS gzipped on top of the shell), and the opening data is not fetched until the visitor heads for the login. Boards below the fold are built as they come near and stop when off screen or when the tab is hidden.
- **Desktop shell** from 1024 x 600 (DESIGN.md, "Desktop"): a sidebar (a rail of icons under 1280) with the daily goal ring, streak, level and sync status; a command palette on Ctrl/Cmd+K or / over screens, actions and all 3,865 openings; cross-fading screens.
- **Every screen laid out again for a wide window:** Today as a two-column dashboard with a new queue card; Explore as board, moves and context with a hover preview of where a move leads; Repertoire as a grid with your games beside it and a delete button on hover; Stats and Settings in balanced columns; the trainer and Play it out with one panel beside the board (opening, prompt, the line so far, other lines, key chips); session complete across the whole window with three times the confetti; the skill tree as a full-window canvas with a panel on the right, zoom buttons and arrow, +, - and 0 keys; onboarding with the night panel beside the steps.
- **Shared element:** starting a session from Today, a mastering card or Explore makes the trainer's board grow out of the sigil or board you clicked (`lib/flight.ts`).
- **The phone is untouched:** `npm run layouts` before and after; the phone, phone-on-its-side and upright-tablet shots are identical apart from animation frames (Birch breathing, the engine's eval bar). A tablet on its side (1180 x 820) now gets the desktop layout with the rail.
- **Tests:** `npm run smoke` also visits the landing page (headline, the opening count against `openings.json`, the hero board, the way into the app) and runs a 1440 x 900 session (sidebar, palette to the Caro-Kann, a card answered by typing). `npm run layouts` captures ten sizes: phone, phone on its side, both tablets, and 1280 x 800, 1440 x 900, 1920 x 1080 in light and dark, with the landing page, onboarding, the palette, the hover preview, an answer, a round summary and session complete on the desktop sizes. `npm run devices` logs in through the landing page.
- **Not checked:** WebKit does not run on the development machine (Arch, missing libraries), so Safari is covered by CI's WebKit run as an iPhone only; no real Mac, iPad or 2560 x 1440 monitor was used; real Lichess logins from the new panel were not exercised (the stand-in Supabase covers the email and password login).

Still to check on the S20 FE itself: installing from Chrome, opening offline after a restart, 60 fps, a real chess.com sync and analysis under 15 s per game. Headless Chromium boots the app from stored data and plays a full session without errors (`npm run smoke`).

## Puzzles are Lichess puzzles, and not cards (Nov 18)

- **Mistake cards are gone.** The rule (≥ 20 win% lost, the 300 ms engine's best move as the answer) mostly produced quiet engine moves that make no sense in the game. Game sync no longer makes them; the analysis still runs for the eval charts (now MultiPV 1). Mistake and Puzzle cards left in a database are deleted on load (`dropUnscheduled`), the New mistake cards limit is gone from Settings, and the Mistakes list is gone from Repertoire.
- **Puzzles are not scheduled.** Today no longer introduces or reviews Puzzle cards; New traps now means Punish and Danger only. Lichess puzzles (`puzzles.json.gz`) live in **Arcade**, which now serves only them: from your openings' families when there are more than 400, near your Arcade rating, a missed one coming back once. Arcade memory from before (traps, mistakes, book moves) is dropped. Explore's Drill → Traps still mixes in the opening's puzzles, unscheduled.
- **Move cards, traps and the queue order are unchanged.**
- **Backlog:** "You played X, it was punished by Y" from your games, as information (not a drilled card). `findMistakes` in `lib/import/mistakes.ts` is kept and tested for it.
- **Desktop trainer board:** the 820 px cap is lifted, so the board is as tall as the window allows (up to 1400 px) on 1920 x 1080 and larger. Chessground could size the board while the page was still flying in and keep that size; the board now watches its real size for 1.5 s after mount and redraws when it changes. `npm run layouts` has a 2560 x 1440 dark size.

## Lines: credit on the way and the move order (Nov 18)

Phase 1 of `docs/ROADMAP.md`, from `reports/Chess line SRS.md`.

- **Credit for moves that are not due** (`lib/srs/credit.ts`, `applyOutcome`): a correct move on a line that was not due used to update nothing, while a miss gave Again. Both are now FSRS reviews, flagged `implicit: 1`. A correct answer earns nothing for cards in a learning step, cards with difficulty ≥ 8, and cards already reviewed today. Implicit reviews do not count towards the day's review limit or the retention figures; they do go into Your schedule's weight fit, which until now saw the misses without the successes.
- **Move order of a line** (`groupLines`): where the deepest due card's position has other move orders, the line takes the one through the most due cards, then the most nearly due (R < 0.95), then the most probable.
- **Tests:** a model test (credit once a day, not against the limit, nothing for a hard card unless it is missed, Undo removes it) and a queue test on a transposition. Vitest 151 passed; `npm run smoke` passes on a build without account keys.
- **Not done yet:** 1c, checking on real logs how often a card credited on the way lapses at its next due review.

## Review lines from their landmark (Nov 18)

Phase 2 of `docs/ROADMAP.md`.

- **Landmark** (`lib/srs/segment.ts`): the opponent's last reply before a line's first due move that is not the most played one; without one, your last branch or transposition before it.
- **Fast trunk:** moves before the landmark play by themselves at 140 ms a move, yours included. A trunk move that is nearly due (R < 0.95), still in a learning step or hard (difficulty ≥ 8) is still asked. A landmark under two moves in is not worth it, and the line plays as before.
- **The reply that sets the line apart** comes at a slower beat and is named: "Rare …Nf6: 7% at your level", or "…Nf6: 31% at your level, not the main reply", or "a reply from your own book".
- **Pips and why:** a row of dots for the moves you will play (due ones ringed, played ones filled) and "2 moves due on this line".
- **Whole lines:** a fifth of lines each day play from move 1 with nothing skipped, the same lines all day.
- **A/B:** Settings → Board and appearance → Review lines start: Mixed (default: half the sessions at random), Landmark, Move 1. Every review from a review line logs its arm (`seg`).
- **Tests:** unit tests for the landmark, the callout text and the whole-line share; a model test on real data (asks before the landmark dropped, the callout, the arm logged). Vitest 157 passed; `npm run smoke` passes. A landmark line was not seen in a browser: the smoke session starts from a fresh install with nothing due.

## Branch twins and the log check (Nov 18)

Phase 3 of `docs/ROADMAP.md`, and the tool for 1c and 2h.

- **Twins side by side** (`withTwins` in `lib/srs/queue.ts`): when a due move sits at a branch of yours, the line to your other move there comes right after it, if you have learned that move and it is not due anyway. With landmark lines it starts at its landmark and says "Now your other move here". Its move is credited on the way (once a day), not graded as due.
- **What a miss was:** a review from a miss now logs the move played first (`played`); playing your other branch move first logs `sibling` (still not a miss); a miss at a branch within 3 days of a review of the other move there logs `sib`.
- **`npm run log-check -- backup.json`** (`lib/logcheck.ts`): misses on cards that were not due (the old bias); lapses at the next due review after credit on the way and after an on-time review; the landmark A/B (first try, the next due review, seconds per move); branches (lapses at a branch and elsewhere, misses that were your other move, lapses with the twin reviewed in the 3 days before and without).
- **Tests:** twins in the queue; the log check on a hand-made log; a miss logs the move played. Vitest 159 passed; `npm run smoke` passes.
