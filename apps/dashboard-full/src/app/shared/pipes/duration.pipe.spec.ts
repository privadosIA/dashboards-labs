import { DurationPipe } from './duration.pipe';

describe('DurationPipe fine', () => {
  const pipe = new DurationPipe();
  it('keeps the tenths of anything under 10 s, and the clock above', () => {
    expect(pipe.transform(250, true)).toBe('0,3 s'); // tests run in Spanish
    expect(pipe.transform(4105, true)).toBe('4,1 s');
    expect(pipe.transform(12_000, true)).toBe('0:12');
    expect(pipe.transform(250)).toBe('0:00'); // the default is unchanged
  });
});
