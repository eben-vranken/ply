// The sync engine with two devices (two IndexedDBs) and the server's rules in memory.
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { PlyDB, SYNCED, rowKey, type CardRow, type ReviewRow } from '../db';
import { syncOnce, MemoryRemote, toServer, type ServerRow } from './engine';

let n = 0;
function device() {
  const name = 'dev' + ++n;
  return { db: new PlyDB(name), raw: new PlyDB(name, false) };
}
type Dev = ReturnType<typeof device>;
const sync = (d: Dev, r: MemoryRemote, user = 'u1') => syncOnce(r, d.raw, user);
/** everything a device holds, as the server would store it */
async function state(d: Dev) {
  const out: Record<string, Record<string, unknown>> = {};
  for (const t of SYNCED) {
    out[t] = {};
    for (const r of (await d.raw.table(t).toArray()) as Record<string, unknown>[]) {
      const s = toServer(t, r);
      out[t][rowKey(t, r)] = { data: s.data, at: s.updated_at };
    }
  }
  return out;
}
const fsrs = (lr?: string) => ({ due: new Date('2026-12-01T00:00:00Z'), stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 1, learning_steps: 0, reps: lr ? 1 : 0, lapses: 0, state: lr ? 2 : 0, ...(lr ? { last_review: new Date(lr) } : {}) });
const card = (id: string, lr?: string, extra: Partial<CardRow> = {}) => ({ id, type: 'move', side: 'w', epd: 'e' + id, move: 'e2e4', answer: [], line: [], label: 'x', fsrs: fsrs(lr), due: 0, suspended: 0, created: 1, lapses: 0, ...extra }) as unknown as CardRow;
const review = (cardId: string, at: number): ReviewRow => ({ cardId, at, rating: 3, ms: 1000, mode: 'today', stage: 'young', prev: fsrs() as never });
const tick = () => new Promise((r) => setTimeout(r, 3));

describe('sync engine', () => {
  it('a device with data fills an empty account, and a new device gets all of it', async () => {
    const server = new MemoryRemote();
    const a = device(), b = device();
    await a.db.cards.bulkPut([card('c1', '2026-11-10T10:00:00Z'), card('c2')]);
    await a.db.reviews.bulkAdd([review('c1', 1000), review('c1', 2000)]);
    await a.db.repertoire.put({ side: 'w', epd: 'start', moves: ['d2d4'], note: 'mine' });
    await a.db.settings.put({ key: 'app', value: { band: 1600, theme: 'dark' }, stamps: { band: 5, theme: 5 } });
    const ra = await sync(a, server);
    expect(ra.first).toBe(true);
    expect(ra.pushed).toMatchObject({ cards: 2, reviews: 2, repertoire: 1, settings: 1 });
    const rb = await sync(b, server);
    expect(rb.pulled).toMatchObject({ cards: 2, reviews: 2, repertoire: 1, settings: 1 });
    expect(await state(b)).toEqual(await state(a));
    // Dates come back as Dates
    const c = (await b.db.cards.get('c1'))!;
    expect(c.fsrs.last_review).toBeInstanceOf(Date);
    expect((await b.db.reviews.toArray())[0].prev!.due).toBeInstanceOf(Date);
    // device-only settings stay behind
    expect((await b.db.settings.get('app'))!.value).toEqual({ band: 1600 });
  });

  it('two devices train offline, then sync: both end up identical and nothing is lost', async () => {
    const server = new MemoryRemote();
    const a = device(), b = device();
    await a.db.cards.bulkPut([card('c1', '2026-11-01T00:00:00Z'), card('c2', '2026-11-01T00:00:00Z')]);
    await sync(a, server); await sync(b, server);
    // offline: A reviews c1 and adds c3; B reviews c2 later, edits c1 without a review, and adds c4
    await a.db.cards.put(card('c1', '2026-11-05T00:00:00Z', { lapses: 1 }));
    await a.db.reviews.add(review('c1', 5000));
    await a.db.cards.put(card('c3', '2026-11-05T00:00:00Z'));
    await tick();
    await b.db.cards.put(card('c2', '2026-11-06T00:00:00Z'));
    await b.db.reviews.add(review('c2', 6000));
    await b.db.cards.put(card('c1', '2026-11-01T00:00:00Z', { suspended: 1 })); // later updatedAt, older review
    await b.db.cards.put(card('c4'));
    await sync(a, server); await sync(b, server); await sync(a, server);
    const sa = await state(a), sb = await state(b);
    expect(sb).toEqual(sa);
    expect(Object.keys(sa.cards).sort()).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(Object.keys(sa.reviews).sort()).toEqual(['c1|5000', 'c2|6000']);
    // c1: A's review beats B's later edit without a review
    expect((await b.db.cards.get('c1'))!.lapses).toBe(1);
    expect((await b.db.cards.get('c1'))!.suspended).toBe(0);
    expect(+(await a.db.cards.get('c2'))!.fsrs.last_review!).toBe(+new Date('2026-11-06T00:00:00Z'));
  });

  it('repertoire: the later edit wins; deletions sync and beat older edits', async () => {
    const server = new MemoryRemote();
    const a = device(), b = device();
    await a.db.repertoire.bulkPut([{ side: 'w', epd: 'p1', moves: ['e2e4'] }, { side: 'w', epd: 'p2', moves: ['g1f3'] }, { side: 'b', epd: 'p3', moves: ['e7e5'] }]);
    await sync(a, server); await sync(b, server);
    await b.db.repertoire.put({ side: 'w', epd: 'p1', moves: ['d2d4'] });
    await tick();
    await a.db.repertoire.put({ side: 'w', epd: 'p1', moves: ['c2c4'] }); // later: wins
    await a.db.repertoire.put({ side: 'w', epd: 'p2', moves: ['b1c3'] }); // older than B's deletion
    await tick();
    await b.db.transaction('rw', [b.db.repertoire, b.db.tomb], async () => {
      await b.db.tomb.put({ t: 'repertoire', k: 'w|p2', at: Date.now() });
      await b.db.repertoire.delete(['w', 'p2']);
    });
    await sync(a, server); await sync(b, server); await sync(a, server);
    expect((await a.db.repertoire.get(['w', 'p1']))!.moves).toEqual(['c2c4']);
    expect((await b.db.repertoire.get(['w', 'p1']))!.moves).toEqual(['c2c4']);
    expect(await a.db.repertoire.get(['w', 'p2'])).toBeUndefined();
    expect(await b.db.repertoire.get(['w', 'p2'])).toBeUndefined();
    expect(await state(a)).toEqual(await state(b));
    // a row added again after its deletion comes back everywhere
    await tick();
    await a.db.repertoire.put({ side: 'w', epd: 'p2', moves: ['e2e4'] });
    await sync(a, server); await sync(b, server);
    expect((await b.db.repertoire.get(['w', 'p2']))!.moves).toEqual(['e2e4']);
    expect(await a.db.tomb.count()).toBe(0);
  });

  it('an undone review (deleted) stays deleted on every device', async () => {
    const server = new MemoryRemote();
    const a = device(), b = device();
    const id = await a.db.reviews.add(review('c1', 7000));
    await sync(a, server); await sync(b, server);
    expect(await b.db.reviews.count()).toBe(1);
    await a.db.transaction('rw', [a.db.reviews, a.db.tomb], async () => { await a.db.tomb.put({ t: 'reviews', k: 'c1|7000', at: Date.now() }); await a.db.reviews.delete(id); });
    await sync(a, server); await sync(b, server);
    expect(await b.db.reviews.count()).toBe(0);
  });

  it('settings merge per key; device-only settings stay on their device', async () => {
    const server = new MemoryRemote();
    const a = device(), b = device();
    await a.db.settings.put({ key: 'app', value: { band: 1200, goal: 100, theme: 'dark' }, stamps: { band: 1, goal: 1, theme: 1 } });
    await sync(a, server); await sync(b, server);
    const bApp = (await b.db.settings.get('app'))!;
    await b.db.settings.put({ ...bApp, value: { ...(bApp.value as object), goal: 200, theme: 'light' }, stamps: { ...bApp.stamps, goal: 20, theme: 20 } });
    await a.db.settings.put({ key: 'app', value: { band: 1600, goal: 100, theme: 'dark' }, stamps: { band: 10, goal: 1, theme: 1 } });
    await sync(b, server); await sync(a, server); await sync(b, server);
    expect((await a.db.settings.get('app'))!.value).toEqual({ band: 1600, goal: 200, theme: 'dark' });
    expect((await b.db.settings.get('app'))!.value).toEqual({ band: 1600, goal: 200, theme: 'light' });
  });

  it("a new device's onboarding defaults (updatedAt 0) never replace an account's data", async () => {
    const server = new MemoryRemote();
    const phone = device(), laptop = device();
    await phone.db.repertoire.put({ side: 'w', epd: 'start', moves: ['d2d4'] });
    await phone.db.settings.put({ key: 'app', value: { onboarded: true, white: 'London System' }, stamps: { onboarded: 3, white: 3 } });
    await sync(phone, server);
    await laptop.raw.repertoire.put({ side: 'w', epd: 'start', moves: ['e2e4'], updatedAt: 0 });
    await laptop.raw.repertoire.put({ side: 'w', epd: 'italian', moves: ['f1c4'], updatedAt: 0 });
    await laptop.raw.settings.put({ key: 'app', value: { onboarded: false, white: 'Italian Game', theme: 'dark' }, stamps: { onboarded: 0, white: 0, theme: 0 }, updatedAt: 0 });
    const r = await sync(laptop, server);
    expect(r.pulled.repertoire).toBe(1);
    expect((await laptop.db.repertoire.get(['w', 'start']))!.moves).toEqual(['d2d4']);
    expect((await laptop.db.settings.get('app'))!.value).toEqual({ onboarded: true, white: 'London System', theme: 'dark' });
    await sync(phone, server);
    expect((await phone.db.repertoire.get(['w', 'start']))!.moves).toEqual(['d2d4']);
    expect((await phone.db.settings.get('app'))!.value).toMatchObject({ onboarded: true, white: 'London System' });
  });

  it('a failed pull or push leaves the device as it was, and the next sync catches up', async () => {
    const server = new MemoryRemote();
    const a = device(), b = device();
    await a.db.cards.put(card('c1', '2026-11-01T00:00:00Z'));
    await sync(a, server);
    await b.db.cards.put(card('c9'));
    const before = await state(b);
    server.fail = 'pull';
    await expect(sync(b, server)).rejects.toThrow();
    expect(await state(b)).toEqual(before);
    server.fail = 'push';
    await expect(sync(b, server)).rejects.toThrow();
    expect(Object.keys((await state(b)).cards).sort()).toEqual(['c1', 'c9']); // the pull merged; nothing lost
    expect(await b.raw.meta.get('sync')).toBeUndefined(); // cursor not saved
    server.fail = null;
    await sync(b, server); await sync(a, server);
    expect(await state(a)).toEqual(await state(b));
  });

  it('pulls in pages and pushes in batches', async () => {
    const server = new MemoryRemote();
    const a = device(), b = device();
    await a.db.reviews.bulkAdd(Array.from({ length: 2600 }, (_, i) => review('c' + (i % 40), i)));
    const ra = await sync(a, server);
    expect(ra.pushed.reviews).toBe(2600);
    const rb = await sync(b, server);
    expect(rb.pulled.reviews).toBe(2600);
    expect(await b.db.reviews.count()).toBe(2600);
    // a second sync pulls nothing new and pushes only what changed
    await b.db.reviews.add(review('new', 99999));
    const again = await sync(b, server);
    expect(again.pulled.reviews ?? 0).toBe(0);
    expect(again.pushed.reviews).toBe(1);
  });

  it('a write the server stamped slightly before the cursor is still pulled', async () => {
    const server = new MemoryRemote();
    const a = device(), b = device();
    await a.db.cards.put(card('c1'));
    await sync(a, server); await sync(b, server);
    // a write that was in flight: stored after B's pull, with a server time a minute earlier
    const t = Date.now();
    server.clock = () => t - 60_000;
    await server.push('cards', [{ id: 'late', data: { ...JSON.parse(JSON.stringify(card('late'))) }, updated_at: t, deleted: false } as ServerRow]);
    server.clock = () => Date.now();
    await sync(b, server);
    expect(await b.db.cards.get('late')).toBeDefined();
  });

  it('a stale push never overwrites newer server data', async () => {
    const server = new MemoryRemote();
    const a = device(), b = device();
    await a.db.games.put({ url: 'g1', pgn: 'old', colour: 'w', opponent: 'x', result: 'win', date: 1, timeClass: 'rapid', evals: [], analyzed: 0 });
    await sync(a, server); await sync(b, server);
    await b.db.games.update('g1', { analyzed: 1, pgn: 'new' });
    await sync(b, server);
    // A pushes its older copy again (as after a reinstall with the same cursor)
    const old = (await a.db.games.get('g1'))!;
    await server.push('games', [toServer('games', old as never)]);
    await sync(a, server);
    expect((await a.db.games.get('g1'))!.pgn).toBe('new');
  });

  it('before onboarding a device only pulls; its choices go up with the first push', async () => {
    const server = new MemoryRemote();
    const a = device();
    // boot wrote defaults, then the login sync ran before onboarding
    await a.raw.settings.put({ key: 'app', value: { onboarded: false, white: 'Italian Game' }, stamps: { onboarded: 0, white: 0 }, updatedAt: 0 });
    await a.raw.repertoire.put({ side: 'w', epd: 'start', moves: ['e2e4'], updatedAt: 0 });
    const r = await syncOnce(server, a.raw, 'u1', Date.now, false);
    expect(r.pushed).toEqual({});
    expect(server.rows.size).toBe(0);
    // onboarding: other choices, still stamped 0
    await a.raw.settings.put({ key: 'app', value: { onboarded: true, white: 'London System' }, stamps: { onboarded: 0, white: 0 }, updatedAt: 0 });
    await a.raw.repertoire.put({ side: 'w', epd: 'start', moves: ['d2d4'], updatedAt: 0 });
    await sync(a, server); await sync(a, server);
    expect((await a.db.settings.get('app'))!.value).toEqual({ onboarded: true, white: 'London System' });
    expect((await a.db.repertoire.get(['w', 'start']))!.moves).toEqual(['d2d4']);
    const b = device();
    await sync(b, server);
    expect((await b.db.settings.get('app'))!.value).toEqual({ onboarded: true, white: 'London System' });
  });

  it('another account on the same device syncs from scratch', async () => {
    const server = new MemoryRemote();
    const a = device();
    await a.db.cards.put(card('c1'));
    await sync(a, server, 'u1');
    const r = await sync(a, server, 'u2');
    expect(r.first).toBe(true);
    expect(r.pushed.cards).toBe(1);
  });
});
