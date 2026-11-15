// Dexie migrations on an in-memory IndexedDB.
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import { PlyDB } from './db';

const V1 = { settings: 'key', repertoire: '[side+epd], side', cards: 'id, type, due, suspended, side, epd', reviews: '++id, cardId, at', games: 'url, date, analyzed', data: 'name' };

describe('database migrations', () => {
  it("version 2 turns Keep going's 'extra' reviews into Today reviews", async () => {
    const old = new Dexie('mig-extra');
    old.version(1).stores(V1);
    await old.table('reviews').bulkAdd([
      { cardId: 'a', at: 1, rating: 3, ms: 1, mode: 'extra', stage: 'young' },
      { cardId: 'b', at: 2, rating: 1, ms: 1, mode: 'learn', stage: 'new' }
    ]);
    old.close();
    const db = new PlyDB('mig-extra');
    const rows = await db.reviews.orderBy('at').toArray();
    expect(rows.map((r) => r.mode)).toEqual(['today', 'learn']);
    db.close();
  });
});
