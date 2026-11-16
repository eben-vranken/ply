import { describe, it, expect } from 'vitest';
import { newer, pick, mergeApp, shareableApp, restamp, same, type Version } from './merge';

const v = (updatedAt: number, data: Record<string, unknown> | null = {}, deleted = false): Version => ({ updatedAt, data, deleted });
const card = (updatedAt: number, lr?: string) => v(updatedAt, { fsrs: { last_review: lr } });

describe('merge rules', () => {
  it('last updatedAt wins for repertoire, book, games, reviews and settings rows', () => {
    for (const t of ['repertoire', 'book', 'games', 'reviews', 'settings'] as const) {
      expect(pick(t, v(10), v(20))).toBe('remote');
      expect(pick(t, v(30), v(20))).toBe('local');
    }
  });
  it('a tie goes to the server, so every device ends up the same', () => {
    expect(pick('repertoire', v(10, { a: 1 }), v(10, { a: 2 }))).toBe('remote');
    expect(newer('repertoire', v(10), v(10))).toBe(false);
  });
  it('nothing local takes the remote row', () => expect(pick('cards', undefined, v(1))).toBe('remote'));
  it('cards keep the later FSRS review, whatever updatedAt says', () => {
    expect(pick('cards', card(100, '2026-11-10T10:00:00Z'), card(5, '2026-11-11T10:00:00Z'))).toBe('remote');
    expect(pick('cards', card(5, '2026-11-11T10:00:00Z'), card(100, '2026-11-10T10:00:00Z'))).toBe('local');
    // Dates and ISO strings compare by time
    expect(pick('cards', v(1, { fsrs: { last_review: new Date('2026-11-12T00:00:00Z') } }), card(9, '2026-11-11T00:00:00Z'))).toBe('local');
  });
  it('cards with the same review (or none) fall back to updatedAt', () => {
    expect(pick('cards', card(10, '2026-11-10T10:00:00Z'), card(20, '2026-11-10T10:00:00Z'))).toBe('remote');
    expect(pick('cards', card(20), card(10))).toBe('local');
    expect(pick('cards', card(10), card(20, '2026-11-10T10:00:00Z'))).toBe('remote');
  });
  it('a deletion beats older edits and loses to later ones', () => {
    for (const t of ['cards', 'repertoire', 'reviews', 'games'] as const) {
      expect(pick(t, v(10), v(20, null, true))).toBe('remote');
      expect(pick(t, v(30), v(20, null, true))).toBe('local');
      expect(pick(t, v(10, null, true), v(20))).toBe('remote');
    }
    // a card reviewed after it was deleted elsewhere comes back
    expect(pick('cards', v(10, null, true), card(20, '2026-11-01T00:00:00Z'))).toBe('remote');
    // even a later review does not beat a deletion made after it
    expect(pick('cards', v(30, null, true), card(20, '2026-12-01T00:00:00Z'))).toBe('local');
  });
});

describe('settings merge', () => {
  const row = (value: Record<string, unknown>, stamps: Record<string, number>, updatedAt = 1) => ({ value, stamps, updatedAt });
  it('merges one setting at a time by its stamp', () => {
    const m = mergeApp(row({ band: 1600, goal: 100 }, { band: 20, goal: 5 }), row({ band: 1200, goal: 50, depth: 8 }, { band: 10, goal: 15, depth: 0 }, 9), true);
    expect(m.value).toEqual({ band: 1600, goal: 50, depth: 8 });
    expect(m.stamps).toEqual({ band: 20, goal: 15, depth: 0 });
    expect(m.updatedAt).toBe(9);
  });
  it('device-only settings never come from another device', () => {
    const m = mergeApp(row({ theme: 'dark', sounds: false, tips: ['a'] }, { theme: 1 }), row({ theme: 'light', sounds: true, vibration: false, storageNoteSeen: true, tips: [] }, { theme: 99, sounds: 99, vibration: 99, storageNoteSeen: 99, tips: 99 }), true);
    expect(m.value).toEqual({ theme: 'dark', sounds: false, tips: ['a'] });
  });
  it('ties go to the other side only when asked (server copy on a device)', () => {
    expect(mergeApp(row({ a: 1 }, { a: 5 }), row({ a: 2 }, { a: 5 }), true).value.a).toBe(2);
    expect(mergeApp(row({ a: 1 }, { a: 5 }), row({ a: 2 }, { a: 5 }), false).value.a).toBe(1);
  });
  it('pushes no device-only settings', () => {
    const s = shareableApp({ theme: 'dark', band: 1400, sounds: true }, { band: 3 });
    expect(s).toEqual({ value: { band: 1400 }, stamps: { band: 3 } });
  });
  it('stamps changed settings with now, onboarding choices and new defaults with 0', () => {
    const d = { band: 0, goal: 100, xp: 0 };
    expect(restamp({ band: 0, goal: 100 }, { band: 4, goal: 4 }, { band: 1600, goal: 100 }, 50, false, d)).toEqual({ stamps: { band: 50, goal: 4 }, changed: true });
    expect(restamp({}, {}, { band: 1600, goal: 100 }, 50, true, d).stamps).toEqual({ band: 0, goal: 0 });
    expect(restamp({ band: 0 }, { band: 4 }, { band: 0, xp: 0 }, 50, false, d).stamps).toEqual({ band: 4, xp: 0 });
    expect(restamp({ band: 0 }, { band: 4 }, { band: 0 }, 50, false, d).changed).toBe(false);
  });
  it('compares rows by content', () => {
    expect(same({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(same({ d: new Date('2026-01-01T00:00:00Z') }, { d: '2026-01-01T00:00:00.000Z' })).toBe(true);
    expect(same({ a: undefined }, {})).toBe(true);
    expect(same({ a: 1 }, { a: 2 })).toBe(false);
  });
});
