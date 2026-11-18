// What your review log says about the roadmap's changes (docs/ROADMAP.md 1c, 2h, 3a).
// Usage: npm run log-check -- ply-backup-YYYY-MM-DD.json   (Settings → Export backup)
import { readFileSync } from 'node:fs';
import { logCheck, formatLogCheck } from '../src/lib/logcheck';

const file = process.argv[2];
if (!file) { console.error('Usage: npm run log-check -- <backup.json>'); process.exit(1); }
const j = JSON.parse(readFileSync(file, 'utf8'));
if (j?.app !== 'ply' || !j.tables) { console.error("That file isn't a Ply backup"); process.exit(1); }
console.log(formatLogCheck(logCheck(j.tables.reviews ?? [], j.tables.cards ?? [], j.tables.repertoire ?? [])));
