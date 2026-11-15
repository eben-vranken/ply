# ply-data

The desktop pipeline that builds Ply's opening data from the Lichess open databases (all CC0). It writes `app/public/data/`; the phone never touches raw Lichess data. File formats are in [`docs/DATA_CONTRACT.md`](../docs/DATA_CONTRACT.md).

```
cargo build --release
./target/release/ply-data build --month 2026-10 --out ../app/public/data --keep-downloads cache/downloads
cargo test
```

Use the most recent complete month. A full build streams about 53 GB from database.lichess.org; at ~11 MB/s it takes about 90 minutes plus the Stockfish pass. Rebuild whenever you want fresher frequencies: the app treats a new data version as an update.

## Stages

| # | Stage | Source | Cache (`--cache`, default `cache/`) |
| --- | --- | --- | --- |
| 1 | Opening names | lichess-org/chess-openings `a.tsv` … `e.tsv` | `openings.json` |
| 2–3 | Move frequencies per band, pruned tree | `lichess_db_standard_rated_<month>.pgn.zst` | `raw-<band>.json.gz` |
| 4 | Evaluations | `lichess_db_eval.jsonl.zst`, then Stockfish 17 | `evals-db.jsonl`, `evals-sf.jsonl` |
| 5–8 | Default moves, win%, Punish and Danger traps | (computed) | |
| 9 | Opening puzzles | `lichess_db_puzzle.csv.zst` | `puzzles.json` |
| 10 | Emit files and `manifest.json` | | |

Each stage's result is cached, so a stopped build continues where it left off. Delete a cache file to redo that stage. `--keep-downloads <dir>` also keeps a copy of every downloaded file (with resume of partial copies), so a re-run reads from disk in minutes instead of downloading again.

## How it works

- **Streaming.** Inputs are zstd-decoded on the fly from HTTP. When the connection drops (database.lichess.org closes long transfers every ~1.4 GB), the stream resumes with a `Range` request at the byte it stopped. Lichess serves one fast connection per IP, so stages run one after another.
- **Game filter.** Rated standard games where both players are in the same band window (band − 100 … band + 99) and the estimated duration (base + 40 × increment) is at least 180 s. Each band stops at 3,000,000 games; the stream stops when every band is full. The first 40 plies of each game add (position, move, result) counts.
- **Counting in bounded memory.** A month has ~100M games and most positions after move 10 are unique, so exact counts do not fit in 32 GB. Counts use lossy counting (Manku & Motwani) with a bucket of 300,000 games per band: at each bucket boundary, entries that could not have reached the threshold are dropped. A count can be low by at most `games / 300,000` (≈ 10 at 3M games), and nothing that could reach 50 games is dropped before it gets there. Peak memory is about 5 GB.
- **Tree.** Positions are 64-bit Zobrist keys while counting. The tree is rebuilt by walking from the start position along counted moves, keeping nodes reached by ≥ 50 games and listing moves played ≥ 10 times. EPD strings (en passant only when legal) are produced on that walk.
- **Evaluations.** The eval database is joined by EPD, taking the deepest evaluation and its principal variation. Positions it lacks go through native Stockfish 17 at depth 18. Ten single-threaded Stockfish processes run in parallel (more positions per second than one ten-thread engine), most-reached positions first.
- **Default move.** The most-played move whose resulting eval is within 30 cp of the position's eval (the best move's), from the mover's view; else the engine's best move.
- **Traps.** For every move with frequency ≥ 3% and win% loss ≥ 15 (Lichess formula): a Punish card after the move; with frequency ≥ 5%, also a Danger card before it. A Punish answer follows the engine line while the punishing side's moves stay forcing (captures and checks), up to 3 moves.
- **Size budget.** If a band's tree is over 25 MB gzipped, it is cut again at 100 games, then doubled until it fits.

## Higher bands

```
cargo run --release -- build --month 2026-10 --extra-months 2026-09,2026-08 \
  --bands 1000,1200,1400,1600,1800,2000,2200,2400 --keep-downloads cache/downloads
```

`--bands` takes any list of Lichess-rating bands (each counts games where both players are within band−100 … band+99). Bands already counted in the cache (`raw-<band>.json.gz`) are not counted again, so adding 2200 streams games for 2200 only; its new positions are looked up in the eval database without redoing the others (`evals-db.done` lists the bands joined). High-rated games are rare, so `--extra-months` carries the stream on into older months, each opened only when the one before runs out. The manifest lists the bands built and the app offers exactly those.

## Counting positions

```
cargo run --release -- positions --data ../app/public/data [--at 50,200,1000]
```

Reads `manifest.json` and every band's tree and prints the distinct positions (by EPD, so transpositions and bands count once) and position + move pairs, and how many reach each game count, by the most games in one band and by games summed over the bands. It writes nothing.

## Options

`ply-data build --help` lists them: sources can be overridden with local paths (`--games`, `--evals`, `--puzzles`, `--openings`), and thresholds (`--min-games`, `--min-edge`, `--max-games`, `--sf-depth`, `--sf-procs`, `--budget-mb`) changed for experiments. `--limit-games N` stops the game stream early for a quick test build.

Stockfish 17 is expected at `cache/sf17/stockfish/stockfish-windows-x86-64-avx2.exe` (download it from the official release); pass `--stockfish <path>` otherwise.
