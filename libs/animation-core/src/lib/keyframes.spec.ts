import { evaluateKeyframes, easeShare, hasAnimateFeature, normaliseKeyframes, splitKeyframes } from './keyframes';
import type { Keyframe } from './model';

const kf = (t: number, value: Keyframe['value'], ease?: Keyframe['ease']): Keyframe => ({ t, value, ...(ease ? { ease } : {}) });

describe('evaluateKeyframes', () => {
  it('is the first value before the first keyframe and the last after the last', () => {
    const k = [kf(1, 10), kf(3, 30)];
    expect(evaluateKeyframes(k, 0)).toBe(10);
    expect(evaluateKeyframes(k, 1)).toBe(10);
    expect(evaluateKeyframes(k, 3)).toBe(30);
    expect(evaluateKeyframes(k, 99)).toBe(30);
  });

  it('interpolates a number linearly by default', () => {
    expect(evaluateKeyframes([kf(0, 0, 'linear'), kf(4, 100, 'linear')], 1)).toBe(25);
    expect(evaluateKeyframes([kf(0, 0), kf(4, 100)], 3)).toBe(75);
  });

  it('uses the ease of the EARLIER keyframe for the segment that leaves it', () => {
    // half the way: in = p^3 = 1/8, out = 1 - (1-p)^3 = 7/8, in-out at one half = 1/2
    expect(evaluateKeyframes([kf(0, 0, 'in'), kf(4, 100, 'linear')], 2)).toBe(12.5);
    expect(evaluateKeyframes([kf(0, 0, 'linear'), kf(4, 100, 'in')], 2)).toBe(50);
    expect(evaluateKeyframes([kf(0, 0, 'out'), kf(4, 100)], 2)).toBe(87.5);
    expect(evaluateKeyframes([kf(0, 0, 'in-out'), kf(4, 100)], 2)).toBe(50);
    expect(evaluateKeyframes([kf(0, 0, 'in-out'), kf(4, 100)], 1)).toBeCloseTo(100 * 4 * 0.25 ** 3, 10);
    expect(evaluateKeyframes([kf(0, 0, 'in-out'), kf(4, 100)], 3)).toBeCloseTo(100 * (1 - Math.pow(-2 * 0.75 + 2, 3) / 2), 10);
  });

  it('finds the right segment among several', () => {
    const k = [kf(0, 0), kf(2, 10), kf(4, 0, 'step'), kf(6, 50)];
    expect(evaluateKeyframes(k, 1)).toBe(5);
    expect(evaluateKeyframes(k, 3)).toBe(5);
    expect(evaluateKeyframes(k, 4)).toBe(0);
    expect(evaluateKeyframes(k, 5)).toBe(0);
    expect(evaluateKeyframes(k, 6)).toBe(50);
  });

  it('holds the earlier value under step, and for anything that is not a number', () => {
    expect(evaluateKeyframes([kf(0, 'up', 'step'), kf(2, 'down')], 1.9)).toBe('up');
    expect(evaluateKeyframes([kf(0, 'up', 'step'), kf(2, 'down')], 2)).toBe('down');
    expect(evaluateKeyframes([kf(0, true), kf(2, false)], 1)).toBe(true);
    expect(evaluateKeyframes([kf(0, 'a'), kf(2, 7)], 1)).toBe('a');
    expect(evaluateKeyframes([kf(0, 0, 'step'), kf(2, 9)], 1.99)).toBe(0);
  });

  it('rounds the numbers of a whole-number parameter', () => {
    expect(evaluateKeyframes([kf(0, 0), kf(3, 10)], 1, true)).toBe(3);
    expect(evaluateKeyframes([kf(0, 0), kf(3, 10)], 2, true)).toBe(7);
    expect(evaluateKeyframes([kf(0, 0.4)], 5, true)).toBe(0);
    expect(evaluateKeyframes([kf(0, 0), kf(3, 10)], 1, false)).toBeCloseTo(10 / 3, 10);
  });

  it('has nothing to say without keyframes', () => {
    expect(evaluateKeyframes([], 1)).toBeUndefined();
  });

  it('shares the formulas of the server (the ease shares)', () => {
    expect(easeShare('linear', 0.3)).toBe(0.3);
    expect(easeShare(undefined, 0.3)).toBe(0.3);
    expect(easeShare('in', 0.5)).toBe(0.125);
    expect(easeShare('out', 0.5)).toBe(0.875);
    expect(easeShare('in-out', 0.25)).toBeCloseTo(0.0625, 10);
    expect(easeShare('in-out', 0.75)).toBeCloseTo(0.9375, 10);
  });
});

describe('normaliseKeyframes', () => {
  it('puts them in order, to three decimals, inside the piece, none twice at one second', () => {
    expect(normaliseKeyframes([kf(5, 'b'), kf(-1, 'a'), kf(2.00049, 'm'), kf(2.0004, 'dup'), kf(99, 'z')], 8)).toEqual([kf(0, 'a'), kf(2, 'm'), kf(5, 'b'), kf(8, 'z')]);
  });
});

describe('splitKeyframes', () => {
  it('keeps the picture for a linear parameter: the value at the cut on both edges', () => {
    const { before, after } = splitKeyframes([kf(0, 0, 'linear'), kf(8, 100, 'linear')], 2);
    expect(before).toEqual([kf(0, 0, 'linear'), kf(2, 25)]);
    expect(after).toEqual([kf(0, 25, 'linear'), kf(6, 100, 'linear')]);
  });

  it('keeps every keyframe on each side and carries the segment\'s ease into the second half', () => {
    const { before, after } = splitKeyframes([kf(0, 0), kf(2, 10, 'out'), kf(6, 50, 'in'), kf(8, 0)], 4);
    expect(before.map((k) => k.t)).toEqual([0, 2, 4]);
    expect(after.map((k) => k.t)).toEqual([0, 2, 4]);
    expect(after[0]).toMatchObject({ t: 0, ease: 'out' });
    expect(after[1]).toEqual(kf(2, 50, 'in'));
    expect(before[2].value).toBe(after[0].value);
  });

  it('a cut on a keyframe puts that keyframe on both sides', () => {
    const { before, after } = splitKeyframes([kf(0, 0), kf(4, 40, 'in'), kf(8, 80)], 4);
    expect(before).toEqual([kf(0, 0), kf(4, 40)]);
    expect(after).toEqual([kf(0, 40, 'in'), kf(4, 80)]);
  });

  it('before the first keyframe the parameter is constant, and after the last it stays', () => {
    const early = splitKeyframes([kf(3, 7), kf(5, 9)], 1);
    expect(early.before).toEqual([kf(1, 7)]);
    expect(early.after.map((k) => [k.t, k.value])).toEqual([[0, 7], [2, 7], [4, 9]]);
    const late = splitKeyframes([kf(1, 7), kf(2, 9)], 6);
    expect(late.before.map((k) => [k.t, k.value])).toEqual([[1, 7], [2, 9], [6, 9]]);
    expect(late.after).toEqual([kf(0, 9)]);
  });

  it('rounds the value at the cut of a whole-number parameter', () => {
    const { before, after } = splitKeyframes([kf(0, 0), kf(3, 10)], 1, true);
    expect(before.at(-1)?.value).toBe(3);
    expect(after[0].value).toBe(3);
  });
});

describe('hasAnimateFeature', () => {
  it('reads the catalog', () => {
    expect(hasAnimateFeature({ features: ['animate'] })).toBe(true);
    expect(hasAnimateFeature({ features: [] })).toBe(false);
    expect(hasAnimateFeature(null)).toBe(false);
  });
});
