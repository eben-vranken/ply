// Lichess public API: study PGN (repertoire import), a player's games (game sync) and rating.
// No token: only public data. The API asks for one request at a time and a minute's wait after
// HTTP 429, so every request goes through one queue that does exactly that.
//
// Lichess also asks for a User-Agent naming the client. A web page cannot set one: Lichess's CORS
// rules do not allow the header, so a browser that sends it fails the request. The browser's own
// User-Agent and the Origin header (the site Ply is served from) go with every request instead.
export const LICHESS = 'https://lichess.org';
export const RETRY_AFTER_429 = 60_000;

let queue: Promise<unknown> = Promise.resolve();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One request at a time; on 429 wait a minute and try again (up to 3 tries). */
export function lichessFetch(path: string, init: RequestInit = {}, onWait?: (ms: number) => void): Promise<Response> {
  const run = async () => {
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(LICHESS + path, init);
      if (r.status !== 429 || attempt >= 2) return r;
      onWait?.(RETRY_AFTER_429);
      await sleep(RETRY_AFTER_429);
    }
  };
  const p = queue.then(run, run);
  // the next request waits for this one, body included, whatever happens to it
  queue = p.then((r) => r.clone().arrayBuffer().catch(() => undefined), () => undefined);
  return p;
}

// ---------------------------------------------------------------- studies
/** Study (and chapter) id from a Lichess study address, or a bare 8-character id. */
export function studyRef(input: string): { study: string; chapter?: string } | null {
  const s = input.trim();
  const m = /(?:lichess\.org\/study\/)?([A-Za-z0-9]{8})(?:\/([A-Za-z0-9]{8}))?(?:[/?#].*)?$/.exec(s);
  if (!m || (!s.includes('lichess.org/study/') && s.length !== 8)) return null;
  return { study: m[1], chapter: m[2] };
}

/** A public study's PGN, every chapter (or the one in the address), with each chapter's orientation. */
export async function studyPgn(input: string, onWait?: (ms: number) => void): Promise<string> {
  const ref = studyRef(input);
  if (!ref) throw new Error('That is not a Lichess study address (lichess.org/study/…)');
  const q = 'clocks=false&comments=true&variations=true&orientation=true';
  const r = await lichessFetch(`/api/study/${ref.study}${ref.chapter ? '/' + ref.chapter : ''}.pgn?${q}`, { headers: { Accept: 'application/x-chess-pgn' } }, onWait);
  if (r.status === 404 || r.status === 403) throw new Error('No public study at that address. Private and unlisted studies need a Lichess login, which Ply does not have: make the study public, or export its PGN on Lichess and paste it here.');
  if (r.status === 429) throw new Error('Lichess is busy. Try again in a few minutes.');
  if (!r.ok) throw new Error(`Lichess answered ${r.status}`);
  const text = await r.text();
  if (!text.trim()) throw new Error('That study has no public chapters');
  return text;
}

// ---------------------------------------------------------------- players and games
import type { GameRow } from '../db';
import type { Side } from '../chess';
export interface LichessGame {
  id: string;
  rated: boolean;
  variant: string;
  speed: string; // ultraBullet bullet blitz rapid classical correspondence
  createdAt: number;
  lastMoveAt: number;
  status: string;
  players: { white: { user?: { name: string; id: string }; rating?: number }; black: { user?: { name: string; id: string }; rating?: number } };
  winner?: 'white' | 'black';
  pgn?: string;
}

/** Rapid rating of a Lichess player (null when they have no rapid games). */
export async function lichessRapid(user: string, onWait?: (ms: number) => void): Promise<number | null> {
  const r = await lichessFetch(`/api/user/${encodeURIComponent(user)}`, { headers: { Accept: 'application/json' } }, onWait);
  if (r.status === 404) throw new Error('No Lichess player with that name');
  if (!r.ok) throw new Error(`Lichess answered ${r.status}`);
  const j = (await r.json()) as { disabled?: boolean; perfs?: { rapid?: { rating?: number; games?: number; prov?: boolean } } };
  if (j.disabled) throw new Error('That Lichess account is closed');
  const rapid = j.perfs?.rapid;
  return rapid?.games ? rapid.rating ?? null : null;
}

export interface GameQuery { since?: number; until?: number; rated?: boolean; perfTypes?: string[]; max?: number }

/** Query string for the games export; the PGN comes inside each JSON line. */
export function gamesQuery(q: GameQuery): string {
  const p = new URLSearchParams({ pgnInJson: 'true', clocks: 'false', evals: 'false', opening: 'false', moves: 'true', tags: 'true', finished: 'true' });
  if (q.since) p.set('since', String(q.since));
  if (q.until) p.set('until', String(q.until));
  if (q.rated !== undefined) p.set('rated', String(q.rated));
  if (q.perfTypes?.length) p.set('perfType', q.perfTypes.join(','));
  if (q.max) p.set('max', String(q.max));
  return p.toString();
}

/** Lichess speeds for the time classes in Settings. */
export const SPEEDS: Record<string, string> = { Rapid: 'rapid', Blitz: 'blitz', Daily: 'correspondence', Classical: 'classical', Bullet: 'bullet' };

/** A Lichess game as a stored game: null for other variants and games without the player or moves. */
export function lichessRow(g: LichessGame, user: string): GameRow | null {
  if (g.variant !== 'standard' || !g.pgn) return null;
  const me = user.toLowerCase();
  const colour: Side | null = g.players.white.user?.id === me ? 'w' : g.players.black.user?.id === me ? 'b' : null;
  if (!colour) return null;
  const opp = colour === 'w' ? g.players.black : g.players.white;
  const result = !g.winner ? 'draw' : (g.winner === 'white') === (colour === 'w') ? 'win' : 'loss';
  return {
    url: `${LICHESS}/${g.id}`, pgn: g.pgn, colour, opponent: opp.user?.name ?? 'Anonymous', result, date: g.lastMoveAt || g.createdAt,
    timeClass: g.speed === 'correspondence' ? 'daily' : g.speed, rating: (colour === 'w' ? g.players.white : g.players.black).rating, evals: [], analyzed: 0
  };
}

/** A player's games, newest first, read line by line as Lichess streams them. */
export async function lichessGames(user: string, q: GameQuery, onGame?: (n: number) => void, onWait?: (ms: number) => void): Promise<LichessGame[]> {
  const r = await lichessFetch(`/api/games/user/${encodeURIComponent(user)}?${gamesQuery(q)}`, { headers: { Accept: 'application/x-ndjson' } }, onWait);
  if (r.status === 404) throw new Error('No Lichess player with that name');
  if (r.status === 429) throw new Error('Lichess is busy. Try again in a few minutes.');
  if (!r.ok) throw new Error(`Lichess answered ${r.status}`);
  const out: LichessGame[] = [];
  const take = (line: string) => { if (line.trim()) { out.push(JSON.parse(line)); onGame?.(out.length); } };
  if (!r.body) { (await r.text()).split('\n').forEach(take); return out; }
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += value;
    const lines = buf.split('\n');
    buf = lines.pop()!;
    lines.forEach(take);
  }
  take(buf);
  return out;
}
