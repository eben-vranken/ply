// Dexie version 4: change stamps, tombstones and the migration of existing rows.
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import { PlyDB } from './db';

const V3 = { settings: 'key', repertoire: '[side+epd], side', cards: 'id, type, due, suspended, side, epd', reviews: '++id, cardId, at', games: 'url, date, analyzed', data: 'name', book: '[side+epd], side' };

describe('database version 4 (sync)', () => {
  it('stamps existing rows with updatedAt and the app settings with per-key stamps', async () => {
    const old = new Dexie('mig-v4');
    old.version(3).stores(V3);
    await old.table('settings').put({ key: 'app', value: { band: 1600, theme: 'dark' } });
    await old.table('repertoire').put({ side: 'w', epd: 'x', moves: ['e2e4'] });
    await old.table('reviews').add({ cardId: 'a', at: 5, rating: 3, ms: 1, mode: 'today', stage: 'young' });
    old.close();
    const t0 = Date.now();
    const db = new PlyDB('mig-v4');
    const app = (await db.settings.get('app'))!;
    expect(app.updatedAt).toBeGreaterThanOrEqual(t0);
    expect(Object.keys(app.stamps!)).toEqual(['band', 'theme']);
    expect((await db.repertoire.get(['w', 'x']))!.updatedAt).toBeGreaterThanOrEqual(t0);
    expect(await db.reviews.where('[cardId+at]').equals(['a', 5]).count()).toBe(1);
    db.close();
  });

  it('stamps every write through the app connection, not through the raw one', async () => {
    const db = new PlyDB('hooks');
    const raw = new PlyDB('hooks', false);
    await db.cards.put({ id: 'c', updatedAt: 1 } as never);
    const a = (await db.cards.get('c'))!.updatedAt!;
    expect(a).toBeGreaterThan(1);
    await new Promise((r) => setTimeout(r, 5));
    await db.cards.put({ id: 'c', updatedAt: 1, x: 1 } as never);
    expect((await db.cards.get('c'))!.updatedAt).toBeGreaterThan(a);
    await db.cards.bulkPut([{ id: 'd' } as never, { id: 'c', x: 2 } as never]);
    expect((await db.cards.get('d'))!.updatedAt).toBeGreaterThan(0);
    await db.cards.update('c', { suspended: 1 });
    await db.games.add({ url: 'g' } as never);
    await db.games.where('url').equals('g').modify({ analyzed: 1 } as never);
    expect((await db.games.get('g'))!.updatedAt).toBeGreaterThan(0);
    await raw.cards.put({ id: 'r', updatedAt: 42 } as never);
    expect((await db.cards.get('r'))!.updatedAt).toBe(42);
    db.close(); raw.close();
  });
});
