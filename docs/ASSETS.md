# Assets

| Asset | Source | Licence |
| --- | --- | --- |
| Chess pieces (`app/src/assets/pieces/mpchess`) | "mpchess" by Maxime Chupin, via lichess-org/lila `public/piece/mpchess` | GPL-3.0-or-later |
| Bricolage Grotesque (variable) | `@fontsource-variable/bricolage-grotesque` | SIL OFL 1.1 |
| Newsreader (variable italic) | `@fontsource-variable/newsreader` | SIL OFL 1.1 |
| Board, icons, sigils, app icon | Drawn in code for this project | GPL-3.0 |
| Sounds | Synthesised at runtime (WebAudio) | n/a |
| Stockfish 19 lite, single-threaded WASM (`app/public/engine`) | stockfish.js by Nathan Rugg (npm `stockfish`), from the Stockfish project | GPL-3.0 |
| Opening names and ECO codes | lichess-org/chess-openings | CC0 |
| Move frequencies, evaluations, puzzles (`app/public/data`) | Lichess open database (games, evaluations, puzzles), built by `pipeline/` | CC0 |
| Evaluations for positions missing from the Lichess database | Computed with Stockfish 17 (desktop, not shipped) | GPL-3.0 tool; output is data |

Everything is bundled; nothing loads from a CDN. The only network calls are the app's own data files (first launch and updates) and the chess.com public API.
