import { describe, expect, it } from 'vitest';
import { lineTo } from './puzzleGame';

describe('lineTo', () => {
  it('returns the moves before the puzzle position', () => {
    // after 1.e4 e5 2.Nf3
    expect(lineTo('e4 e5 Nf3 Nc6 Bb5', 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2')).toEqual(['e2e4', 'e7e5', 'g1f3']);
  });
  it('is empty at the starting position and null when the game never gets there', () => {
    expect(lineTo('e4', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toEqual([]);
    expect(lineTo('d4 d5', 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2')).toBe(null);
  });
});
