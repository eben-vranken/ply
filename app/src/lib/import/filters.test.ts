import { describe, it, expect } from 'vitest';
import { keepGame, lichessPerfs, monthInRange, fromMs, toMs, type GameFilters } from './filters';

const f = (x: Partial<GameFilters> = {}): GameFilters => ({ rated: 'rated', classes: ['Rapid'], from: '', to: '', ...x });
const at = (d: string) => new Date(d).getTime();

describe('game filters', () => {
  it('rated, casual or both', () => {
    const g = { rated: false, timeClass: 'rapid', date: 1 };
    expect(keepGame(g, f())).toBe(false);
    expect(keepGame(g, f({ rated: 'casual' }))).toBe(true);
    expect(keepGame({ ...g, rated: true }, f({ rated: 'casual' }))).toBe(false);
    expect(keepGame(g, f({ rated: 'both' }))).toBe(true);
  });
  it('time controls from either site', () => {
    expect(keepGame({ rated: true, timeClass: 'correspondence', date: 1 }, f({ classes: ['Daily'] }))).toBe(true);
    expect(keepGame({ rated: true, timeClass: 'daily', date: 1 }, f({ classes: ['Daily'] }))).toBe(true);
    expect(keepGame({ rated: true, timeClass: 'classical', date: 1 }, f({ classes: ['Rapid'] }))).toBe(false);
    expect(lichessPerfs(['Bullet', 'Daily', 'Classical'])).toEqual(['bullet', 'ultraBullet', 'correspondence', 'classical']);
  });
  it('a date range with both days included', () => {
    const r = f({ from: '2026-10-01', to: '2026-10-31' });
    expect(keepGame({ rated: true, timeClass: 'rapid', date: at('2026-10-01T00:00:00') }, r)).toBe(true);
    expect(keepGame({ rated: true, timeClass: 'rapid', date: at('2026-10-31T23:59:00') }, r)).toBe(true);
    expect(keepGame({ rated: true, timeClass: 'rapid', date: at('2026-11-01T00:00:01') }, r)).toBe(false);
    expect(keepGame({ rated: true, timeClass: 'rapid', date: at('2026-09-30T23:00:00') }, r)).toBe(false);
    expect(fromMs('')).toBe(0);
    expect(toMs('')).toBe(Infinity);
  });
  it('chess.com months that can hold games in the range', () => {
    const r = f({ from: '2026-09-15', to: '2026-10-02' });
    expect(['2026/08', '2026/09', '2026/10', '2026/11'].map((m) => monthInRange(m, r))).toEqual([false, true, true, false]);
    expect(monthInRange('2020/01', f())).toBe(true);
  });
});
