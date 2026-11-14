// Demo repertoire compiled into the app. It stands in for the pipeline output
// (docs/BRIEF.md, "Data formats") until that exists. Frequencies, game counts,
// results and evals here are illustrative, not measured.
import { Chess } from 'chess.js';

export type Side = 'w' | 'b';
export type Stage = 'new' | 'learning' | 'young' | 'mature';

interface RawLine { side: Side; w: number; san: string[] }
const L = (side: Side, w: number, s: string): RawLine => ({ side, w, san: s.split(' ') });

export const LINES: RawLine[] = [
  L('w', 16, 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6 Bb3 Ba7'),
  L('w', 11, 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5 Bb5+ c6 dxc6 bxc6 Be2 h6 Nf3'),
  L('w', 6, 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7 Kxf7 Qf3+ Ke6 Nc3'),
  L('w', 2, 'e4 e5 Nf3 Nc6 Bc4 Nd4 Nxd4 exd4 O-O'),
  L('w', 5, 'e4 e5 Nf3 d6 d4 exd4 Nxd4 Nf6 Nc3 Be7 Be2'),
  L('w', 4, 'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3'),
  L('w', 12, 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3'),
  L('w', 6, 'e4 e6 d4 d5 Nc3 Nf6 e5 Nfd7 f4 c5 Nf3'),
  L('w', 5, 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3'),
  L('w', 4, 'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3'),
  L('b', 9, 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6'),
  L('b', 12, 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+'),
  L('b', 5, 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6'),
  L('b', 4, 'e4 e5 Qh5 Nc6 Bc4 g6 Qf3 Nf6'),
  L('b', 10, 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6'),
  L('b', 5, 'd4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 c6'),
  L('b', 7, 'd4 d5 Bf4 Nf6 e3 c5 c3 Nc6 Nd2 e6'),
  L('b', 2, 'd4 d5 e4 dxe4 Nc3 Nf6 f3 exf3'),
  L('b', 3, 'c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5'),
  L('b', 3, 'Nf3 d5 g3 Nf6 Bg2 c5 O-O Nc6')
];

// Names and ECO codes as in lichess-org/chess-openings.
const NAMES: Record<string, [string, string]> = {
  'e4': ['B00', "King's Pawn"],
  'e4 e5': ['C20', "King's Pawn Game"],
  'e4 e5 Nf3': ['C40', "King's Knight Opening"],
  'e4 e5 Nf3 Nc6': ['C44', "King's Knight Opening: Normal Variation"],
  'e4 e5 Nf3 Nc6 Bc4': ['C50', 'Italian Game'],
  'e4 e5 Nf3 Nc6 Bc4 Bc5': ['C50', 'Italian Game: Giuoco Piano'],
  'e4 e5 Nf3 Nc6 Bc4 Bc5 c3': ['C53', 'Italian Game: Classical Variation'],
  'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3': ['C54', 'Italian Game: Giuoco Pianissimo'],
  'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4': ['C54', 'Italian Game: Classical Variation, Center Attack'],
  'e4 e5 Nf3 Nc6 Bc4 Nf6': ['C55', 'Italian Game: Two Knights Defense'],
  'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5': ['C57', 'Italian Game: Two Knights Defense, Knight Attack'],
  'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5': ['C58', 'Italian Game: Two Knights Defense, Polerio Defense'],
  'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7': ['C57', 'Italian Game: Two Knights Defense, Fried Liver Attack'],
  'e4 e5 Nf3 Nc6 Bc4 Nd4': ['C50', 'Italian Game: Blackburne-Kostić Gambit'],
  'e4 e5 Nf3 Nc6 Bb5': ['C60', 'Ruy Lopez'],
  'e4 e5 Nf3 Nc6 Bb5 a6': ['C68', 'Ruy Lopez: Morphy Defense'],
  'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7': ['C84', 'Ruy Lopez: Closed'],
  'e4 e5 Nf3 Nc6 d4': ['C44', 'Scotch Game'],
  'e4 e5 Nf3 Nc6 d4 exd4 Nxd4': ['C45', 'Scotch Game'],
  'e4 e5 Nf3 d6': ['C41', 'Philidor Defense'],
  'e4 e5 Nf3 Nf6': ['C42', 'Russian Game'],
  'e4 e5 Qh5': ['C20', "King's Pawn Game: Wayward Queen Attack"],
  'e4 c5': ['B20', 'Sicilian Defense'],
  'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6': ['B90', 'Sicilian Defense: Najdorf Variation'],
  'e4 e6': ['C00', 'French Defense'],
  'e4 e6 d4 d5 Nc3 Nf6 e5': ['C11', 'French Defense: Steinitz Variation'],
  'e4 c6': ['B10', 'Caro-Kann Defense'],
  'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5': ['B18', 'Caro-Kann Defense: Classical Variation'],
  'e4 d5': ['B01', 'Scandinavian Defense'],
  'd4': ['A40', "Queen's Pawn Game"],
  'd4 d5': ['D00', "Queen's Pawn Game"],
  'd4 d5 c4': ['D06', "Queen's Gambit"],
  'd4 d5 c4 e6': ['D30', "Queen's Gambit Declined"],
  'd4 d5 c4 e6 Nc3 Nf6 cxd5': ['D35', "Queen's Gambit Declined: Exchange Variation"],
  'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7': ['D53', "Queen's Gambit Declined: Modern Variation"],
  'd4 d5 Bf4': ['D00', "Queen's Pawn Game: Accelerated London System"],
  'd4 d5 e4': ['D00', 'Blackmar-Diemer Gambit'],
  'c4': ['A10', 'English Opening'],
  'c4 e5': ['A20', "English Opening: King's English Variation"],
  'Nf3': ['A04', 'Zukertort Opening'],
  'Nf3 d5 g3': ['A07', "King's Indian Attack"]
};

export const epdOf = (fen: string) => fen.split(' ').slice(0, 4).join(' ');
export const START = new Chess().fen();

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export interface MoveRow { san: string; from: string; to: string; games: number; freq: number; w: number; d: number; b: number; cp: number; next: string }
export interface Node { epd: string; fen: string; path: string[]; games: number; moves: MoveRow[]; eco: string; name: string }

export const TREE = new Map<string, Node>();
export const MY: Record<Side, Map<string, string[]>> = { w: new Map(), b: new Map() };

export function nameOf(path: string[]): [string, string] {
  for (let i = path.length; i > 0; i--) {
    const n = NAMES[path.slice(0, i).join(' ')];
    if (n) return n;
  }
  return ['', 'Starting position'];
}

(function build() {
  const acc = new Map<string, Map<string, { games: number; from: string; to: string; next: string }>>();
  const meta = new Map<string, { fen: string; path: string[] }>();
  for (const line of LINES) {
    const c = new Chess();
    line.san.forEach((san, i) => {
      const fen = c.fen();
      const epd = epdOf(fen);
      if (!meta.has(epd)) meta.set(epd, { fen, path: line.san.slice(0, i) });
      const mv = c.move(san);
      const m = acc.get(epd) ?? new Map();
      const cur = m.get(san) ?? { games: 0, from: mv.from, to: mv.to, next: epdOf(c.fen()) };
      cur.games += line.w * 2600 + (hash(epd + san) % 900);
      m.set(san, cur);
      acc.set(epd, m);
      if ((i % 2 === 0) === (line.side === 'w')) {
        const mine = MY[line.side].get(epd) ?? [];
        if (!mine.includes(san)) mine.push(san);
        MY[line.side].set(epd, mine);
      }
    });
    const end = epdOf(c.fen());
    if (!meta.has(end)) meta.set(end, { fen: c.fen(), path: line.san });
  }
  for (const [epd, { fen, path }] of meta) {
    const m = acc.get(epd);
    const total = m ? [...m.values()].reduce((s, x) => s + x.games, 0) : 0;
    const moves: MoveRow[] = m
      ? [...m.entries()].map(([san, x]) => {
          const h = hash(epd + '|' + san);
          const cp = ((h % 90) - 35) * (fen.includes(' w ') ? 1 : -1) + 18;
          const d = 4 + (h % 5);
          const w = Math.round(48 + cp / 12 + ((h >> 8) % 7) - 3 - d / 2);
          return { san, from: x.from, to: x.to, games: x.games, freq: x.games / total, w, d, b: 100 - w - d, cp, next: x.next };
        }).sort((a, b) => b.games - a.games)
      : [];
    const [eco, name] = nameOf(path);
    TREE.set(epd, { epd, fen, path, games: total, moves, eco, name });
  }
})();

export const nodeAt = (fen: string) => TREE.get(epdOf(fen));

/** Informant-style evaluation symbol from White's view. */
export function evalGlyph(cp: number): string {
  const a = Math.abs(cp);
  if (a < 20) return '=';
  if (a < 60) return cp > 0 ? '⩲' : '⩱';
  if (a < 150) return cp > 0 ? '±' : '∓';
  return cp > 0 ? '+−' : '−+';
}
export const evalText = (cp: number) => (cp >= 0 ? '+' : '−') + (Math.abs(cp) / 100).toFixed(1);

/** "1.e4 e5 2.Nf3" */
export function moveOrder(san: string[], ask = false): string {
  let s = '';
  san.forEach((m, i) => { s += (i % 2 === 0 ? `${i / 2 + 1}.` : '') + m + ' '; });
  if (ask) s += san.length % 2 === 0 ? `${san.length / 2 + 1}.?` : '?';
  return s.trim();
}

export function squaresOf(san: string[]): [string, string][] {
  const c = new Chess();
  return san.map((m) => { const mv = c.move(m); return [mv.from, mv.to]; });
}

// ---------- repertoire summary ----------
export interface Opening { id: string; section: 'White' | 'Black vs 1.e4' | 'Black vs 1.d4' | 'Black vs others'; side: Side; name: string; eco: string; path: string[]; lines: number; learned: number; total: number; coverage: number; stages: [number, number, number, number]; hue: string }
const HUES = ['#2b4bee', '#cf331c', '#0f7a55', '#b9770a', '#7a3fc4', '#0b7f93'];
function opening(section: Opening['section'], side: Side, pathS: string, lines: number, stages: [number, number, number, number], coverage: number, i: number): Opening {
  const path = pathS.split(' ');
  const [eco, name] = nameOf(path);
  const total = stages.reduce((a, b) => a + b, 0);
  return { id: pathS, section, side, name, eco, path, lines, learned: total - stages[0], total, coverage, stages, hue: HUES[i % HUES.length] };
}
export const OPENINGS: Opening[] = [
  opening('White', 'w', 'e4 e5 Nf3 Nc6 Bc4 Bc5', 14, [6, 4, 12, 9], 86, 0),
  opening('White', 'w', 'e4 e5 Nf3 Nc6 Bc4 Nf6', 11, [9, 3, 8, 4], 78, 1),
  opening('White', 'w', 'e4 c5', 9, [14, 2, 5, 0], 61, 4),
  opening('White', 'w', 'e4 e6', 5, [8, 1, 3, 0], 64, 2),
  opening('White', 'w', 'e4 c6', 4, [7, 0, 4, 1], 70, 5),
  opening('White', 'w', 'e4 d5', 3, [2, 1, 4, 2], 82, 3),
  opening('Black vs 1.e4', 'b', 'e4 e5 Nf3 Nc6 Bc4 Bc5', 8, [5, 2, 7, 6], 81, 0),
  opening('Black vs 1.e4', 'b', 'e4 e5 Nf3 Nc6 Bb5', 7, [10, 2, 4, 1], 66, 3),
  opening('Black vs 1.e4', 'b', 'e4 e5 Nf3 Nc6 d4', 4, [3, 1, 5, 2], 79, 2),
  opening('Black vs 1.d4', 'b', 'd4 d5 c4 e6', 10, [7, 3, 9, 5], 84, 4),
  opening('Black vs 1.d4', 'b', 'd4 d5 Bf4', 5, [6, 2, 3, 0], 72, 5),
  opening('Black vs others', 'b', 'c4 e5', 3, [5, 1, 2, 0], 58, 1),
  opening('Black vs others', 'b', 'Nf3 d5 g3', 3, [6, 0, 2, 0], 55, 2)
];

// ---------- today's demo session ----------
export interface Item {
  kind: 'line' | 'new' | 'punish' | 'danger';
  side: Side;
  setup: string[];   // played instantly before the card starts
  moves: string[];   // then these: opponent moves auto-play, yours are asked
  prompt: string;
  source?: string;
  note?: string;
  branch?: { label: string; until: number; alt: string; altName: string };
  bait?: { san: string; refute: string[] };
}
const S = (s: string) => (s ? s.split(' ') : []);
export const SESSION: Item[] = [
  { kind: 'line', side: 'w', setup: [], moves: S('e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O'), prompt: 'Your move',
    branch: { label: 'Italian Game (C50)', until: 4, alt: 'Bb5', altName: 'Ruy Lopez' },
    note: 'c3 and d3 first, castle after. The bishop drops back to b3 when ...a6 and ...b5 come.' },
  { kind: 'punish', side: 'w', setup: S('e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5'), moves: S('Nxd5 Nxf7 Kxf7 Qf3+ Ke6 Nc3'), prompt: 'They blundered. Punish it',
    source: 'Punish · played by 9% at your band', note: 'The king is dragged to e6 and the pinned knight on d5 comes under fire from three pieces.' },
  { kind: 'danger', side: 'w', setup: S('e4 e5 Nf3 Nc6 Bc4'), moves: S('Nd4 Nxd4'), prompt: 'Careful. Find the safe move',
    source: 'Danger · 22% at your band take on e5', bait: { san: 'Nxe5', refute: S('Qg5 Nxf7 Qxg2 Rf1 Qxe4+ Be2 Nf3#') },
    note: 'Just trade the knight. The e5 pawn is poisoned.' },
  { kind: 'line', side: 'b', setup: [], moves: S('d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O'), prompt: 'Your move' },
  { kind: 'punish', side: 'w', setup: S('e4 e5 Nf3 d6 Bc4 Bg4 Nc3'), moves: S('g6 Nxe5 Bxd1 Bxf7+ Ke7 Nd5#'), prompt: 'They blundered. Punish it',
    source: 'Punish · played by 4% at your band', note: "Légal's mate. If they take the knight instead, Qxg4 wins a clean pawn." },
  { kind: 'new', side: 'b', setup: [], moves: S('d4 d5 Bf4 Nf6 e3 c5'), prompt: 'New move',
    note: 'Hit the centre before White finishes the London set-up. ...Qb6 next asks who guards b2.' }
];

// ---------- demo statistics (seeded, illustrative) ----------
function rnd(seed: number) { return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); }
const r = rnd(7);
export const STATS = {
  totals: { Move: [71, 18, 66, 30], Punish: [9, 2, 6, 3], Danger: [4, 1, 3, 1], Puzzle: [22, 3, 9, 2], Mistake: [6, 2, 5, 1] } as Record<string, [number, number, number, number]>,
  suspended: 4,
  forecast: Array.from({ length: 30 }, (_, i) => Math.round(8 + 22 * Math.exp(-i / 9) + r() * 12)),
  history: Array.from({ length: 371 }, (_, i) => (i < 150 ? 0 : r() < 0.16 ? 0 : Math.round(r() * r() * 90 + 6))),
  minutes: Array.from({ length: 14 }, () => Math.round(4 + r() * 11)),
  retention: { target: 90, young7: 88, mature7: 94, young30: 86, mature30: 93 },
  weakest: [
    { name: 'Italian Game: Two Knights Defense, Polerio Defense', eco: 'C58', order: '1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6 4.Ng5 d5 5.exd5 Na5 6.?', lapses: 5 },
    { name: "Queen's Gambit Declined: Exchange Variation", eco: 'D35', order: '1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.cxd5 exd5 5.Bg5 ?', lapses: 4 },
    { name: 'Sicilian Defense: Najdorf Variation', eco: 'B90', order: '1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6 6.?', lapses: 4 },
    { name: 'Ruy Lopez: Closed', eco: 'C84', order: '1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O ?', lapses: 3 },
    { name: 'Caro-Kann Defense: Classical Variation', eco: 'B18', order: '1.e4 c6 2.d4 d5 3.Nc3 dxe4 4.Nxe4 Bf5 5.?', lapses: 3 },
    { name: 'Scotch Game', eco: 'C45', order: '1.e4 e5 2.Nf3 Nc6 3.d4 exd4 4.Nxd4 ?', lapses: 2 }
  ],
  games: {
    months: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'],
    m10: [-0.62, -0.48, -0.31, -0.22, -0.05, 0.12],
    m15: [-1.1, -0.95, -0.7, -0.66, -0.41, -0.2],
    rating: [802, 815, 841, 838, 872, 901]
  },
  spark10: [-0.7, -0.5, -0.6, -0.3, -0.35, -0.1, -0.2, 0.05, -0.05, 0.12],
  spark15: [-1.2, -1.0, -1.1, -0.8, -0.7, -0.75, -0.5, -0.45, -0.3, -0.2]
};
export const MISTAKES = [
  { opponent: 'kasparovsdog', date: '11 Nov', result: 'Lost', colour: 'White', cards: ['14.Nxe5 lost 31%', '22.Rd1 lost 24%'] },
  { opponent: 'PawnStormPete', date: '9 Nov', result: 'Won', colour: 'Black', cards: ['9...Bg4 lost 22%'] },
  { opponent: 'mellow_knight', date: '6 Nov', result: 'Lost', colour: 'Black', cards: ['11...Qb6 lost 38%', '17...f5 lost 21%', '25...Kh8 lost 20%'] }
];
export const UNCOVERED = [
  { order: '1.e4 e5 2.Nf3 Nc6 3.Bc4 h6', name: 'Italian Game: Anti-Fried Liver Defense', eco: 'C50', times: 3, path: 'e4 e5 Nf3 Nc6 Bc4' },
  { order: '1.d4 d5 2.c4 e6 3.Nf3', name: "Queen's Gambit Declined", eco: 'D30', times: 2, path: 'd4 d5 c4 e6' }
];
