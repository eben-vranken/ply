// App state for the design build: persisted to localStorage (Dexie comes with the real SRS engine).
const KEY = 'ply-state-v1';

const defaults = {
  onboarded: false,
  username: '',
  white: 'Italian Game',
  blackE4: '1...e5',
  blackD4: "Queen's Gambit Declined",
  newMoves: 10,
  newTraps: 5,
  newMistakes: 10,
  maxReviews: 150,
  hardSeconds: 10,
  retention: 90,
  depth: 0, // 0 = auto
  replyPct: 3,
  band: 0, // 0 = auto
  timeClasses: ['Rapid'] as string[],
  rollover: 4,
  sounds: true,
  vibration: true,
  delay: 400,
  showName: false,
  theme: 'auto' as 'auto' | 'light' | 'dark',
  streak: 12,
  doneToday: 0,
  sessionAt: 0,
  extraNew: 0,
  lastBackup: 0
};
export type Settings = typeof defaults;

function load(): Settings {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { ...defaults }; }
}
export const app = $state<Settings>(load());
export function save() { try { localStorage.setItem(KEY, JSON.stringify(app)); } catch { /* private mode */ } }
export function resetAll() { Object.assign(app, defaults); save(); }

// hash router
export const route = $state({ path: location.hash.slice(1) || '/today', dir: 1 });
const ORDER = ['/today', '/explore', '/repertoire', '/stats', '/settings'];
addEventListener('hashchange', () => {
  const next = location.hash.slice(1) || '/today';
  route.dir = ORDER.indexOf(next.split('?')[0]) >= ORDER.indexOf(route.path.split('?')[0]) ? 1 : -1;
  route.path = next;
});
export const go = (p: string) => { location.hash = p; };

// what the trainer should run next (set by Today / Explore / Stats before navigating)
import type { Item } from './demo';
export const run = $state<{ items: Item[]; mode: 'today' | 'learn' | 'drill'; title: string }>({ items: [], mode: 'today', title: '' });
