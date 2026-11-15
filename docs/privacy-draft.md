# Ply privacy policy (draft)

> Draft for review, not published. It describes the app as built at the time of writing. Items in [brackets] need filling in, and a lawyer should read it before it goes live, in particular for the EU (GDPR).

**Effective date:** [date]
**Who runs Ply:** [name, country, contact email]

## The short version

Ply has no accounts, no server of its own and no tracking. Your repertoire, cards, reviews and games are stored on your device and stay there. Ply connects to chess.com or Lichess only to fetch your public games, your rating or a public study, and only for the usernames or study addresses you give it.

## What Ply stores, and where

Everything is stored in your browser's storage on your device (IndexedDB, plus a copy of your settings in localStorage so the colour theme is right before the app has loaded):

- your settings, including the chess.com and Lichess usernames you enter
- your repertoire, your notes, and opponent replies you imported or added
- your cards, their schedule and your full review history
- games fetched from chess.com or Lichess, or pasted by you, with the evaluations Ply computes for them
- the opening data Ply downloads once (built from the Lichess open database)

Nothing of this is sent to us: we have no server to send it to. Game analysis runs on your device with a built-in copy of the Stockfish engine.

## When Ply connects to the internet

- **Loading the app.** The app and its opening data are served from GitHub Pages. When you open Ply, your browser asks GitHub for these files, and on opening Ply checks once whether a newer version of the opening data exists. GitHub receives the technical information any website receives, such as your IP address and browser type, and handles it under the [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement). We do not receive it.
- **chess.com.** If you enter a chess.com username, Ply asks chess.com's public API for that player's rating and public games. This happens when you tap Sync now, and automatically when you open Ply if the last sync was more than 24 hours ago. chess.com receives the username and the usual technical information. See the [chess.com privacy policy](https://www.chess.com/legal/privacy).
- **Lichess.** If you enter a Lichess username, Ply asks Lichess's public API for that player's rating and public games, on the same schedule as chess.com. If you import a Lichess study, Ply asks Lichess for that study's PGN once, when you tap the button. Lichess receives the username or study address and the usual technical information. See the [Lichess privacy policy](https://lichess.org/privacy).

Ply sends no other requests. It contains no analytics, advertising, crash reporting, tracking pixels or third-party scripts, sets no cookies, and loads its fonts and icons from its own files.

## Backups and exports

Export backup and Export PGN create a file on your device. Ply hands it to your device's share sheet or downloads it; where it goes from there is up to you. Import backup and Import PGN read a file you choose and do not send it anywhere.

## Deleting your data

- **Settings → Reset all progress** deletes your cards, reviews, repertoire, games and settings from the device.
- Clearing the site's data in your browser, or uninstalling the installed app, deletes everything, including the opening data.
- Games and studies stay on chess.com or Lichess under their own policies; Ply cannot change them.

On iPhone and iPad, and in Safari on a Mac, the browser deletes a website's stored data after 7 days without a visit unless the site was added to the Home Screen or Dock. Ply warns about this once. A backup protects against it.

## Children

Ply collects no personal information from anyone, children included. [Add any age statement required where Ply is offered.]

## Changes

If Ply starts to send any data anywhere new, for example if accounts or sync are added, this policy will change first and the app will say so before anything is sent.

## Contact

[contact email]
