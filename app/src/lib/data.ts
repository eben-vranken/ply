// Baked opening data from the pipeline (docs/DATA_CONTRACT.md). Downloaded once
// per band, kept in IndexedDB (`data` table), and parsed into memory at launch.
import { db } from './db';

export interface TreeNode {
  g: number;
  e: number;
  o?: number;
  d: string;
  m: [uci: string, games: number, w: number, dr: number, b: number][];
}
export type Tree = Record<string, TreeNode>;

export interface Trap {
  id: string;
  kind: 'punish' | 'danger';
  epd: string;
  side: 'w' | 'b';
  answer: string[];
  line: string[];
  bait?: string;
  refute?: string[];
  loss: number;
  freq: number;
  o: number;
}
export interface Puzzle {
  id: string;
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
  families: number[];
  plays: number;
}
export interface Opening {
  id: number;
  eco: string;
  name: string;
  family: string;
  epd: string;
  uci: string[];
  san: string;
}
export interface Manifest {
  version: string;
  month: string;
  built: string;
  bands: number[];
  files: { name: string; bytes: number; sha256: string }[];
}

export const BANDS = [1000, 1200, 1400, 1600, 1800, 2000];
const BASE = (import.meta.env?.BASE_URL ?? '/') + 'data/';

async function gunzipText(buf: ArrayBuffer): Promise<string> {
  const u = new Uint8Array(buf);
  // a dev server may already have decoded it (Content-Encoding: gzip)
  if (!(u[0] === 0x1f && u[1] === 0x8b)) return new TextDecoder().decode(u);
  const stream = new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

async function fetchBytes(name: string, onBytes?: (n: number) => void): Promise<ArrayBuffer> {
  const r = await fetch(BASE + name, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  if (!r.body || !onBytes) return await r.arrayBuffer();
  const reader = r.body.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); n += value.length; onBytes(value.length);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out.buffer;
}

export async function fetchManifest(): Promise<Manifest> {
  const r = await fetch(BASE + 'manifest.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error(`manifest: HTTP ${r.status}`);
  return await r.json();
}

export const filesFor = (band: number) => ['openings.json', 'puzzles.json.gz', `tree-${band}.json.gz`, `traps-${band}.json.gz`];

export interface Loaded { tree: Tree; traps: Trap[]; puzzles: Puzzle[]; openings: Opening[]; version: string; band: number }

/**
 * Make sure every file for `band` is stored locally, downloading what is missing
 * or changed (sha256 differs from the manifest). Works offline once stored.
 */
export async function ensureFiles(band: number, progress?: (done: number, total: number) => void, update = false): Promise<string> {
  const need = filesFor(band);
  const have = await db.data.bulkGet(need);
  const stored = (await db.data.get('manifest.json'))?.text;
  let manifest: Manifest | null = stored ? JSON.parse(stored) : null;
  const missing = have.some((h) => !h);
  if (missing || update) {
    try { manifest = await fetchManifest(); } catch (e) { if (missing) throw e; return manifest?.version ?? ''; }
  }
  if (!manifest) throw new Error('No data manifest');
  const todo = need.filter((n, i) => {
    const f = manifest!.files.find((x) => x.name === n);
    return !have[i] || (f && have[i]!.sha256 !== f.sha256);
  });
  const total = todo.reduce((s, n) => s + (manifest!.files.find((x) => x.name === n)?.bytes ?? 0), 0);
  let done = 0;
  for (const name of todo) {
    const f = manifest.files.find((x) => x.name === name);
    const bytes = await fetchBytes(name, (n) => { done += n; progress?.(done, total); });
    await db.data.put({ name, bytes, sha256: f?.sha256 ?? '', version: manifest.version });
  }
  await db.data.put({ name: 'manifest.json', text: JSON.stringify(manifest), version: manifest.version, sha256: '' });
  return manifest.version;
}

export async function loadBand(band: number): Promise<Loaded> {
  const [o, p, t, r, m] = await db.data.bulkGet(['openings.json', 'puzzles.json.gz', `tree-${band}.json.gz`, `traps-${band}.json.gz`, 'manifest.json']);
  if (!o?.bytes || !p?.bytes || !t?.bytes || !r?.bytes) throw new Error(`Data for band ${band} is not stored`);
  const [openings, puzzles, tree, traps] = await Promise.all([
    gunzipText(o.bytes).then(JSON.parse),
    gunzipText(p.bytes).then(JSON.parse),
    gunzipText(t.bytes).then(JSON.parse),
    gunzipText(r.bytes).then(JSON.parse)
  ]);
  return { openings, puzzles, tree, traps, version: m?.version ?? '', band };
}

/** Is a newer data version published? */
export async function newerVersion(): Promise<string | null> {
  try {
    const m = await fetchManifest();
    const cur = (await db.data.get('manifest.json'))?.version;
    return m.version !== cur ? m.version : null;
  } catch { return null; }
}
