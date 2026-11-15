// What Birch says. Short, warm, a little dry; never scolding. Lines are picked by the
// day, so the same situation does not read the same way all week.
import type { Mood } from './Mascot.svelte';
import { app, save } from './state.svelte';

const pick = (xs: string[], salt = 0) => xs[(Math.floor(Date.now() / 864e5) + salt) % xs.length];

export interface Say { mood: Mood; text: string }

/** Birch's line at the top of Today. */
export function greet(s: { streak: number; lit: boolean; left: number; done: number; goal: boolean; fresh: boolean; mins: number; froze?: boolean }): Say {
  const h = new Date().getHours();
  if (s.fresh) return { mood: 'cheer', text: `I'm Birch. Your first session takes about ${s.mins} minutes: I show you a move, you play it back, and I bring it round again just before you would forget it.` };
  if (!s.left && s.done) return s.goal
    ? { mood: 'cheer', text: pick(['Queue cleared and goal reached. That is a proper day.', 'All done, goal and all. Go and play a game.', 'Nothing left to review. I would call that a clean sheet.']) }
    : { mood: 'idle', text: pick(['Reviews are done. A round of Arcade would finish the daily goal.', 'The queue is empty. Fancy a few new moves in an opening you are mastering?']) };
  if (!s.lit && s.froze && s.streak) return { mood: 'wow', text: `A streak freeze covered yesterday, so your ${s.streak} day streak is still alive. Today counts again: about ${s.mins} minutes.` };
  if (!s.lit && s.streak >= 2) return h >= 20
    ? { mood: 'wow', text: `${s.streak} days in a row, and today is nearly over. ${s.mins} minutes keeps it alive.` }
    : { mood: 'idle', text: pick([`Day ${s.streak + 1} is waiting. About ${s.mins} minutes.`, `${s.streak} days and counting. Shall we make it ${s.streak + 1}?`, `Your moves from yesterday are ready to be asked again. ${s.mins} minutes.`]) };
  if (!s.lit) return { mood: 'idle', text: pick([`${s.mins} minutes today and the streak starts.`, 'A few minutes now beats an hour on Sunday.', 'Fresh board. Shall we?']) };
  return { mood: 'idle', text: pick([`Good start. ${s.left} more to go.`, `Halfway is still moving. ${s.left} left in the queue.`, `${s.left} cards left. They are quicker than they look.`]) };
}

/** The first time something happens in a session, Birch explains it once. */
export const TIPS = {
  intro: 'A new move comes with an arrow. Play it once and it joins your stack.',
  quiz: 'Now from memory. No clock that matters yet: getting it right is what counts.',
  wrong: 'A miss is useful: it tells me what to bring back. Play the arrow and carry on.',
  grade: 'I schedule each move for just before you would forget it. Good pushes it days away; Again brings it back in a minute.'
} as const;
export type Tip = keyof typeof TIPS;
/** The tip's text the first time it is asked for, then null for good. */
export function tipOnce(k: Tip): string | null {
  if (app.tips.includes(k)) return null;
  app.tips = [...app.tips, k];
  save();
  return TIPS[k];
}

/** After a play-out against the engine: cp from your side at the end, and how much you gave away. */
export function verdict(cp: number, lost: number): Say {
  if (cp >= 150) return { mood: 'cheer', text: 'You came out clearly better. That is the opening doing its job.' };
  if (cp >= 40) return { mood: 'cheer', text: 'A small edge out of the opening. Exactly what the line promises.' };
  if (cp > -60) return { mood: 'idle', text: lost > 80 ? 'Level, though you let a little slip on the way. Look at the marked move.' : 'Dead level against an engine. I would take that every time.' };
  if (cp > -200) return { mood: 'think', text: 'A bit worse. The moves marked ? are where it went; play it again and fix one of them.' };
  return { mood: 'sad', text: 'That one got away. No card was harmed: try it again from the same position.' };
}
