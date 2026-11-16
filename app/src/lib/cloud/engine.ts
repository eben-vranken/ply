// The sync engine (docs/DECISIONS.md, "Sync"): pull the rows changed on the server since the
// last sync, merge them in one transaction, push the rows changed here since the last sync,
// then save the cursor. Nothing is written locally until the whole pull has arrived, so a sync
// that fails part way leaves this device as it was; a failed push is simply retried next time.
import type { IndexableType } from 'dexie';
import { SYNCED, rowKey, type PlyDB, type SyncedTable, type TombRow } from '../db';
import { pick, newer, mergeApp, shareableApp, same, type Version, type AppRow } from './merge';

/** Key columns of each server table (supabase/migrations). */
export const KEYS: Record<SyncedTable, string[]> = {
  settings: ['key'], repertoire: ['side', 'epd'], book: ['side', 'epd'], cards: ['id'], reviews: ['card_id', 'at'], games: ['url']
};
export interface ServerRow { [key: string]: unknown; data: Record<string, unknown> | null; updated_at: number; deleted: boolean; seq?: number; synced_at?: string }

/** The server, as the engine needs it. lib/cloud/supabase.ts implements it; tests use a fake. */
export interface Remote {
  /** rows with synced_at after `since` (null: all) and seq after `afterSeq`, by seq, at most `limit` */
  pull(t: SyncedTable, since: string | null, afterSeq: number, limit: number): Promise<ServerRow[]>;
  /** upsert; the server keeps its own row where it is newer */
  push(t: SyncedTable, rows: ServerRow[]): Promise<void>;
}

export interface SyncMeta { user: string; cursors: Partial<Record<SyncedTable, string>>; pushMark: number; lastAt: number }
export type Counts = Partial<Record<SyncedTable, number>>;
export interface SyncResult { pulled: Counts; pushed: Counts; changed: Set<SyncedTable>; first: boolean }

const PAGE = 1000;
/** a write that was in flight when we pulled can show up with a slightly earlier server time */
const OVERLAP_MS = 2 * 60_000;
const BATCH_ROWS = 500, BATCH_BYTES = 1_000_000;

type Row = Record<string, unknown>;

/** A local row as it is stored on the server: the key columns and the row as data. */
export function toServer(t: SyncedTable, r: Row): ServerRow {
  const data: Row = { ...r };
  delete data.updatedAt;
  if (t === 'reviews') delete data.id;
  let body: Row = data;
  if (t === 'settings') body = r.key === 'app' ? shareableApp((r.value ?? {}) as Row, (r.stamps ?? {}) as Record<string, number>) : { value: r.value };
  return { ...keyCols(t, rowKey(t, r)), data: JSON.parse(JSON.stringify(body)), updated_at: (r.updatedAt as number) ?? 0, deleted: false };
}

/** The server key columns from a row key (db.rowKey). */
export function keyCols(t: SyncedTable, k: string): Row {
  switch (t) {
    case 'settings': return { key: k };
    case 'repertoire': case 'book': { const i = k.indexOf('|'); return { side: k.slice(0, i), epd: k.slice(i + 1) }; }
    case 'cards': return { id: k };
    case 'reviews': { const i = k.lastIndexOf('|'); return { card_id: k.slice(0, i), at: Number(k.slice(i + 1)) }; }
    case 'games': return { url: k };
  }
}
function serverKey(t: SyncedTable, s: ServerRow): string {
  switch (t) {
    case 'settings': return s.key as string;
    case 'repertoire': case 'book': return s.side + '|' + s.epd;
    case 'cards': return s.id as string;
    case 'reviews': return s.card_id + '|' + Number(s.at);
    case 'games': return s.url as string;
  }
}

const date = (v: unknown) => (v ? new Date(v as string) : v);
function reviveFsrs(c: Row | null | undefined) { if (c) { c.due = date(c.due); if (c.last_review) c.last_review = date(c.last_review); } }

/** A server row as a local row (FSRS dates back to Dates). */
export function fromServer(t: SyncedTable, s: ServerRow): Row {
  const k = keyCols(t, serverKey(t, s));
  const d = structuredClone(s.data ?? {}) as Row;
  let r: Row;
  if (t === 'settings') r = s.key === 'app' ? { key: 'app', value: d.value ?? {}, stamps: d.stamps ?? {} } : { key: s.key, value: d.value };
  else if (t === 'reviews') r = { ...d, cardId: k.card_id, at: k.at };
  else r = { ...d, ...k };
  if (t === 'cards') reviveFsrs(r.fsrs as Row);
  if (t === 'reviews') reviveFsrs(r.prev as Row);
  r.updatedAt = s.updated_at;
  return r;
}

const strip = (t: SyncedTable, r: Row): Row => toServer(t, r).data!;

async function localRow(db: PlyDB, t: SyncedTable, k: string): Promise<Row | undefined> {
  const kc = keyCols(t, k);
  switch (t) {
    case 'settings': return db.settings.get(k) as Promise<Row | undefined>;
    case 'repertoire': return db.repertoire.get([kc.side as 'w', kc.epd as string]) as Promise<Row | undefined>;
    case 'book': return db.book.get([kc.side as 'w', kc.epd as string]) as Promise<Row | undefined>;
    case 'cards': return db.cards.get(k) as Promise<Row | undefined>;
    case 'reviews': return db.reviews.where('[cardId+at]').equals([kc.card_id as string, kc.at as number]).first() as Promise<Row | undefined>;
    case 'games': return db.games.get(k) as Promise<Row | undefined>;
  }
}
function primaryKey(t: SyncedTable, r: Row): IndexableType {
  switch (t) {
    case 'settings': return r.key as string;
    case 'repertoire': case 'book': return [r.side as string, r.epd as string];
    case 'cards': return r.id as string;
    case 'reviews': return r.id as number;
    case 'games': return r.url as string;
  }
}

/**
 * One sync. `raw` is the untracked connection (db.rawDb), so rows keep the time they were changed.
 * `push: false` only pulls: a device that has not finished onboarding looks for the account's
 * progress but sends nothing, so its provisional defaults never reach the account; everything
 * goes up with its first push.
 */
export async function syncOnce(remote: Remote, raw: PlyDB, user: string, now: () => number = Date.now, push = true): Promise<SyncResult> {
  const stored = (await raw.meta.get('sync'))?.value as SyncMeta | undefined;
  const first = !stored || stored.user !== user;
  const meta: SyncMeta = first ? { user, cursors: {}, pushMark: -Infinity, lastAt: 0 } : structuredClone(stored);

  // 1. pull everything first
  const incoming = new Map<SyncedTable, ServerRow[]>();
  const cursors = { ...meta.cursors };
  for (const t of SYNCED) {
    const rows: ServerRow[] = [];
    let after = 0;
    for (;;) {
      const page = await remote.pull(t, meta.cursors[t] ?? null, after, PAGE);
      rows.push(...page);
      if (page.length < PAGE) break;
      after = Number(page[page.length - 1].seq);
    }
    incoming.set(t, rows);
    const latest = rows.reduce((m, r) => Math.max(m, r.synced_at ? +new Date(r.synced_at) : 0), 0);
    if (latest) cursors[t] = new Date(Math.max(latest - OVERLAP_MS, cursors[t] ? +new Date(cursors[t]!) : 0)).toISOString();
  }

  // 2. merge in one transaction
  const pulled: Counts = {};
  const changed = new Set<SyncedTable>();
  await raw.transaction('rw', [...SYNCED.map((t) => raw.table(t)), raw.tomb], async () => {
    for (const t of SYNCED) for (const s of incoming.get(t)!) {
      const k = serverKey(t, s);
      const live = await localRow(raw, t, k);
      const tomb = await raw.tomb.get([t, k]);
      const remoteV: Version = { updatedAt: s.updated_at, deleted: s.deleted, data: s.data };
      const useLive = live && (!tomb || ((live.updatedAt as number) ?? 0) >= tomb.at);
      const localV: Version | undefined = useLive ? { updatedAt: (live!.updatedAt as number) ?? 0, deleted: false, data: strip(t, live!) } : tomb ? { updatedAt: tomb.at, deleted: true, data: null } : undefined;
      const table = raw.table(t);
      // the settings row merges one setting at a time
      if (t === 'settings' && k === 'app' && useLive && !s.deleted && s.data) {
        const r = fromServer(t, s);
        const base: AppRow = { value: (live!.value ?? {}) as Row, stamps: (live!.stamps ?? {}) as Record<string, number>, updatedAt: (live!.updatedAt as number) ?? 0 };
        const merged = mergeApp(base, r as unknown as AppRow, true);
        if (!same(merged.value, live!.value) || !same(merged.stamps, live!.stamps)) {
          await table.put({ ...live, value: merged.value, stamps: merged.stamps, updatedAt: merged.updatedAt });
          if (!same(merged.value, live!.value)) { pulled[t] = (pulled[t] ?? 0) + 1; changed.add(t); }
        }
        continue;
      }
      if (pick(t, localV, remoteV) === 'local') continue;
      if (s.deleted) {
        if (live) { await table.delete(primaryKey(t, live)); pulled[t] = (pulled[t] ?? 0) + 1; changed.add(t); }
        if (!tomb || tomb.at !== s.updated_at) await raw.tomb.put({ t, k, at: s.updated_at });
        continue;
      }
      const r = fromServer(t, s);
      if (t === 'reviews' && live) r.id = live.id;
      const differs = !localV || localV.deleted || !same(localV.data, strip(t, r));
      if (differs || localV!.updatedAt !== s.updated_at) await table.put(r);
      if (tomb) await raw.tomb.delete([t, k]);
      if (differs) { pulled[t] = (pulled[t] ?? 0) + 1; changed.add(t); }
    }
  });

  // 3. push what changed here since the last push
  const start = now();
  const pushed: Counts = {};
  if (push) for (const t of SYNCED) {
    const table = raw.table(t);
    const rows = (first ? await table.toArray() : await table.where('updatedAt').aboveOrEqual(meta.pushMark).toArray()) as Row[];
    const out = rows.map((r) => toServer(t, r));
    const liveKeys = new Map(rows.map((r) => [rowKey(t, r), (r.updatedAt as number) ?? 0]));
    const tombs = (await raw.tomb.where('[t+k]').between([t, ''], [t, '￿']).toArray()).filter((x) => first || x.at >= meta.pushMark);
    const stale: TombRow[] = [];
    // a row written again after it was deleted: its tombstone has had its day
    const shadowed = rows.length ? (await raw.tomb.bulkGet(rows.map((r) => [t, rowKey(t, r)] as [string, string]))).filter((x): x is TombRow => !!x && (liveKeys.get(x.k) ?? -1) >= x.at) : [];
    stale.push(...shadowed);
    const gone = new Set(shadowed.map((x) => x.k));
    for (const x of tombs) {
      if (gone.has(x.k)) continue;
      const lu = liveKeys.get(x.k) ?? ((await localRow(raw, t, x.k))?.updatedAt as number | undefined);
      if (lu !== undefined && lu >= x.at) { stale.push(x); continue; }
      out.push({ ...keyCols(t, x.k), data: null, updated_at: x.at, deleted: true });
    }
    if (stale.length) await raw.tomb.bulkDelete(stale.map((x) => [x.t, x.k] as [string, string]));
    for (const batch of batches(out)) await remote.push(t, batch);
    if (out.length) pushed[t] = out.length;
  }

  // 4. the cursor
  meta.cursors = cursors;
  if (push) meta.pushMark = start;
  meta.lastAt = now();
  await raw.meta.put({ key: 'sync', value: meta });
  return { pulled, pushed, changed, first };
}

function batches(rows: ServerRow[]): ServerRow[][] {
  const out: ServerRow[][] = [];
  let cur: ServerRow[] = [], bytes = 0;
  for (const r of rows) {
    const n = JSON.stringify(r.data ?? null).length;
    if (cur.length && (cur.length >= BATCH_ROWS || bytes + n > BATCH_BYTES)) { out.push(cur); cur = []; bytes = 0; }
    cur.push(r); bytes += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** The server's rules (supabase/migrations) in memory: for tests and the two-device check. */
export class MemoryRemote implements Remote {
  rows = new Map<string, ServerRow & { seq: number; synced_at: string }>();
  private seq = 0;
  /** server clock; tests may move it */
  clock = () => Date.now();
  fail: null | 'pull' | 'push' = null;
  async pull(t: SyncedTable, since: string | null, afterSeq: number, limit: number) {
    if (this.fail === 'pull') throw new Error('network down');
    return [...this.rows.entries()].filter(([id, r]) => id.startsWith(t + '/') && r.seq > afterSeq && (!since || r.synced_at > since))
      .map(([, r]) => structuredClone(r)).sort((a, b) => a.seq - b.seq).slice(0, limit);
  }
  async push(t: SyncedTable, rows: ServerRow[]) {
    if (this.fail === 'push') throw new Error('network down');
    for (const raw of rows) {
      const n = JSON.parse(JSON.stringify(raw)) as ServerRow;
      const id = t + '/' + serverKey(t, n);
      const old = this.rows.get(id);
      let next: ServerRow = n;
      if (old) {
        if (t === 'settings' && n.key === 'app' && !n.deleted && !old.deleted && n.data && old.data) {
          const m = mergeApp({ ...(old.data as unknown as AppRow), updatedAt: old.updated_at }, { ...(n.data as unknown as AppRow), updatedAt: n.updated_at }, false);
          if (same(m.value, (old.data as Row).value) && same(m.stamps, (old.data as Row).stamps)) continue;
          next = { ...n, data: { value: m.value, stamps: m.stamps }, updated_at: m.updatedAt };
        } else if (!newer(t, { updatedAt: old.updated_at, deleted: old.deleted, data: old.data }, { updatedAt: n.updated_at, deleted: n.deleted, data: n.data })) continue;
      }
      this.rows.set(id, { ...next, seq: ++this.seq, synced_at: new Date(this.clock()).toISOString() });
    }
  }
}
