# Scorecard: Ply against its competitors

Ratings out of 100, by Claude, from Ply's code and docs and two research reports (`reports/Ply subscription readiness gaps.md`, `reports/Chess line SRS.md`). This is an informed judgement, not a measurement: the competitors were judged from their documentation and reviews, not by using them, and Ply had no real users yet. Add a new dated section each time the scoring is redone; keep the old ones for comparison.

## 18 November 2026 (after roadmap phases 1–5, commit `11bda55`)

**Ply: 68 / 100.** Among the best training loops in the field, but well behind Chessbook and Chessable as a product, and unproven.

| Area (weight) | Ply | Why |
| --- | --- | --- |
| Training engine and scheduling (20) | 18 | FSRS-6 with per-user fitting on the device, grading with no buttons, credit for every move played, landmark lines and branch twins. Only Chess Tempo documents anything as careful about line context; Chessable uses a fixed 8-step ladder. |
| Relevance of what you learn (15) | 13 | Replies drawn from real Lichess games across eight rating bands: Chessbook's most-praised feature, here from the start and free. |
| Teaching and the "why" (15) | 8 | Rule-based board reading plus engine facts (threat stopped, only good move, what it prepares). Better than bare drilling; far below Chessable's courses by titled authors. No plans, pawn structures or model games. |
| Learning from your games (10) | 7 | chess.com and Lichess sync, moves that leave your lines lapse, Uncovered in your games, Is it working?. Chessbook and Aimchess do comparable things. |
| Range of content (10) | 5 | 3,865 named openings, bands to 2400, PGN and Lichess study import. No masters data, no courses, lines capped at 40 plies. |
| UX, polish, fun (10) | 7 | A real game layer, a coherent look, desktop and phone layouts, keyboard input. Young; several screens (the Learn walkthrough among them) never seen on a real device. |
| Platform and reach (10) | 4 | Web app only, no App Store or Play Store, English only, no push reminders. |
| Trust and maturity (10) | 6 | Accounts and sync, backups, open source, 166 unit tests and browser smoke runs. Zero users, no track record, the iPhone checklist still open. |

Competitors on the same rubric (lower confidence):

| App | Score | In one line |
| --- | --- | --- |
| Chessbook | ~80 | Same core idea, polished, native apps, model games; free repertoire size capped. |
| Chessable | ~78 | Content is king; dated training engine, review pile-ups, expensive. |
| **Ply** | **68** | Best free core loop; thin on teaching, reach and proof. |
| Chess Tempo | ~65 | Deep and configurable, excellent line context; looks old, the opening trainer is secondary. |
| Chessreps | ~62 | FSRS and titled-author courses, small. |
| Listudy, En Croissant, Chessdriller | 45–55 | Capable hobby and open-source tools. |

What would move Ply's score most, in order:

1. **Real users and devices (about +5):** on phones, fix what breaks, a few weeks of `npm run log-check` data.
2. **Teaching depth (up to +5):** short notes for the starter openings, by hand or written at build time and checked against the engine facts.
3. **Reach (about +4):** store apps through a wrapper (Capacitor), push reminders for the streak, a second language.
4. **Content (about +3):** a masters band or model games per opening.
