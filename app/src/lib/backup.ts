// Backup export / import (docs/backup-format.md). One JSON file with every
// user table; the baked opening data is left out and re-downloaded.
import { db, BACKUP_VERSION, LEGACY_MODES, type CardRow, type ReviewRow, type RepRow, type GameRow, type SettingRow, type BookRow } from './db';

export interface Backup {
  app: 'ply';
  schemaVersion: number;
  exportedAt: string;
  dataVersion?: string;
  /** `book` from format 3 on; older files have none */
  tables: { settings: SettingRow[]; repertoire: RepRow[]; cards: CardRow[]; reviews: ReviewRow[]; games: GameRow[]; book?: BookRow[] };
}

export async function makeBackup(): Promise<Backup> {
  const [settings, repertoire, cards, reviews, games, book, manifest] = await Promise.all([
    db.settings.toArray(), db.repertoire.toArray(), db.cards.toArray(), db.reviews.toArray(), db.games.toArray(), db.book.toArray(), db.data.get('manifest.json')
  ]);
  return { app: 'ply', schemaVersion: BACKUP_VERSION, exportedAt: new Date().toISOString(), dataVersion: manifest?.version, tables: { settings, repertoire, cards, reviews, games, book } };
}

export function parseBackup(text: string): Backup {
  const j = JSON.parse(text) as Backup;
  if (j?.app !== 'ply' || typeof j.schemaVersion !== 'number' || !j.tables) throw new Error("That file isn't a Ply backup");
  if (j.schemaVersion > BACKUP_VERSION) throw new Error('This backup is from a newer version of Ply');
  for (const k of ['settings', 'repertoire', 'cards', 'reviews', 'games'] as const) if (!Array.isArray(j.tables[k])) throw new Error(`Backup is missing the ${k} table`);
  if (!Array.isArray(j.tables.book)) j.tables.book = [];
  // JSON turns dates into strings; FSRS wants Dates back
  for (const c of j.tables.cards) {
    c.fsrs.due = new Date(c.fsrs.due);
    if (c.fsrs.last_review) c.fsrs.last_review = new Date(c.fsrs.last_review);
  }
  for (const r of j.tables.reviews) if (r.mode in LEGACY_MODES) r.mode = LEGACY_MODES[r.mode];
  for (const r of j.tables.reviews) if (r.prev) { r.prev.due = new Date(r.prev.due); if (r.prev.last_review) r.prev.last_review = new Date(r.prev.last_review); }
  return j;
}

/** Replace every user table with the backup's contents. */
export async function restoreBackup(b: Backup) {
  await db.transaction('rw', [db.settings, db.repertoire, db.cards, db.reviews, db.games, db.book], async () => {
    await Promise.all([db.settings.clear(), db.repertoire.clear(), db.cards.clear(), db.reviews.clear(), db.games.clear(), db.book.clear()]);
    await db.book.bulkPut(b.tables.book ?? []);
    await db.settings.bulkPut(b.tables.settings);
    await db.repertoire.bulkPut(b.tables.repertoire);
    await db.cards.bulkPut(b.tables.cards);
    await db.reviews.bulkPut(b.tables.reviews);
    await db.games.bulkPut(b.tables.games);
  });
}

export const backupName = (d = new Date()) => `ply-backup-${d.toISOString().slice(0, 10)}.json`;

/** Hand the file to the Android share sheet, or download it. */
export async function shareBackup(b: Backup): Promise<boolean> {
  const name = backupName();
  const blob = new Blob([JSON.stringify(b)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return true; }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return false;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return true;
}
