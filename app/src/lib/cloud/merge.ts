// Merge rules for sync (docs/DECISIONS.md, "Sync"). Pure functions; the server applies the
// same rules in its triggers (supabase/migrations), so both sides keep the same version.
//
// - reviews: append-only; one row per (card, time), so the union of every device's log
// - cards: the version with the later FSRS last_review, then the later updatedAt
// - everything else: the later updatedAt
// - a deletion is a version with deleted = true, compared by updatedAt only: it beats older
//   edits, and an edit made after it beats it
// - the "app" settings row merges one setting at a time by its per-key stamps; device-only
//   settings never leave the device
// - a tie keeps the server's version, so every device ends up with the same one
import type { SyncedTable } from '../db';

export interface Version {
  updatedAt: number;
  deleted: boolean;
  /** the row (without updatedAt); null for a deletion */
  data: Record<string, unknown> | null;
}

/** Settings that belong to one device: never pushed, never taken from another device. */
export const DEVICE_ONLY = ['theme', 'sounds', 'vibration', 'storageNoteSeen', 'tips'] as const;
const deviceOnly = new Set<string>(DEVICE_ONLY);

const lastReview = (v: Version): number => {
  const lr = (v.data?.fsrs as { last_review?: string | Date } | undefined)?.last_review;
  return lr ? +new Date(lr) : -Infinity;
};

/** Is `b` newer than `a` by the table's rule? Equal is not newer. */
export function newer(t: SyncedTable, a: Version, b: Version): boolean {
  if (t === 'cards' && !a.deleted && !b.deleted) {
    const la = lastReview(a), lb = lastReview(b);
    if (lb !== la) return lb > la;
  }
  return b.updatedAt > a.updatedAt;
}

/** The version a device keeps when the server sends `remote`. A tie goes to the server. */
export function pick(t: SyncedTable, local: Version | undefined, remote: Version): 'local' | 'remote' {
  if (!local) return 'remote';
  return newer(t, remote, local) ? 'local' : 'remote';
}

export interface AppRow { value: Record<string, unknown>; stamps: Record<string, number>; updatedAt: number }

/**
 * Merge the "app" settings row one key at a time. A key comes from `other` when its stamp is
 * later (or equal, when `otherWinsTies`: the server's copy on a device). A key `base` lacks is
 * always taken. Device-only keys stay as they are in `base`.
 */
export function mergeApp(base: AppRow, other: AppRow, otherWinsTies: boolean): AppRow {
  const value = { ...base.value }, stamps = { ...base.stamps };
  for (const [k, v] of Object.entries(other.value)) {
    if (deviceOnly.has(k)) continue;
    const so = other.stamps[k] ?? 0;
    const sb = k in base.value ? (base.stamps[k] ?? 0) : -1;
    if (so > sb || (otherWinsTies && so === sb)) { value[k] = v; stamps[k] = so; }
  }
  return { value, stamps, updatedAt: Math.max(base.updatedAt, other.updatedAt) };
}

/** The "app" row as it is pushed: without the device-only settings. */
export function shareableApp(value: Record<string, unknown>, stamps: Record<string, number>) {
  const v: Record<string, unknown> = {}, s: Record<string, number> = {};
  for (const k of Object.keys(value)) if (!deviceOnly.has(k)) { v[k] = value[k]; s[k] = stamps[k] ?? 0; }
  return { value: v, stamps: s };
}

/**
 * Stamps for a settings save: keys whose value changed get `now`. During onboarding (`fresh`)
 * and for a key that only appears with its default value, the stamp is 0, so choices made on a
 * new device never override the settings of a device that is already in use. After Reset all
 * progress, `zero` is just after the reset, so the new defaults outlive the reset's deletions.
 */
export function restamp(prev: Record<string, unknown>, prevStamps: Record<string, number>, next: Record<string, unknown>, now: number, fresh: boolean, defaults: Record<string, unknown>, zero = 0): { stamps: Record<string, number>; changed: boolean } {
  const stamps = { ...prevStamps };
  let changed = false;
  for (const k of Object.keys(next)) {
    if (k in prev && same(prev[k], next[k])) continue;
    changed = true;
    stamps[k] = fresh || (!(k in prev) && same(next[k], defaults[k])) ? Math.max(stamps[k] ?? zero, zero) : now;
  }
  return { stamps, changed };
}

/** Deep equality for JSON-like rows (key order ignored, Dates by time). */
export function same(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}
export function stable(v: unknown): string {
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + stable((v as Record<string, unknown>)[k])).join(',') + '}';
  return JSON.stringify(v ?? null);
}
