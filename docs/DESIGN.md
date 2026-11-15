# Ply design system

## Direction: "Plywood"

Ply means a half-move, and it means a layer of veneer. The whole identity comes from that second meaning: memory is something you build up in thin layers, and the app looks like a well-made wooden object from a Scandinavian furniture studio rather than a chess site.

Three ideas carry it:

1. **The slab.** The board is a piece of birch plywood stained blue on the dark squares, sitting on a visible five-veneer edge. The Today hero card and every primary button share that construction: a flat face on a darker edge that you physically press down.
2. **The sigil.** Every opening has a mark: the path its first moves trace across the 8x8 grid, inlaid in a birch tile (your moves in the opening's colour, your opponent's in ink; a knight's move is drawn as its L). It is generated from the moves, so every opening in the full data set gets one for free.
3. **Annotation glyphs.** Feedback speaks chess: `!` correct, `?` wrong, `!?` your other branch, `??` the trap, `#` mate. Evals use Informant symbols (⩲ ± =). Shape and glyph carry the meaning, never colour alone.

Two rooms: the app is light and calm (cool grey ground, white cards); a training session is a dark room (ink navy) where the board is the only bright thing. Entering a session slides the dark room up over the light one.

**Not done:** the brief asked for a `/design-lab` with three directions compared side by side. To spend a limited budget on the shipped screens, one direction was chosen and built directly. The two rejected ideas were "Clubroom" (green baize, brass, serif: too close to chess.com) and "Poster" (full-bleed cobalt, condensed type: loud on Today, tiring for a daily tool).

## Colour

| Token | Hex | Use |
| --- | --- | --- |
| `--ground` | `#eceef3` | App background |
| `--card` | `#ffffff` | Cards |
| `--ink` | `#151936` | Text, tab bar, Black's sigil strokes |
| `--ink-2` / `--ink-3` | `#4b5170` / `#686e8e` | Secondary / tertiary text (both AA on white and ground) |
| `--cobalt` / `--cobalt-deep` | `#2b4bee` / `#1b33b8` | Primary action face / edge |
| `--birch` / `--birch-2` / `--birch-3` | `#f1e0bf` / `#e2c99c` / `#c9a873` | Light squares, slab, active tab, veneers |
| `--stain` | `#6584e2` | Dark squares |
| `--walnut` | `#6f4c2c` | Text on birch |
| `--good` / `--bad` / `--sun` | `#0f7a55` / `#cf331c` / `#f4b740` | Correct, wrong, hint and "next" |
| `--night` / `--night-2` / `--night-3` | `#131734` / `#1d2247` / `#2c3366` | Session room |
| Stages | new `#b9becf`, learning `#f08a24`, young `#7ccb9a`, mature `#0f7a55` | As the brief's stage table |

Stages also have a shape: an empty outline, then 1, 2 and 4 stacked plies.

### Dark theme

Follows the phone's setting by default; Settings → Appearance switches between Auto, Light and Dark. The dark theme re-points the neutral tokens only (`--ground` `#0d1024`, `--card` `#191e40`, `--ink` `#eef0fa`, `--line` `#2c3366`) plus a few helpers (`--accent-text`, `--good-text`, `--bad-text`, `--on-ink`, `--bar`, `--wash`) so text keeps AA contrast. Birch, the board, sigils and the session room are identical in both themes: the wood stays wood. `--ink-fixed` is the ink that never flips, for text on birch.

## Type

- **Bricolage Grotesque** (variable) for everything functional. Display 40/700, title 28/700, head 19/650, body 16, small 13.5. Tabular figures everywhere.
- **Newsreader italic** only for opening names and position notes. Seeing the italic means "this is an opening".
- ECO codes are small sans chips beside the name.

## Space, radius, elevation

4 px base; screen gutter 16; card padding 18; gaps 8/12. Radii 10 / 16 / 24 / 32. One soft card shadow; depth otherwise comes from the pressed edge (5 px, 1 px when pressed). Touch targets are at least 44 px; the session's actions sit in the bottom 90 px for the thumb.

## Components

Slab button (`.btn`, variants quiet / sun / night, sizes default / big), card, chip, ECO tag, W/D/L bar, stepper, switch, segmented control, floating tab bar (ink, active tab in birch), Sigil, Plies (stage icon), Board (chessground with the Ply theme and a glyph badge).

Added with the real build, in the same language: the first-launch screen (night ground, four birch veneers laying themselves down while the data downloads, a sun progress bar), the bottom sheet for changing your move (MoveEditor: every move with frequency, W/D/L and eval, ★ to make it yours, + for a second move), the promotion picker (four birch tiles over a dimmed board), the Learn / Drill header with a Stop button, the Drill summary (missed positions as a night card list), the Not-your-repertoire dialog, an ink notice bar for band changes and data updates, and the skill tree: its own night room, a dotted canvas you drag and pinch, growing left to right from the opening's position. Each tile is one of your moves with the reply it answers in small type above it; right-angled connectors with rounded corners join them. One colour per main branch (green, sun, coral, cobalt, violet, cyan…) tints its connectors and outlines, and the branch's name sits over its first tile in Newsreader italic. A tile has three states: outlined in its branch colour when you can learn it next, dim when it is further down the line, and birch once learned, sitting on one, two or four veneers for learning, young and mature (the Plies shape, so stage never depends on colour alone). A red count marks lapses. A "+N" pill on a tile unfolds the moves after it in place (300 ms, the tapped tile stays under the finger); the tree opens folded to its main branches plus whatever is learned. Tapping a tile opens a sheet with the position on a small board, the stage, and Learn / Drill / Explore from that move; with nothing selected the sheet shows the opening's totals.

## Wide screens

The phone in portrait is the design; everything below only adds room around it and never changes it (`npm run layouts` captures every main screen at five sizes into `docs/screenshots/layouts/`).

- **Wider than 560 px:** the app fills the window. List screens (Today, Repertoire, Stats, Settings) read as one centred 680 px column; the tab bar, notices, sheets and dialogs keep their phone width, centred.
- **Landscape windows (desktop, tablets and phones on their side):** the trainer and Play it out become two columns: the board on the left, as tall as the window allows, and the name, prompt, move list and actions in a column beside it. Explore puts the board, its name, breadcrumbs and Learn / Drill on the left (held in place while the moves and traps scroll on the right).
- **A phone on its side (under 540 px tall):** the tab bar becomes a slim rail of icons on the right edge, so it never covers the board.
- **A tablet held upright:** one column, as on the phone, centred, with the board as large as the height allows.
- Layout wrappers (`.pane`, `.lab`, `.side`) are `display: contents` on the phone, so the phone's DOM order, spacing and animations are untouched.

## The game layer

Ply is the Duolingo of chess openings on top of an honest schedule. The schedule (FSRS) decides what you see; the game layer only rewards doing it and never changes a card.

- **Mastering.** You pick the openings you are mastering, any number per colour: at first launch, in Settings → Mastering, or with the star on an opening's tree. About half of each day's new moves come from them. Today shows one card per mastered opening with its sigil, a mastery percentage (learning counts a quarter, young half, mature in full), the stage bar and a Learn button.
- **XP, levels, daily goal.** About 10 XP for a clean answer, less for a corrected one, a bonus from 3 and 5 clean in a row. Levels need 100, 200, 300… XP and carry a rank every four levels (Pawn, Knight, Bishop, Rook, Queen, King). The daily goal (50 / 100 / 150 / 250 XP) is the sun ring at the top of Today.
- **Streak.** The flame is grey until today counts, then orange and alive. A finished session that extends the streak says so.
- **Combo.** Clean answers in a row show a flame in the session header; at 3 the progress bar catches fire, and 3, 5, 10… get a cheer.
- **Answer panel.** After each card a panel in the grade's colour (green Good, sun Hard, red Again) with a word of feedback, the grade, the next review and the XP; the Continue button takes the same colour. A clean answer with nothing to read moves on by itself while the button fills (Settings can turn that off); a touch holds it.
- **Session complete.** Veneer confetti, XP counting up, the level bar filling, streak and daily-goal pills; a new level takes over the headline.
- **Trophies.** Fourteen, on Stats, derived from what you have done (moves learned, mature moves, streaks, Arcade, level). Earned ones are birch slabs; the rest show how far along they are.

### Streak freezes

A freeze is ice blue (#7cc4ef on its tiles, #2a8fcf as text) with a six-armed snowflake icon: beside the flame on Today's streak pill, in the week strip and the Stats calendar for a day it covered, and as a chip on the session-complete screen when one is earned. Every 7 days in a row earns one, 2 at most; they are never sold.

## Icons

Own set, 24 px grid, 2 px round strokes, drawn in `src/lib/Icon.svelte`.

## Motion

| What | Duration | Easing |
| --- | --- | --- |
| Piece move | 170 ms | chessground default |
| Button press | 90 ms | `--ease` |
| Feedback glyph pop, session-complete plies | 260–520 ms | `--spring` (overshoot) |
| Screen change | 260 ms slide in, 130 ms fade out | cubic out |
| Wrong move | 300 ms shake | ease-out |
| Bottom sheet | 300 ms rise, 200 ms dim | `--ease` |
| First-launch veneers | 1.4 s alternate while loading | `--ease` (the one loop, only while waiting) |

Only actions get motion, with four small exceptions that mark what is alive: the first-launch loader, the lit streak flame, the ring around Today's Start button and the tiles you can learn next in the tree. Screens lay their parts down in a 45 ms stagger; a correct move flashes its square green and throws eight sparks; every slab button ticks under the finger. `prefers-reduced-motion` collapses everything to instant.

## Sound and haptics

All synthesised with WebAudio (no files). Move: a short triangle "tock" like wood on wood. Correct: two rising sine notes. Wrong: a low falling saw plus a 50 ms vibration. Session complete: a four-note major arpeggio and a short double buzz. Stepper taps: 8 ms tick.
