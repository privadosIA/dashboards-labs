import { GENERATORS, resolveGenerator, usableGenerators } from './music-generator';

describe('music generators of the Create page', () => {
  const all = { ace: true, heartmula: true, diffrhythm2: true };

  it('lists the usable ones with ACE-Step first', () => {
    expect(usableGenerators(all, false)).toEqual(['ace-step', 'heartmula', 'diffrhythm2']);
    expect(usableGenerators({ ace: false, heartmula: true, diffrhythm2: true }, false)).toEqual(['heartmula', 'diffrhythm2']);
  });

  it('leaves only the generator that follows a reference when there is one', () => {
    expect(usableGenerators(all, true)).toEqual(['ace-step']);
    expect(usableGenerators({ ace: false, heartmula: true, diffrhythm2: false }, true)).toEqual([]);
  });

  it('resolves Automatic to the first usable generator and a choice to itself', () => {
    expect(resolveGenerator('auto', ['heartmula', 'diffrhythm2'])).toBe('heartmula');
    expect(resolveGenerator('diffrhythm2', ['ace-step', 'diffrhythm2'])).toBe('diffrhythm2');
    expect(resolveGenerator('auto', [])).toBe('ace-step');
  });

  it('falls back to the first usable one when the choice is not usable any more', () => {
    expect(resolveGenerator('heartmula', ['ace-step'])).toBe('ace-step');
  });

  it('knows what each generator cannot do', () => {
    expect(GENERATORS['diffrhythm2'].instrumental).toBe(false);
    expect(GENERATORS['diffrhythm2'].englishLyrics).toBe(true);
    expect(GENERATORS['heartmula'].vocabulary).toBe(true);
    expect(GENERATORS['ace-step'].reference).toBe(true);
  });
});
