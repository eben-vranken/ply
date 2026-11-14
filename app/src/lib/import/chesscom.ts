// chess.com public API: monthly archives, games and rapid rating.
const API = 'https://api.chess.com/pub/player/';

export interface ComGame {
  url: string;
  pgn: string;
  time_class: string;
  rated: boolean;
  end_time: number;
  rules?: string;
  white: { username: string; rating: number; result: string };
  black: { username: string; rating: number; result: string };
}

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (r.status === 404) throw new Error('No chess.com player with that name');
  if (!r.ok) throw new Error(`chess.com answered ${r.status}`);
  return (await r.json()) as T;
}

export async function archives(user: string): Promise<string[]> {
  const j = await get<{ archives: string[] }>(`${API}${encodeURIComponent(user.toLowerCase())}/games/archives`);
  return j.archives ?? [];
}

export async function monthGames(archiveUrl: string): Promise<ComGame[]> {
  const j = await get<{ games: ComGame[] }>(archiveUrl);
  return j.games ?? [];
}

export async function rapidRating(user: string): Promise<number | null> {
  const j = await get<{ chess_rapid?: { last?: { rating?: number } } }>(`${API}${encodeURIComponent(user.toLowerCase())}/stats`);
  return j.chess_rapid?.last?.rating ?? null;
}

/** The archive URLs for the last `n` months, newest last. */
export const lastMonths = (all: string[], n: number) => all.slice(-n);

/** 'YYYY/MM' of a chess.com archive URL (…/games/2026/11). */
export const monthOf = (archive: string) => archive.slice(-7);
export const monthStart = (m: string) => Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1, 1);
/** The month two before this one: the start of a three-month window. */
export function windowStart(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
/** Months to fetch: from `from` on, the ones not synced yet plus the current one. */
export function monthsToSync(all: string[], synced: string[], from: string) {
  return all.filter((a) => monthOf(a) >= from && (!synced.includes(a) || a === all.at(-1)));
}
