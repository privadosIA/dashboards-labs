import { formatClock } from './format';

describe('formatClock', () => {
  it('writes minutes and two-digit seconds', () => {
    expect(formatClock(131)).toBe('2:11');
    expect(formatClock(59)).toBe('0:59');
    expect(formatClock(3601)).toBe('60:01');
  });

  it('rounds, and never goes below zero', () => {
    expect(formatClock(130.6)).toBe('2:11');
    expect(formatClock(-5)).toBe('0:00');
  });
});
