import { describe, it, expect } from 'vitest';
import { streakOf } from './streak';

const days = (s: string) => [...s].map((c) => (c === 'x' ? 5 : 0)); // x studied, . not

describe('streak freezes', () => {
  it('counts study days in a row; today being open breaks nothing', () => {
    expect(streakOf(days('..xxx.')).streak).toBe(3);
    expect(streakOf(days('..xxxx')).streak).toBe(4);
    expect(streakOf(days('xx.x')).streak).toBe(1);
  });
  it('earns a freeze every 7 study days in a row, at most 2', () => {
    expect(streakOf(days('xxxxxx')).held).toBe(0);
    expect(streakOf(days('xxxxxxx')).held).toBe(1);
    expect(streakOf(days('x'.repeat(21))).held).toBe(2);
    expect(streakOf(days('x'.repeat(21))).earned).toBe(2);
  });
  it('a missed day uses a freeze and the streak survives without growing', () => {
    const s = streakOf(days('xxxxxxx.xx'));
    expect(s.streak).toBe(9);
    expect(s.held).toBe(0);
    expect([...s.frozen]).toEqual([7]);
  });
  it('two missed days with one freeze break the streak', () => {
    const s = streakOf(days('xxxxxxx..xx'));
    expect(s.streak).toBe(2);
    expect(s.longest).toBe(7);
  });
  it('no freeze is used when there is no streak to keep', () => {
    expect(streakOf(days('...x')).frozen.size).toBe(0);
  });
});
