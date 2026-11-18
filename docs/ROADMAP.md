# Roadmap: lines, learning one opening at a time, and teaching

From `reports/Chess line SRS.md` (18 Nov 2026) and the owner's two additions: learn one opening at a time, and keep learning a move separate from reviewing it. Each phase ships on its own and leaves the app working. Status: ☐ to do, ◐ in progress, ☑ done.

## Phase 1. Credit every move you play, and choose paths that cover the most (invisible)

**Why.** Today a move on the line that is not due gets Again when you miss it, and nothing when you get it right ([model.svelte.ts](../app/src/lib/model.svelte.ts), `applyOutcome`). The review log holds those failures without the matching successes, and `fitMySchedule` fits your FSRS weights on every row of it, so a fitted schedule thinks you forget more than you do. Every move you play should count. FSRS already discounts an early review: at R = 0.97 a correct answer is worth about 29% of an on-time one, at R = 0.99 about 10%.

- ☑ **1a. Credit rule (the bug fix).** Every move you produce on a line gets a real FSRS review at its real elapsed time, with the automatic grade (Again / Hard / Good). Exempt from *success* credit (a miss still gives Again): cards in a learning or relearning step, cards with FSRS difficulty ≥ 8, and cards already reviewed today, so the moves shared by every line (1.e4) are credited once a day, not in every line. These reviews are marked `implicit: 1`. They do not use up the day's review limit and are left out of the retention figures, so those stay comparable with before. They do go into the weight fit: that is the point.
- ☑ **1b. Path choice.** The deepest due card still ends the line, but when its position can be reached by more than one move order, the line takes the order that passes through the most due cards, then the most cards nearly due (R < 0.95), then the most probable.
- ◐ **1c. Check on real logs** (`npm run log-check -- backup.json`, built; the verdict needs a few weeks of reviews): the share of Again rows that were not due when missed (the size of the old bias); after a few weeks with 1a, how often an implicitly credited card lapses at its next due review, compared with cards credited on time; reviews per day before and after. Keep 1a if the lapse rate after implicit credit is not clearly higher; otherwise fall back to logging nothing for moves that are not due (neither successes nor failures).
- ☐ **1d. Line-aligned fuzz** (optional): moves reviewed together on one line get the same fuzz offset, so they come due together again (Chessdriller does this).

## Phase 2. Landmark segments with context that needs no names

**Why.** Every line plays from move 1 and stops wherever the deepest due card is, so a line has no stable shape, and the player is tested on a path they did not choose. Music research and Chess Tempo agree on starting at landmarks and stopping at boundaries.

- ☑ **2a. Landmarks** from the band data: the first position after an opponent reply that is not the most played one, a branch of yours, a transposition merge.
- ☑ **2b. Scrubbed trunk:** moves before the landmark play fast (about 150 ms a ply); a trunk move that is nearly due or weak is asked instead of scrubbed.
- ☑ **2c. Deviation callout:** a pause on the reply that defines the line: "Rare …Nf6, 7% at your level".
- ◐ **2d. Progress pips** for the moves you still have to make, the due ones marked, so you can see where the line ends. Built. Not built: extending a line past its last due card to the next boundary, because lines almost never have a single reply to extend through.
- ☑ **2e. Why this line:** a chip, "3 moves due here".
- ☑ **2f. Reintegration:** every few days, or when a whole line is nearly due, play it once from move 1.
- ☑ **2g. Line colour per subtree or role,** not per line. Already the case: a colour belongs to a main branch of the opening's first split, not to a line, and the deviation callout is the second signal.
- ◐ **2h. A/B on the device** (the arm is drawn per session and logged as `seg` on every review; the analysis is in 1c's script), randomised per session: time per session, first-try accuracy within card, hint and slow-move rates, retention at the next due review after a mid-line start versus from move 1, lapses on deep moves, day-7 return.

## Phase 3. Branch siblings as one unit

**Why.** At a position where you have two moves, the board alone does not say which is wanted. That is where "which line?" actually causes wrong answers, and where interference between the two moves is expected.

- ◐ **3a. Log check** (in `npm run log-check`; misses now log the move played first, and playing your other move first is logged too): lapse rate at branch, transposition and single-move positions (at equal stability); how often a wrong answer at a branch is exactly your other move; whether a sibling lapses more after its twin was reviewed. If branches do not lapse more, this phase shrinks to 3c.
- ☑ **3b. Both moves in one session** (built as the second form: your other move's line comes right after a due move at a branch, when you have learned it): accept either move first, then ask for the other ("Bc4 is right. Now your other move here"), or route the line through the branch twice.
- ☑ **3c. Fixed cue per branch,** the same every time. Already so: `lib/cue.ts` depends only on the position, your moves and the data.
- ☑ **3d. Interference flag** (`sib` on the review): a sibling that lapses within a few days of its twin's review is logged as such.

## Phase 4. Learn one opening at a time

**Why.** "Learn 5 new moves" is the most fun part of the app: many small variants of one idea, over and over, until the core idea clicks. The Anki-style daily trickle of new moves from everywhere dilutes that.

- ☑ **4a. Learning set:** the openings you are learning (per colour; the existing mastering openings, `focusW` / `focusB`, renamed in the UI). When any are set, *all* new moves come from them, not half. With none set, new moves arrive as today.
- ☑ **4b. No daily new-move limit while learning** (the Learn button on the opening's card on Today already ran round after round; Today's own new moves keep the daily limit): "Learn 5 more" rounds go on as long as you want, in the opening's teaching order (the main line first, then the most played branches).
- ☑ **4c. A brake, not a wall** (once a sitting, between rounds: Keep going / Stop here): when the moves still in learning steps pile up (for example more than 20), or tomorrow's due count would pass your review limit, Birch suggests reviewing first or stopping for the day. You can still go on.
- ☑ **4d. Finishing an opening** (done: no new moves left and at most a fifth still in learning steps; next: the biggest opening of the same section, White, Black vs 1.e4 and so on, not learned yet): when every move is learned and most are past learning, the opening shows as learned and Birch suggests the next one (the next most-met opening of that colour in your games, or the onboarding choices).
- ☑ **4e. Reviews are unchanged:** due reviews from every opening still come every day; only new moves are focused. Otherwise older openings would be forgotten.
- ☑ **4f. One at a time by default, several allowed** (onboarding already picks one per section: White, Black vs 1.e4, Black vs 1.d4): onboarding and the star in the tree propose one opening per colour; adding more is allowed.

## Phase 5. Learn a move properly; review it quickly

**Why.** Players drill moves without knowing why they are played. `lib/explain.ts` reads only the board (captures, threats, f7, development), so it misses the ideas that matter: what a move prevents, what it prepares, the plan it belongs to.

- ☐ **5a. Learn is a walkthrough, review is play.** In Learn, a new move is shown before you play it: the idea in one or two sentences, then where useful a short demonstration on the board (the threat it stops, played out and taken back; or the follow-up it prepares), with arrows. Then you play it. Review stays as it is: no notes unless you miss.
- ☐ **5b. Depth by move:** a recapture, a forced or only move, or plain development gets one line ("Recapture.") and no walkthrough. A move whose point is not on the board gets the full one.
- ☐ **5c. Ideas from the engine, in the pipeline:** for each of your moves in the band trees, precomputed offline and shipped as data: the opponent's best move if you passed (the threat it stops), the move it makes possible next (what it prepares), the pawn break it supports, and whether it is the only good move. These give "stops …Bg4 pinning the knight" and "prepares d4". Nothing runs at review time.
- ☐ **5d. Written explanations for the most-met moves** (decision needed, see below), checked against the facts from 5c and shipped as data. Your own note still wins.
- ☐ **5e. Test:** retention at the first due review for moves taught with a walkthrough versus a one-liner (within players), time spent in Learn, and how often players skip the walkthrough.

**Decision needed for 5d:** where the deeper explanations come from. (A) The engine facts from 5c alone, turned into sentences by rules. It covers every move but stays shallow. (B) Explanations written by a language model at build time for the most-met few thousand of your moves per band, grounded in 5c's facts and spot-checked. Deeper, but it needs a review step for mistakes. (C) Written by hand for the starter openings. Best quality, slowest. Suggested: A everywhere, then B for the most-met moves.

## Order and dependencies

1 comes first: it fixes the data the others are measured with. 2 and 3 change how reviews play and need 1's credit rule (scrubbed trunk moves must be worth something). 4 and 5 change how new moves are learned and depend on none of 1 to 3, so they can move ahead if they matter more; 5c (pipeline) can run in parallel with anything.
