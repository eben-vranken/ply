# Ply

A chess opening trainer for the phone: your lines, the traps inside them and your own mistakes, on a spaced-repetition schedule. Installable, offline PWA. Every named opening ships inside the app, built from the Lichess open database.

- `docs/BRIEF.md`: the full spec
- `docs/PROGRESS.md`: what is built and what is checked
- `docs/DESIGN.md`: the design system; `docs/DECISIONS.md`: choices made along the way
- `docs/DATA_CONTRACT.md`: the data files; `docs/backup-format.md`: the backup JSON

## App (`app/`)

Svelte 5 + TypeScript + Vite, chessground, chess.js, ts-fsrs, Dexie, Stockfish lite WASM.

```
cd app
npm install
npm run dev      # http://localhost:5173/ply/
npm test         # Vitest: lines, queue, grading, FSRS steps, mistakes, backup
npm run check    # svelte-check
npm run build
npm run smoke    # plays a session in headless Chromium (after build)
npm run shots    # screenshots into docs/screenshots (after build)
```

## Data pipeline (`pipeline/`)

Rust CLI that streams the Lichess game, evaluation and puzzle databases and writes `app/public/data/`. See `pipeline/README.md`.

```
cd pipeline
cargo test
cargo run --release -- build --month 2026-10 --out ../app/public/data --keep-downloads cache/downloads
```

## Deploy

GitHub Actions runs `cargo test`, `svelte-check`, Vitest, the build and the smoke test on every push, and publishes `app/dist` to GitHub Pages from `main`.

Live: https://eben-vranken.github.io/ply/

Licence: GPL-3.0. Asset and data credits in `docs/ASSETS.md`.
