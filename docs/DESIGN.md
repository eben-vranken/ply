# Ply design system

## Direction: "Plywood"

Ply means a half-move, and it means a layer of veneer. The whole identity comes from that second meaning: memory is something you build up in thin layers, and the app looks like a well-made wooden object from a Scandinavian furniture studio rather than a chess site.

Three ideas carry it:

1. **The slab.** The board is a piece of birch plywood stained blue on the dark squares, sitting on a visible five-veneer edge. The Today hero card and every primary button share that construction: a flat face on a darker edge that you physically press down.
2. **The sigil.** Every opening has a mark: the path its first moves trace across the 8x8 grid, inlaid in a birch tile (White's moves in the opening's colour, Black's in ink). It is generated from the moves, so every opening in the full data set gets one for free.
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

Only actions get motion; nothing loops. `prefers-reduced-motion` collapses everything to instant.

## Sound and haptics

All synthesised with WebAudio (no files). Move: a short triangle "tock" like wood on wood. Correct: two rising sine notes. Wrong: a low falling saw plus a 50 ms vibration. Session complete: a four-note major arpeggio and a short double buzz. Stepper taps: 8 ms tick.
