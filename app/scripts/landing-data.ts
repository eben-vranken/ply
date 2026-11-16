// Builds the landing page's demo data from the real opening data in public/data
// (run `npm run landing-data` after the pipeline rebuilds it). Everything the landing
// page shows as a number or a move comes from here: nothing is typed in by hand.
// Output: src/lib/landing/demo.json (small, bundled with the landing page only).
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { child, san, sans, epdAfter, fenOf, moveOrder, START_EPD, START_FEN } from '../src/lib/chess';
import { explain } from '../src/lib/explain';
import type { Tree, Trap, Opening, Manifest, Puzzle } from '../src/lib/data';

const D = fileURLToPath(new URL('../public/data/', import.meta.url));
const gz = <T>(n: string): T => JSON.parse(gunzipSync(readFileSync(D + n)).toString());
const manifest: Manifest = JSON.parse(readFileSync(D + 'manifest.json', 'utf8'));
const openings: Opening[] = JSON.parse(readFileSync(D + 'openings.json', 'utf8'));
const puzzles = gz<Puzzle[]>('puzzles.json.gz');
const trees = new Map<number, Tree>(), traps = new Map<number, Trap[]>();
for (const b of manifest.bands) { trees.set(b, gz<Tree>(`tree-${b}.json.gz`)); traps.set(b, gz<Trap[]>(`traps-${b}.json.gz`)); }

const BAND = 1200; // the band the demo plays at (the app's default)
const T = trees.get(BAND)!;
const byEpd = new Map(openings.map((o) => [o.epd, o]));
const pct = (n: number, of: number) => Math.round((n / of) * 1000) / 10;
/** FEN after each move of a UCI line */
function fens(start: string, line: string[]) {
  const c = new Chess(fenOf(start));
  return line.map((u) => { const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); return { uci: u, san: m.san, fen: c.fen() }; });
}
const nameAt = (path: string[]) => { for (let i = path.length; i > 0; i--) { const o = byEpd.get(epdAfter(path.slice(0, i))); if (o) return o; } return null; };
const replies = (tree: Tree, epd: string, n = 5) => {
  const node = tree[epd];
  return node.m.slice(0, n).map(([u, g, w, d, b]) => ({ uci: u, san: san(epd, u), pct: pct(g, node.g), games: g, w: pct(w, w + d + b), d: pct(d, w + d + b), b: pct(b, w + d + b), cp: tree[child(epd, u)]?.e ?? null }));
};

// ---- the hero line: you play White with the default moves; Black answers with the most played reply
const hero: unknown[] = [];
{
  const path: string[] = [];
  let epd = START_EPD;
  for (let ply = 0; ply < 11; ply++) {
    const node = T[epd];
    if (!node?.m.length) break;
    const mine = ply % 2 === 0;
    const u = mine ? node.d : node.m[0][0];
    const row = node.m.find((m) => m[0] === u);
    const share = row ? row[1] / node.g : 0;
    path.push(u);
    const next = child(epd, u);
    hero.push({
      uci: u, san: san(epd, u), mine, fen: fenOf(next).replace(/ 0 1$/, ` 0 ${Math.floor(ply / 2) + 1}`), share: pct(row?.[1] ?? 0, node.g), reached: node.g,
      why: mine ? explain(epd, u, share) : '', fan: mine ? null : replies(T, epd, 5), name: nameAt(path)?.name ?? '', eco: nameAt(path)?.eco ?? ''
    });
    epd = next;
  }
}

// ---- the same position at every rating band
const FAN_PATH = 'e2e4 e7e5 g1f3 b8c6 f1c4'.split(' ');
const fanEpd = epdAfter(FAN_PATH);
const fan = {
  path: FAN_PATH, order: moveOrder(sans(FAN_PATH)), fen: fenOf(fanEpd), name: nameAt(FAN_PATH)!.name, eco: nameAt(FAN_PATH)!.eco,
  bands: Object.fromEntries(manifest.bands.map((b) => [b, { games: trees.get(b)![fanEpd].g, moves: replies(trees.get(b)!, fanEpd, 6) }]))
};

// ---- one trap, both ways: the tempting move you must not play (Danger) and the same move punished (Punish)
const TRAP_PATH = 'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 f3g5 d7d5 e4d5 f6d5'.split(' ');
const trapEpd = epdAfter(TRAP_PATH);
const danger = traps.get(BAND)!.find((t) => t.kind === 'danger' && t.epd === trapEpd && t.bait === 'd1f3');
if (!danger) throw new Error('the Danger trap the landing page shows is no longer in the data: pick another in scripts/landing-data.ts');
const afterBait = child(trapEpd, danger.bait!);
const punish = traps.get(BAND)!.find((t) => t.kind === 'punish' && t.epd === afterBait);
const trap = {
  band: BAND, name: openings[danger.o].name, eco: openings[danger.o].eco, order: moveOrder(sans(TRAP_PATH)), fen: fenOf(trapEpd),
  setup: fens(START_EPD, TRAP_PATH).slice(-1)[0].uci, reached: T[trapEpd].g, moves: replies(T, trapEpd, 4),
  bait: fens(trapEpd, [danger.bait!])[0], freq: pct(danger.freq, 1), loss: Math.round(danger.loss),
  safe: { ...fens(trapEpd, [danger.answer[0]])[0], why: explain(trapEpd, danger.answer[0]) },
  refute: fens(trapEpd, [danger.bait!, ...danger.refute!]).slice(1),
  punish: punish ? { fen: fenOf(afterBait), answer: fens(afterBait, punish.line), why: explain(afterBait, punish.answer[0]) } : null
};

// ---- a small real skill tree: the Italian Game as White, your default answer to every reply played 3% or more
interface Node { id: string; reply: string; replyPct: number; san: string; depth: number; parent: string | null; name: string; kids: number }
const tree: Node[] = [];
{
  const walk = (path: string[], depth: number, parent: string | null, parentName: string) => {
    const epd = epdAfter(path), node = T[epd];
    if (!node || depth > 3) return 0;
    let n = 0;
    for (const [r, g] of node.m) {
      if (g / node.g < (depth === 1 ? 0.03 : 0.12) || g < 50) continue;
      const e2 = child(epd, r), mine = T[e2];
      if (!mine?.d) continue;
      const p2 = [...path, r, mine.d], id = p2.join(' ');
      const nm = nameAt([...path, r])?.name ?? parentName;
      const row: Node = { id, reply: san(epd, r), replyPct: pct(g, node.g), san: san(e2, mine.d), depth, parent, name: nm !== parentName ? nm : '', kids: 0 };
      tree.push(row); n++;
      row.kids = walk(p2, depth + 1, id, nm);
    }
    return n;
  };
  walk(FAN_PATH, 1, null, fan.name);
}

// ---- sigils: well-known openings, each drawn from its own first moves
const WALL = ['Italian Game', 'Ruy Lopez', 'Sicilian Defense: Najdorf Variation', 'French Defense: Winawer Variation', 'Caro-Kann Defense: Advance Variation', "Queen's Gambit Declined", "King's Indian Defense", 'London System', 'Scandinavian Defense: Main Line', 'Vienna Game: Vienna Gambit', 'English Opening: King\'s English Variation', 'Dutch Defense: Leningrad Variation', 'Nimzo-Indian Defense', 'Slav Defense', 'Pirc Defense: Austrian Attack', 'Scotch Game', "King's Gambit Accepted", 'Grünfeld Defense: Exchange Variation', 'Catalan Opening', "Alekhine Defense: Four Pawns Attack", 'Italian Game: Evans Gambit', 'Benko Gambit', "Petrov's Defense", 'Sicilian Defense: Dragon Variation'];
const BLACK = /Defense|Benko|Sicilian|Petrov|Slav|Declined|Dutch/;
const sigils = WALL.map((n) => openings.find((o) => o.name === n)).filter((o): o is Opening => !!o).map((o) => ({ name: o.name, eco: o.eco, path: o.uci.slice(0, 8), side: BLACK.test(o.name) ? 'b' : 'w' }));
const missing = WALL.filter((n) => !openings.some((o) => o.name === n));
if (missing.length) console.warn('not in openings.json (skipped):', missing.join(', '));

const out = {
  version: manifest.version, month: manifest.month, built: manifest.built, band: BAND, startFen: START_FEN,
  counts: {
    openings: openings.length, families: new Set(openings.map((o) => o.family)).size, bands: manifest.bands, puzzles: puzzles.length,
    games: Object.fromEntries(manifest.bands.map((b) => [b, trees.get(b)![START_EPD].g])),
    positions: Object.fromEntries(manifest.bands.map((b) => [b, Object.keys(trees.get(b)!).length])),
    traps: Object.fromEntries(manifest.bands.map((b) => [b, traps.get(b)!.length]))
  },
  hero, fan, trap, tree, sigils
};
const file = fileURLToPath(new URL('../src/lib/landing/demo.json', import.meta.url));
writeFileSync(file, JSON.stringify(out));
console.log(`demo.json: ${(JSON.stringify(out).length / 1024).toFixed(1)} KB · data ${manifest.version}`);
console.log('hero:', (out.hero as { san: string }[]).map((h) => h.san).join(' '), '·', (out.hero as { name: string }[]).at(-1)!.name);
console.log('trap:', trap.order, '→ bait', trap.bait.san, `${trap.freq}%`, '−' + trap.loss, 'safe', trap.safe.san, 'refute', trap.refute.map((r) => r.san).join(' '), '| punish', trap.punish?.answer.map((a) => a.san).join(' '));
console.log('tree:', tree.length, 'tiles ·', 'sigils:', sigils.length);
