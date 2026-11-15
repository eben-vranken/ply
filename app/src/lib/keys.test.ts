import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { matchMove, normMove, actionOf } from './keys';

const legal = (fen?: string) => new Chess(fen).moves({ verbose: true }).map((m) => ({ san: m.san, uci: m.from + m.to + (m.promotion ?? '') }));
const san = (typed: string, fen?: string) => matchMove(typed, legal(fen));

describe('typed moves', () => {
  it('plays a move as soon as only one is meant', () => {
    expect(san('e').sure).toBe(null);
    expect(san('e4').sure?.san).toBe('e4');
    expect(san('Nf3').sure?.san).toBe('Nf3');
    expect(san('nf3').sure?.san).toBe('Nf3');
    expect(san('N').sure).toBe(null);
    expect(san('N').options.map((m) => m.san).sort()).toEqual(['Na3', 'Nc3', 'Nf3', 'Nh3']);
  });
  it('accepts UCI', () => {
    expect(san('g1f3').sure?.san).toBe('Nf3');
  });
  it('ignores capture, check and annotation marks', () => {
    const fen = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    expect(san('exd5', fen).sure?.san).toBe('exd5');
    expect(san('ed5', fen).sure?.san).toBe('exd5');
    expect(san('exd5!?', fen).sure?.san).toBe('exd5');
  });
  it('tells a bishop from a b-pawn by case, and waits when lower case could be either', () => {
    // White: bishop on f1 can reach c4; pawn on b3 can take on c4
    const fen = 'rnbqkbnr/pp1ppppp/8/8/2p5/1P2P3/P1PP1PPP/RNBQKBNR w KQkq - 0 3';
    expect(san('Bc4', fen).sure?.san).toBe('Bxc4');
    expect(san('bxc4', fen).sure?.san).toBe('bxc4');
    const lower = san('bc4', fen);
    expect(lower.sure).toBe(null); // could be either: Enter decides
    expect(lower.best?.san).toBe('bxc4'); // exact case: the pawn
    expect(lower.options.map((m) => m.san).sort()).toEqual(['Bxc4', 'bxc4']);
  });
  it('castles however it is typed, and waits between O-O and O-O-O', () => {
    const fen = 'r3k2r/pppqbppp/2np1n2/4p3/4P3/2NP1N2/PPPQBPPP/R3K2R w KQkq - 0 8';
    for (const t of ['O-O', '0-0', 'oo', 'OO']) expect(san(t, fen).best?.san).toBe('O-O');
    expect(san('O-O', fen).sure).toBe(null); // O-O-O is still possible
    expect(san('O-O-O', fen).sure?.san).toBe('O-O-O');
    expect(normMove('0-0-0')).toBe('OOO');
  });
  it('promotes to the piece typed', () => {
    const fen = '8/4P3/8/8/8/8/k7/4K3 w - - 0 1';
    expect(san('e8', fen).sure).toBe(null);
    expect(san('e8=N', fen).sure?.san).toBe('e8=N');
    expect(san('e8q', fen).sure?.san).toBe('e8=Q');
    expect(san('e7e8r', fen).sure?.san).toBe('e8=R');
  });
  it('finds nothing for an illegal move', () => {
    expect(san('e5').sure).toBe(null);
    expect(san('e5').options).toEqual([]);
  });
  it('maps the action keys', () => {
    expect(actionOf({ key: '?' })).toBe('hint');
    expect(actionOf({ key: 'Enter' })).toBe('next');
    expect(actionOf({ key: 'Backspace' })).toBe('undo');
    expect(actionOf({ key: 'e' })).toBe(null);
  });
});
