// Settings and navigation. Settings live in Dexie (`settings` table) with a
// localStorage copy so the theme is known before first paint.
const KEY = 'ply-state-v1';

const defaults = {
  onboarded: false,
  username: '', // chess.com
  lichessUser: '',
  white: 'Italian Game',
  blackE4: '1...e5',
  blackD4: "Queen's Gambit Declined",
  // an opening picked from the full list in onboarding: its moves (UCI, space separated), '' = the named choice above
  whitePath: '',
  blackE4Path: '',
  blackD4Path: '',
  newMoves: 10,
  newTraps: 5,
  newMistakes: 10,
  maxReviews: 150,
  hardSeconds: 10,
  retention: 90,
  depth: 0, // 0 = auto by rating
  replyPct: 3,
  band: 0, // 0 = auto (chess.com rapid + 350)
  timeClasses: ['Rapid'] as string[], // Bullet, Blitz, Rapid, Classical (Lichess), Daily
  gamesRated: 'rated' as 'rated' | 'casual' | 'both',
  gamesFrom: '', // 'YYYY-MM-DD': import games from this day on ('' = the last three months at the first sync)
  gamesTo: '', // 'YYYY-MM-DD': up to this day ('' = no end)
  rollover: 4,
  sounds: true,
  vibration: true,
  delay: 400,
  showName: false,
  theme: 'auto' as 'auto' | 'light' | 'dark',
  autoNext: true, // a clean answer moves on by itself
  storageNoteSeen: false, // Safari's 7-day storage rule was explained (lib/platform.ts)
  // the game layer: experience points and the daily goal (lib/game.ts)
  xp: 0,
  xpDay: 0,
  xpToday: 0,
  goal: 100,
  goalHit: 0, // the study day the goal was last celebrated
  tips: [] as string[], // what Birch has explained already
  // arcade: its own rating and counts, apart from the cards
  arcadeRating: 1000,
  arcadeBest: 0,
  arcadeSolved: 0,
  arcadeMissed: 0,
  // the openings you are mastering, per colour: move paths (UCI, space separated) joined by '|', null = none
  focusW: null as string | null,
  focusB: null as string | null,
  // growing with rating
  rating: 0, // last chess.com rapid rating
  autoBand: 1200, // band the app is on in auto mode
  bandSet: false, // the band has been set from a chess.com rating (later changes hold 7 days)
  pendingBand: 0, // a different band seen since pendingSince
  pendingSince: 0,
  bandNotice: '',
  // day bookkeeping
  // catching up after time away (srs/catchup.ts): the plan, and the study day the offer was turned down
  catchUp: null as null | { start: number; days: number; perDay: number },
  catchUpDeclined: 0,
  extraNew: 0,
  extraDay: 0,
  lastBackup: 0,
  lastSync: 0,
  syncedArchives: [] as string[],
  lichessFrom: 0, // ms: the oldest Lichess game Ply imports (three months back from the first sync)
  lichessSince: 0, // ms: start time of the newest Lichess game seen; later syncs fetch only newer ones
  syncFrom: '' // 'YYYY/MM': the oldest chess.com month Ply imports (three months back from the first sync)
};
export type Settings = typeof defaults;
export const DEFAULTS: Readonly<Settings> = defaults;

function load(): Settings {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { ...defaults }; }
}
export const app = $state<Settings>(load());

let mirror: ((s: Settings) => void) | null = null;
/** db.ts registers the Dexie mirror once it is open. */
export function onSave(fn: (s: Settings) => void) { mirror = fn; }
export function save() {
  const snap = $state.snapshot(app) as Settings;
  try { localStorage.setItem(KEY, JSON.stringify(snap)); } catch { /* private mode */ }
  mirror?.(snap);
}
export function replaceSettings(s: Partial<Settings>) { Object.assign(app, defaults, s); save(); }
export function resetSettings() { Object.assign(app, defaults); save(); }

// hash router
export const route = $state({ path: location.hash.slice(1) || '/today', dir: 1 });
const ORDER = ['/today', '/explore', '/repertoire', '/stats', '/settings'];
addEventListener('hashchange', () => {
  const next = location.hash.slice(1) || '/today';
  route.dir = ORDER.indexOf(next.split('?')[0]) >= ORDER.indexOf(route.path.split('?')[0]) ? 1 : -1;
  route.path = next;
});
export const go = (p: string) => { location.hash = p; };

// what the trainer runs next (set by Today / Explore / Stats before navigating)
import type { Item } from './session';
export interface Run {
  items: Item[];
  mode: 'today' | 'learn' | 'drill';
  title: string;
  /** more items when the list runs out (Learn rounds, Drill, re-queued learning cards) */
  more?: (missed: Item[]) => Promise<Item[]> | Item[];
  /** Arcade: reports each finished position; set only for an arcade run */
  arcade?: (it: Item, clean: boolean) => { clean: boolean; delta: number; rating: number; streak: number; back: boolean; returns: boolean };
  /** Drill: called with the summary when stopped */
  rare?: boolean;
}
export const run = $state<Run>({ items: [], mode: 'today', title: '' });
