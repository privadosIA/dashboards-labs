import { formatBytes, formatClock, formatWait } from './format';

describe('format', () => {
  it('writes a clock as m:ss', () => {
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(48)).toBe('0:48');
    expect(formatClock(3600)).toBe('60:00');
    expect(formatClock(-3)).toBe('0:00');
    expect(formatClock(NaN)).toBe('0:00');
  });

  it('writes a wait in seconds, minutes or hours', () => {
    expect(formatWait(45)).toBe('45 s');
    expect(formatWait(180)).toBe('3 min');
    expect(formatWait(3900)).toBe('1 h 05 min');
  });

  it('writes a size in MB or GB', () => {
    expect(formatBytes(8_400_000)).toBe('8.4 MB');
    expect(formatBytes(2_500_000_000)).toBe('2.5 GB');
  });
});
