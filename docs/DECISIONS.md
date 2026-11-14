# Decisions

Choices made where the brief left room, or where building it showed a detail the brief did not settle.

| Question | Choice | Reason |
| --- | --- | --- |
| Three-direction design lab? | Skipped; one direction ("Plywood") built directly | Owner's budget instruction during the design build. Rejected alternatives are in DESIGN.md. |
| Light or dark? | Both: follows the system, with an Appearance setting (Auto / Light / Dark). The training room is dark in both | Owner asked for a dark mode; this overrides the brief's "no user-selectable themes in v1". |
| Counting ~100M games in 32 GB | Lossy counting with a 300k-game bucket per band; positions as 64-bit Zobrist keys | Exact counts do not fit. Error is at most ≈10 games per count at 3M games, well under the 50-game cut. |
| Stockfish for eval gaps | 10 single-threaded Stockfish 17 processes, depth 18, 64 MB hash each | Same total compute as the brief's "10 threads, 1 GB", but more positions per second. Most-reached positions run first. |
| Moves listed under a tree node | Moves with ≥ 10 games | Keeps rarely played moves visible in Explore without blowing the size budget. Their child positions may be below the 50-game cut. |
| Correspondence games | Kept (TimeControl "-" counts as long) | The only filter in the brief is "no bullet". They are a tiny share. |
| Punish answer length | Engine line cut at the first quiet move of the punishing side (captures and checks only after the first move), up to 3 moves | A quiet follow-up has many good moves; requiring the engine's exact choice would grade a fine answer as wrong. |
| Danger answer | Your repertoire move at that position (default move if you have none), never the bait | Your repertoire may differ from the default move; the card must agree with your lines. |
| A trap in the tree but not in your lines | Not added as a card; shown in Explore with a preview | Brief: only traps whose position appears in your lines are added. |
| New Move card "enters learning step 1" | First FSRS rating is Again (1-minute step), logged with stage "new" | ts-fsrs puts a new card rated Again on the first learning step. Intro reviews are excluded from retention stats. |
| Line coverage when the tree runs out | Counts as covered | Lines stop where no reply has ≥ 50 games; the games there have not left your lines. Replies below the threshold where others pass it count as uncovered. |
| Openings in Repertoire and Stats | Grouped by opening family of each position (Italian Game, Sicilian Defense, …), per section | Lichess names change along a line; grouping by family gives stable, recognisable rows. Positions before any name are "First moves". |
| "Also in N other lines" | Other move orders found while walking your lines (different parent position or move) | Lines are generated, so the transpositions inside them are known exactly. |
| Learn rounds | 5 new moves shown Learn style, then quizzed in their lines; missed ones go to the front of the next round | As the brief, with "repeat at the end of the round" done by carrying them into the next round. |
| Drill when you branch | Any of your moves at a branch is accepted; the rest of the drill is drawn again from the branch you played | Brief: "the drill continues down the branch you picked". |
| Due learning cards in a session | When the queue ends, cards in a learning step due within 10 minutes are played again | Brief: cards due again within the session are re-queued while the app is open. |
| On-device engine | Stockfish 19 lite, single-threaded WASM (stockfish.js npm package, GPL-3.0) | The brief asks for "Stockfish lite WASM (single-threaded)"; 19 is the current build of that package. 1.8 MB, no cross-origin isolation needed. |
| Mistake eval after your move | From the MultiPV line when your move is in the top 3; otherwise a 150 ms search of the position after it | Keeps analysis near the brief's 12 s per game. |
| Positions for the move 10 / 15 chart | Plies 20 and 30 always get an eval | They may be the opponent's turn, which the per-move analysis skips. |
| Opening data cache | IndexedDB only; the service worker precaches the app shell and engine, not `data/` | Avoids storing the data twice on the phone. Offline after first launch either way. |
| Data update on mobile data | Only on Wi-Fi when the browser reports the connection type; otherwise when the app next opens on Wi-Fi | Brief: changed files download on Wi-Fi. Browsers that do not report it are treated as Wi-Fi. |
| Promotion | Four-piece picker over the board | Brief. |
| No chess.com name at onboarding | Band 1200 with 8-move lines | Brief defaults. |
