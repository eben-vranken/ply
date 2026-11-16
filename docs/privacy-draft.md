# Ply privacy policy (draft)

> Draft for review, not published. It describes the app as built at the time of writing. Items in [brackets] need filling in, and a lawyer should read it before it goes live, in particular for the EU (GDPR).

**Effective date:** [date]
**Who runs Ply:** [name, country, contact email]

## The short version

You log in to Ply with your email or Lichess. Your repertoire, cards, reviews, games and settings are stored on your device and on your Ply account, so they are the same on every device you log in on. The account is stored with Supabase, our database provider. Ply has no tracking, no ads and no analytics. Ply connects to chess.com or Lichess only to fetch your public games, your rating or a public study, and only for the usernames or study addresses you give it. When you play a puzzle, Ply asks Lichess for the game it comes from, sending only the puzzle's id.

## What Ply stores, and where

**On your device**, in your browser's storage (IndexedDB, plus a copy of your settings in localStorage so the colour theme is right before the app has loaded, and your login session in localStorage):

- your settings, including the chess.com and Lichess usernames you enter
- your repertoire, your notes, and opponent replies you imported or added
- your cards, their schedule and your full review history
- games fetched from chess.com or Lichess, or pasted by you, with the evaluations Ply computes for them
- the opening data Ply downloads once (built from the Lichess open database)

**On your Ply account**, with [Supabase](https://supabase.com) (Supabase, Inc.) in its [region] data centre:

- your login: your email address and a hash of your password (Supabase never stores the password itself), or for a Lichess login your Lichess user id and username (Ply stores no Lichess password or token)
- a copy of everything in the list above except the opening data, and except the settings that belong to one device (appearance, sounds, vibration, the Safari storage note, which tips you have seen)
- for each row, when it last changed, so your devices can merge their changes

Your account's rows can be read and written only with your own login (Row Level Security in the database). Game analysis runs on your device with a built-in copy of the Stockfish engine; your games are not analysed on a server.

Supabase processes this data for us under its [privacy policy](https://supabase.com/privacy) and [data processing agreement](https://supabase.com/legal/dpa). [Check the region and add Supabase as a processor in the GDPR section.]

## When Ply connects to the internet

- **Your account.** When you log in, and then when you open Ply, finish a training session, come back online, or tap Sync now, Ply sends the changes on your device to your account and fetches the changes from your other devices. Supabase receives the usual technical information, such as your IP address. Creating an account with an email sends you one confirmation email through Supabase, and so does asking for a password reset; logging in sends none. Logging in with Lichess sends you to lichess.org to confirm; Ply receives only who you are. For Lichess, Ply's login service on Supabase asks Lichess for your account's id and username once and then revokes the permission.
- **Loading the app.** The app and its opening data are served from GitHub Pages. When you open Ply, your browser asks GitHub for these files, and on opening Ply checks once whether a newer version of the opening data exists. GitHub receives the technical information any website receives, such as your IP address and browser type, and handles it under the [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement). We do not receive it.
- **chess.com.** If you enter a chess.com username, Ply asks chess.com's public API for that player's rating and public games. This happens when you tap Sync now, and automatically when you open Ply if the last sync was more than 24 hours ago. chess.com receives the username and the usual technical information. See the [chess.com privacy policy](https://www.chess.com/legal/privacy).
- **Lichess.** If you enter a Lichess username, Ply asks Lichess's public API for that player's rating and public games, on the same schedule as chess.com. If you import a Lichess study, Ply asks Lichess for that study's PGN once, when you tap the button. Lichess receives the username or study address and the usual technical information. See the [Lichess privacy policy](https://lichess.org/privacy).

Ply sends no other requests. It contains no analytics, advertising, crash reporting, tracking pixels or third-party scripts, sets no cookies, and loads its fonts and icons from its own files. (Versions of Ply built without an account service, for example a copy you build yourself, keep everything on the device and contact Supabase never.)

## Backups and exports

Export backup and Export PGN create a file on your device. Ply hands it to your device's share sheet or downloads it; where it goes from there is up to you. Import backup and Import PGN read a file you choose and do not send it anywhere.

## Deleting your data

- **Settings → Account → Delete my account and synced data** deletes your account and everything stored with it on Supabase straight away, and clears the device you do it on. Other devices keep what they have until you clear them. Export a backup first if you want a copy.
- **Settings → Account → Log out** clears the device; your account keeps everything.
- **Settings → Reset all progress** deletes your cards, reviews, repertoire, games and settings from the device and from your account (your other devices reset at their next sync). Your login stays.
- Supabase may keep backups of the database for [up to N days, per the plan]; deleted data leaves them when they expire.
- Clearing the site's data in your browser, or uninstalling the installed app, deletes everything, including the opening data.
- Games and studies stay on chess.com or Lichess under their own policies; Ply cannot change them.

On iPhone and iPad, and in Safari on a Mac, the browser deletes a website's stored data after 7 days without a visit unless the site was added to the Home Screen or Dock. Ply warns about this once. A backup protects against it.

## Children

Ply collects only what an account needs (above). [Add any age statement required where Ply is offered, for example a minimum age for an account under GDPR article 8.]

## Changes

If Ply starts to send any data anywhere new, this policy will change first and the app will say so before anything is sent.

## Contact

[contact email]
