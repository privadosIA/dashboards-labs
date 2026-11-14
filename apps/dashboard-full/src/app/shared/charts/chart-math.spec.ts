import { fmtNumber, fmtPct, fmtSeconds, fmtSecondsAxis, linear, niceCeil, ticks, uid } from './chart-math';

describe('chart math', () => {
  it('formats seconds as the shortest readable duration', () => {
    expect(fmtSeconds(0)).toBe('0 s');
    expect(fmtSeconds(7.5)).toBe('7,5 s');
    expect(fmtSeconds(12.4)).toBe('12 s');
    expect(fmtSeconds(59.6)).toBe('60 s');
    expect(fmtSeconds(185)).toBe('3 min 05 s');
    expect(fmtSeconds(3720)).toBe('1 h 02 min');
    expect(fmtSeconds(NaN)).toBe('—');
  });

  it('formats axis durations compactly so the tick labels fit', () => {
    expect(fmtSecondsAxis(0)).toBe('0 s');
    expect(fmtSecondsAxis(45)).toBe('45 s');
    expect(fmtSecondsAxis(120)).toBe('2 min');
    expect(fmtSecondsAxis(250)).toBe('4,2 min');
    expect(fmtSecondsAxis(3600)).toBe('1 h');
    expect(fmtSecondsAxis(5400)).toBe('1,5 h');
    expect(fmtSecondsAxis(NaN)).toBe('—');
    for (const v of [0, 7, 59, 61, 250, 750, 1000, 3599, 9000, 86400]) {
      expect(fmtSecondsAxis(v).length).toBeLessThanOrEqual(8); // never as long as "4 min 10 s"
    }
  });

  it('formats numbers and percentages with the Spanish decimal comma', () => {
    expect(fmtNumber(14.25, 1)).toBe('14,3'); // rounds half up in es
    expect(fmtPct(87.123, 1)).toBe('87,1 %');
    expect(fmtPct(40)).toBe('40 %');
  });

  it('rounds a maximum up to a 1/2/5 step', () => {
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(-4)).toBe(1);
    expect(niceCeil(0.7)).toBe(1);
    expect(niceCeil(1.2)).toBe(2);
    expect(niceCeil(3)).toBe(5);
    expect(niceCeil(5)).toBe(5);
    expect(niceCeil(6)).toBe(10);
    expect(niceCeil(87)).toBe(100);
    expect(niceCeil(1160)).toBe(2000);
  });

  it('builds evenly spaced ticks from zero to the maximum', () => {
    expect(ticks(100)).toEqual([0, 25, 50, 75, 100]);
    expect(ticks(10, 2)).toEqual([0, 5, 10]);
  });

  it('maps a domain onto a range, also inverted, and survives a flat domain', () => {
    const y = linear(0, 100, 200, 0);
    expect(y(0)).toBe(200);
    expect(y(100)).toBe(0);
    expect(y(50)).toBe(100);
    expect(linear(5, 5, 10, 20)(5)).toBe(10);
  });

  it('gives unique ids', () => {
    expect(uid('p')).not.toBe(uid('p'));
  });
});
