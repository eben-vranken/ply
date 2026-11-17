import { describe, it, expect } from 'vitest';
import { branchCues } from './cue';
import { epdAfter } from './chess';

const at = (...path: string[]) => epdAfter(path);

describe('branch cues', () => {
  it('says nothing where there is one move', () => {
    expect(branchCues(at(), ['e2e4'])).toEqual(['']);
  });
  it('a capture against a move that does not take', () => {
    expect(branchCues(at('e2e4', 'e7e6', 'd2d4', 'd7d5'), ['e4d5', 'e4e5'])).toEqual(['take the pawn', "don't take"]);
  });
  it('two captures of the same piece: what takes', () => {
    expect(branchCues(at('e2e4', 'd7d5', 'g1f3', 'g8f6', 'b1c3', 'd5e4'), ['c3e4', 'f3g5'])).toEqual(['take the pawn', "don't take"]);
    expect(branchCues(at('e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5c6'), ['d7c6', 'b7c6'])).toEqual(['push the d-pawn', 'push the b-pawn']);
  });
  it('castling against waiting', () => {
    expect(branchCues(at('e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5'), ['e1g1', 'c2c3'])).toEqual(['castle', "don't castle yet"]);
  });
  it('different pieces, different pawns, one pawn two ways', () => {
    expect(branchCues(at('e2e4', 'e7e5'), ['g1f3', 'f2f4'])).toEqual(['move the knight', 'move a pawn']);
    expect(branchCues(at(), ['e2e4', 'd2d4'])).toEqual(['push the e-pawn', 'push the d-pawn']);
    expect(branchCues(at('e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5'), ['d2d3', 'd2d4'])).toEqual(['push the pawn one square', 'push the pawn two squares']);
    expect(branchCues(at('e2e4', 'e7e5'), ['g1f3', 'b1c3'])).toEqual(['move the kingside knight', 'move the queenside knight']);
  });
  it('the same piece to two squares: how often it is played, then the name, then the move', () => {
    const e = at('e2e4', 'e7e5', 'g1f3', 'b8c6');
    const share = (u: string) => (u === 'f1c4' ? 0.5 : 0.2);
    expect(branchCues(e, ['f1c4', 'f1b5'], { share })).toEqual(['play the main move', 'play the sideline']);
    expect(branchCues(e, ['f1b5', 'f1c4'], { share })).toEqual(['play the sideline', 'play the main move']);
    // too close to call: the numbers could swap with the next data month
    const close = (u: string) => (u === 'f1c4' ? 0.3 : 0.25);
    const name = (u: string) => (u === 'f1c4' ? 'Italian Game' : 'Ruy Lopez');
    expect(branchCues(e, ['f1c4', 'f1b5'], { share: close, name })).toEqual(['play the Italian Game', 'play the Ruy Lopez']);
    expect(branchCues(e, ['f1c4', 'f1b5'], { share: close, name: () => 'Italian Game' })).toEqual(['play Bc4', 'play Bb5']);
    expect(branchCues(e, ['f1c4', 'f1b5'])).toEqual(['play Bc4', 'play Bb5']);
  });
  it('names drop the family every move shares', () => {
    const e = at('e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'd2d3', 'd7d6');
    const name = (u: string) => (u === 'c1e3' ? 'Italian Game: Giuoco Pianissimo' : 'Italian Game: Giuoco Piano');
    expect(branchCues(e, ['c1e3', 'c1g5'], { name })).toEqual(['play the Giuoco Pianissimo', 'play the Giuoco Piano']);
  });
  it('three moves still get three different cues', () => {
    const cues = branchCues(at('e2e4', 'e7e5'), ['g1f3', 'f2f4', 'f1c4']);
    expect(new Set(cues).size).toBe(3);
  });
});
