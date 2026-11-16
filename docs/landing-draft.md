# Ply landing page (draft outline)

> **Built:** the page is `app/src/routes/Landing.svelte` (DESIGN.md, "The landing page"). It follows this outline where the outline still holds; where the two differ the page is right: accounts are now required in builds that have them, there are eight rating bands (2400 from 1.4 million games), and the FAQ's "Do I need an account? No" and "It stays on your device" answers were replaced by what `privacy-draft.md` says.
>
> Draft for review, not published. Text outline only, no design. Built around the free-forever promise in `reports/Ply subscription readiness gaps.md`. Nothing here mentions a paid tier, since that is not decided yet. Claims are limited to what the app does today.

## Hero

**Headline:** Openings that stay learned.

**Subhead:** Ply drills the lines players at your rating actually play, the traps inside them and the mistakes from your own games, on a spaced-repetition schedule. Unlimited, offline and free.

**Primary button:** Start training (opens the app)
**Secondary:** See how it works

**Visual:** the phone trainer mid-answer, beside the skill tree of an opening.

## The promise

**Everything that runs on your device is free. For good.**

- Unlimited repertoire size and unlimited reviews
- Every training mode: Today, Learn, Drill, Arcade, Play it out
- Import and export PGN, import Lichess studies
- Sync and analyse your chess.com and Lichess games
- Streak freezes you earn by playing, never buy

No ads, no tracking. Your progress is kept on your Ply account, so it is there on your phone and your desktop.

(One line under it: "Most opening trainers cap the free version. Ply doesn't, because none of this costs us anything to run.")

## How it works (three steps)

1. **Pick your openings, or bring your own.** Start from any named opening, or import your repertoire as PGN or a Lichess study.
2. **Train what you will actually meet.** Ply builds your lines from millions of games at your rating, so the replies you drill are the ones people play.
3. **Fix what went wrong.** Ply reads your recent games, finds the moves where you left your lines or lost the thread, and turns them into cards.

## Why Ply

- **Built from real games at your level.** Six rating bands from the Lichess open database, 3 million games each.
- **Reviews when you are about to forget.** FSRS spaced repetition, graded automatically from how you play: no buttons to press.
- **Traps both ways.** Punish the common mistakes, and avoid the popular ones that lose.
- **Your own games.** Mistakes from chess.com and Lichess become cards; moves where your opponents left your lines show up so you can learn them.
- **Works offline.** Install it from the browser; after the first launch it needs no connection except to fetch your games.

(Keep efficacy claims general: spaced repetition is well supported by memory research, but there is no published study on chess openings in particular. Do not promise rating gains.)

## For whom

Adult improvers, roughly 1200–1900 online, who want a small repertoire they understand and meet, not a book to memorise. Above 2000 the data is thinner (this changes if the higher bands are built).

## Works on

Android (install from Chrome), iPhone and iPad (add to Home Screen from Safari: needed so iOS keeps your data), desktop browsers with keyboard move entry.

## Open source

Ply is free software under GPL-3.0. The opening data comes from the Lichess open database (CC0). [Link to the repository, if it is public.]

## FAQ

- **Is it really free?** Yes. Everything that runs on your device stays free. If Ply ever offers something paid, it will be for things that cost money to run, never a cap on what is free today.
- **Do I need an account?** No.
- **What happens to my data?** It stays on your device. Export a backup from Settings any time. [Link to the privacy policy.]
- **Can I use my existing repertoire?** Yes: import PGN or a public Lichess study, with a preview of every conflict before anything changes.
- **Does it work without chess.com or Lichess?** Yes. Your games add mistake cards and set your level, but everything else works without them.

## Footer

Privacy · Source code · Opening data: Lichess open database (CC0) · [contact]
