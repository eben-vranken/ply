# Progress

## Done (design build)
- Design system (docs/DESIGN.md) and every screen: onboarding, Today, training session, session complete, Explore, Repertoire, Stats, Settings.
- Training session really plays: tap or drag moves, opponent auto-replies, correct / wrong / hint feedback, branch label and "other branch" message, Punish and Danger cards with trap replay, new-move intro, grade shown after each card, Undo grade, Next.
- Explore browses the demo tree with search, breadcrumb, markers, Learn and Drill launchers.
- PWA manifest and service worker, GitHub Pages workflow, screenshots in docs/screenshots (`npm run build && npm run shots`).

## Not built (everything below is still to do)
- Real SRS: ts-fsrs scheduling, card ids, queue builder and limits, line grouping. Grades and "next review" text in the session are placeholders.
- Dexie storage, real backup format (`docs/backup-format.md`), `docs/DATA_CONTRACT.md`, fixtures script.
- Data loading in the brief's formats; Repertoire editing; coverage; Stats from real reviews (all numbers are demo values).
- chess.com sync, Stockfish analysis, rating growth, "Playable, but your move is X", promotion picker.
- Vitest suite (none written), the `/design-lab` route.

## Next
1. `lib/tree` + `lib/db` against fixture files in the brief's formats.
2. `lib/srs` (ids, lines, queue, grading) with tests, then swap `SESSION` in Train for the real queue.
