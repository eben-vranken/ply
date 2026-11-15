// The game layer: experience points, levels and the daily goal. It sits beside the
// schedule and never changes a card: XP is earned for answers, the level is a pure
// function of total XP, and the daily goal resets with the study day.
import { app, save } from './state.svelte';
import { dayStart } from './srs/queue';

export const RANKS = ['Pawn', 'Knight', 'Bishop', 'Rook', 'Queen', 'King'] as const;
export const GOALS = [50, 100, 150, 250] as const;
/** total XP at which a level starts: 0, 100, 300, 600, 1000 … */
const floor = (level: number) => 50 * (level - 1) * level;

export interface Level { level: number; rank: string; piece: string; into: number; span: number }
export function levelOf(xp: number): Level {
  let n = 1;
  while (xp >= floor(n + 1)) n++;
  const r = Math.min(RANKS.length - 1, Math.floor((n - 1) / 4));
  return { level: n, rank: RANKS[r], piece: 'PNBRQK'[r], into: xp - floor(n), span: floor(n + 1) - floor(n) };
}

const today = () => dayStart(Date.now(), app.rollover);
export const xpToday = () => (app.xpDay === today() ? app.xpToday : 0);

/** Add (or with a negative number take back) XP. Says whether the level or the daily goal was just reached. */
export function addXp(n: number): { level: Level | null; goal: boolean } {
  const t = today();
  if (app.xpDay !== t) { app.xpDay = t; app.xpToday = 0; }
  const before = levelOf(app.xp), was = app.xpToday;
  app.xp = Math.max(0, app.xp + n);
  app.xpToday = Math.max(0, app.xpToday + n);
  const goal = n > 0 && was < app.goal && app.xpToday >= app.goal && app.goalHit !== t;
  if (goal) app.goalHit = t;
  save();
  const after = levelOf(app.xp);
  return { level: after.level > before.level ? after : null, goal };
}

/** XP for one finished position. */
export function xpFor(kind: 'card' | 'intro' | 'drill' | 'arcade', clean: boolean, combo: number): number {
  if (kind === 'intro') return 5;
  const base = kind === 'card' ? (clean ? 10 : 4) : kind === 'arcade' ? (clean ? 8 : 2) : clean ? 5 : 2;
  return base + (clean && combo >= 5 ? 5 : clean && combo >= 3 ? 2 : 0);
}
