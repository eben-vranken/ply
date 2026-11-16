// The game a puzzle comes from. Ply's puzzles are Lichess's (the CC0 puzzle database) and keep
// only the position, so the line before it is fetched from Lichess's public puzzle API when a
// puzzle is shown, to list and browse the whole game from move 1. Only the puzzle id is sent.
// Offline, or if Lichess does not answer, the puzzle simply starts from its position as before.
import { Chess } from 'chess.js';

const cache = new Map<string, Promise<string[] | null>>();
// pieces, side and castling: en passant squares are written differently by different tools
const epd = (fen: string) => fen.split(' ').slice(0, 3).join(' ');

/** The game's moves (UCI) from the start up to the puzzle's position, or null. */
export function puzzleGame(id: string, startFen: string): Promise<string[] | null> {
  let p = cache.get(id);
  if (!p) {
    p = fetchLine(id, startFen).catch(() => null);
    cache.set(id, p);
    // a failure is not remembered: the next time the puzzle comes up, it tries again
    void p.then((r) => { if (!r) cache.delete(id); });
  }
  return p;
}

async function fetchLine(id: string, startFen: string): Promise<string[] | null> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(`https://lichess.org/api/puzzle/${encodeURIComponent(id)}`, { headers: { Accept: 'application/json' }, signal: ctl.signal });
    if (!r.ok) return null;
    const j = (await r.json()) as { game?: { pgn?: string } };
    return lineTo(j.game?.pgn ?? '', startFen);
  } finally {
    clearTimeout(t);
  }
}

/** Replay the game's SAN moves until the puzzle's position; the moves before it, or null if it never comes. */
export function lineTo(pgn: string, startFen: string): string[] | null {
  const want = epd(startFen);
  const c = new Chess();
  const out: string[] = [];
  if (epd(c.fen()) === want) return out;
  for (const san of pgn.trim().split(/\s+/).filter(Boolean)) {
    let m;
    try { m = c.move(san); } catch { return null; }
    out.push(m.from + m.to + (m.promotion ?? ''));
    if (epd(c.fen()) === want) return out;
  }
  return null;
}
