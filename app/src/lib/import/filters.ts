// Which of your online games Ply imports: rated or casual, time control and a date range.
// The same rules for chess.com and Lichess. Pure, so it is tested.

export type RatedFilter = 'rated' | 'casual' | 'both';
export interface GameFilters {
  rated: RatedFilter;
  /** time classes as Settings names them: Bullet, Blitz, Rapid, Classical, Daily */
  classes: string[];
  /** 'YYYY-MM-DD' or '' (local dates, both days included) */
  from: string;
  to: string;
}

export const TIME_CLASSES = ['Bullet', 'Blitz', 'Rapid', 'Classical', 'Daily'] as const;
/** chess.com's time_class and Lichess's speed for each Settings name (chess.com has no classical) */
const NAMES: Record<string, string[]> = { Bullet: ['bullet', 'ultraBullet'], Blitz: ['blitz'], Rapid: ['rapid'], Classical: ['classical'], Daily: ['daily', 'correspondence'] };

/** Start of the `from` day, local time (0 when unset). */
export const fromMs = (d: string) => (d ? new Date(`${d}T00:00:00`).getTime() : 0);
/** End of the `to` day, local time (Infinity when unset). */
export const toMs = (d: string) => (d ? new Date(`${d}T00:00:00`).getTime() + 864e5 - 1 : Infinity);

export function keepGame(g: { rated: boolean; timeClass: string; date: number }, f: GameFilters): boolean {
  if (f.rated === 'rated' && !g.rated) return false;
  if (f.rated === 'casual' && g.rated) return false;
  if (!f.classes.some((c) => NAMES[c]?.includes(g.timeClass))) return false;
  return g.date >= fromMs(f.from) && g.date <= toMs(f.to);
}

/** Lichess perfType values for the chosen time classes. */
export const lichessPerfs = (classes: string[]) => classes.flatMap((c) => (NAMES[c] ?? []).filter((n) => n !== 'daily'));

/** chess.com archive months ('YYYY/MM') that can hold games in the date range. */
export function monthInRange(month: string, f: GameFilters): boolean {
  const start = new Date(+month.slice(0, 4), +month.slice(5, 7) - 1, 1).getTime();
  const end = new Date(+month.slice(0, 4), +month.slice(5, 7), 1).getTime() - 1;
  return end >= fromMs(f.from) && start <= toMs(f.to);
}
