// Export your repertoire as PGN: one game per colour, or one opening. The main line at every
// position is the most played move; your other moves and the other replies become variations.
// Your notes go out as comments after your move, which is where the PGN import reads them from,
// so an exported file imports back into the same repertoire.
import { openingTree, noteAt, nameOf, type TreeMove } from './model.svelte';
import { writePgn, type OutNode } from './pgn';
import { epdAfter, sans, START_EPD, child, type Side } from './chess';

const day = (d = new Date()) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
const colour = (s: Side) => (s === 'w' ? 'White' : 'Black');

function nodes(side: Side, ms: TreeMove[]): OutNode[] {
  return ms.map((m) => ({
    san: m.san,
    comment: m.mine ? noteAt(side, m.epd) || undefined : m.joins ? 'Transposes into another line of yours' : undefined,
    children: m.joins ? [] : nodes(side, m.children)
  }));
}

/** Your lines below `path` (UCI from the start), as one PGN game. */
export function exportOpening(side: Side, path: string[]): string {
  const [eco, name] = path.length ? nameOf(epdAfter(path), path) : ['', ''];
  const tree = nodes(side, openingTree(side, path));
  // the moves leading to the opening come first, each the only move
  let moves = tree;
  if (path.length) {
    const ss = sans(path);
    let e = START_EPD;
    const chain: OutNode[] = path.map((u, i) => { const turn = e.split(' ')[1]; const n: OutNode = { san: ss[i], comment: turn === side ? noteAt(side, e) || undefined : undefined, children: [] }; e = child(e, u); return n; });
    for (let i = 0; i < chain.length - 1; i++) chain[i].children = [chain[i + 1]];
    chain[chain.length - 1].children = tree;
    moves = [chain[0]];
  }
  const headers: Record<string, string> = {
    Event: `Ply repertoire: ${name ? `${name}, ` : ''}${colour(side)}`,
    Site: 'Ply',
    Date: day(),
    Result: '*',
    Orientation: side === 'w' ? 'white' : 'black'
  };
  if (eco) Object.assign(headers, { ECO: eco, Opening: name });
  return writePgn({ headers, moves });
}

/** The whole repertoire, or one colour: one game per colour. */
export function exportRepertoire(which: 'all' | Side): string {
  const sides: Side[] = which === 'all' ? ['w', 'b'] : [which];
  return sides.map((s) => exportOpening(s, [])).join('\n');
}

export const pgnName = (what: string, d = new Date()) => `ply-${what.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${d.toISOString().slice(0, 10)}.pgn`;
