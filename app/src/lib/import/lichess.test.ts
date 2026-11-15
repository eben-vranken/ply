import { describe, it, expect, vi, afterEach } from 'vitest';
import { studyRef, lichessFetch, studyPgn, gamesQuery, lichessGames, RETRY_AFTER_429 } from './lichess';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Lichess study addresses', () => {
  it('reads the study and chapter ids', () => {
    expect(studyRef('https://lichess.org/study/abcd1234')).toEqual({ study: 'abcd1234', chapter: undefined });
    expect(studyRef('lichess.org/study/abcd1234/EFGH5678#12')).toEqual({ study: 'abcd1234', chapter: 'EFGH5678' });
    expect(studyRef('abcd1234')).toEqual({ study: 'abcd1234', chapter: undefined });
    expect(studyRef('https://example.com/abcd1234')).toBe(null);
    expect(studyRef('hello')).toBe(null);
  });
});

describe('requests to Lichess', () => {
  it('waits a minute after 429 and then tries again', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { calls.push(u); return new Response(n++ === 0 ? '' : '[Event "x"]\n\n1. e4 *', { status: n === 1 ? 429 : 200 }); }));
    const waits: number[] = [];
    const p = studyPgn('https://lichess.org/study/abcd1234', (ms) => waits.push(ms));
    await vi.advanceTimersByTimeAsync(RETRY_AFTER_429 - 1);
    expect(calls.length).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toContain('1. e4');
    expect(calls.length).toBe(2);
    expect(waits).toEqual([RETRY_AFTER_429]);
    expect(calls[0]).toBe('https://lichess.org/api/study/abcd1234.pgn?clocks=false&comments=true&variations=true&orientation=true');
  });

  it('sends one request at a time', async () => {
    let open = 0, most = 0;
    vi.stubGlobal('fetch', vi.fn(async () => { open++; most = Math.max(most, open); await new Promise((r) => setTimeout(r, 5)); open--; return new Response('{}'); }));
    await Promise.all([lichessFetch('/a'), lichessFetch('/b'), lichessFetch('/c')]);
    expect(most).toBe(1);
  });

  it('explains a private study', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    await expect(studyPgn('abcd1234')).rejects.toThrow(/public/);
  });

  it('asks for the PGN inside each JSON line and reads the stream', async () => {
    expect(gamesQuery({ since: 5, rated: true, perfTypes: ['rapid', 'blitz'] })).toBe('pgnInJson=true&clocks=false&evals=false&opening=false&moves=true&tags=true&finished=true&since=5&rated=true&perfType=rapid%2Cblitz');
    const lines = [{ id: 'a', pgn: '1. e4 *' }, { id: 'b', pgn: '1. d4 *' }].map((g) => JSON.stringify(g)).join('\n') + '\n';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(lines)));
    const gs = await lichessGames('someone', {});
    expect(gs.map((g) => g.id)).toEqual(['a', 'b']);
  });
});
