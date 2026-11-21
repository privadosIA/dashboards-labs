import { motionPartsTexts } from './texts';

describe('the texts of the form of a part', () => {
  it('are in Spanish and in English, with the same keys', () => {
    const es = motionPartsTexts('es');
    const en = motionPartsTexts('en');
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    expect(es.noParams).toBe('Esta parte no tiene parámetros.');
    expect(en.noParams).toBe('This part has no parameters.');
  });

  it('give every message the same placeholders in both languages', () => {
    const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    const es = motionPartsTexts('es');
    const en = motionPartsTexts('en');
    for (const key of Object.keys(es) as (keyof typeof es)[]) expect(holes(es[key]), key).toBe(holes(en[key]));
  });

  it('are English for a language the library has no texts for', () => {
    expect(motionPartsTexts('fr')).toBe(motionPartsTexts('en'));
  });
});
