import { scriptFromStyle } from './script-from-style';
import type { Catalog, Part } from '@lab/animation-core';

const part = (name: string, levels: Part['levels'] = ['simple', 'medium', 'advanced'], extra: Partial<Part> = {}): Part => ({ name, description: name, levels, costMs: 10, manual: false, params: [], ...extra });
const catalog = (parts: Part[]): Catalog => ({ parts, characters: [], backgrounds: [], levels: ['simple', 'medium', 'advanced'], styles: ['typographic', 'illustrated'], frameRates: [24, 30, 60], actions: [], fonts: [], modes: ['dark', 'light'], features: [] });
const cat = catalog([part('a'), part('b'), part('c'), part('d'), part('only-advanced', ['advanced']), part('manual-one', ['simple', 'medium', 'advanced'], { manual: true })]);
const design = { modes: {} as Record<string, 'dark' | 'light'> };

describe('scriptFromStyle', () => {
  it('uses the four parts of a style in turn, each for the rhythm, over a song of that many slots', () => {
    const { script } = scriptFromStyle({ rhythm: 8, parts: ['a', 'b', 'c', 'd'], design }, 32, cat, 'medium');
    expect(script.version).toBe(1);
    expect(script.pieces.map((p) => [p.part, p.start, p.end])).toEqual([['a', 0, 8], ['b', 8, 16], ['c', 16, 24], ['d', 24, 32]]);
    expect(script.pieces.map((p) => p.id)).toEqual(['s1', 's2', 's3', 's4']);
  });

  it('cycles when the song has more slots than the style has parts, and the last slot takes the remainder', () => {
    const { script } = scriptFromStyle({ rhythm: 10, parts: ['a', 'b'], design }, 47, cat, 'medium');
    expect(script.pieces.map((p) => p.part)).toEqual(['a', 'b', 'a', 'b']);
    expect(script.pieces.map((p) => [p.start, p.end])).toEqual([[0, 10], [10, 20], [20, 30], [30, 47]]);
  });

  it('covers the song with no gaps and no overlap, whatever the rhythm', () => {
    for (const [rhythm, seconds] of [[2, 3], [5, 135], [15, 14], [7.5, 100]] as const) {
      const { script } = scriptFromStyle({ rhythm, parts: ['a', 'b', 'c'], design }, seconds, cat, 'medium');
      expect(script.pieces[0].start).toBe(0);
      expect(script.pieces.at(-1)!.end).toBeCloseTo(Math.max(seconds, script.pieces.at(-1)!.start + 1), 3);
      script.pieces.slice(1).forEach((p, i) => expect(p.start).toBeCloseTo(script.pieces[i].end, 3));
    }
  });

  it('makes one slot when the song is shorter than the rhythm', () => {
    const { script } = scriptFromStyle({ rhythm: 15, parts: ['a'], design }, 6, cat, 'simple');
    expect(script.pieces).toHaveLength(1);
    expect(script.pieces[0]).toMatchObject({ start: 0, end: 6 });
  });

  it('starts each part with the default parameters of the catalog', () => {
    const withParams = catalog([part('a', undefined, { params: [{ name: 'stripes', type: 'int', default: '12' }, { name: 'label', type: 'string', default: 'hi' }, { name: 'odd', type: 'int', default: 'x' }] })]);
    const { script } = scriptFromStyle({ rhythm: 5, parts: ['a'], design }, 5, withParams, 'simple');
    expect(script.pieces[0].params).toEqual({ stripes: 12, label: 'hi' });
  });

  it('swaps a part the level does not draw for one it does, and says so', () => {
    const { script, replacements } = scriptFromStyle({ rhythm: 5, parts: ['only-advanced', 'a'], design }, 20, cat, 'simple');
    expect(script.pieces.map((p) => p.part)).toEqual(['a', 'a', 'a', 'a']);
    expect(replacements).toEqual([{ from: 'only-advanced', to: 'a' }]);
  });

  it('keeps that part at the level that draws it', () => {
    const { script, replacements } = scriptFromStyle({ rhythm: 5, parts: ['only-advanced', 'a'], design }, 10, cat, 'advanced');
    expect(script.pieces.map((p) => p.part)).toEqual(['only-advanced', 'a']);
    expect(replacements).toEqual([]);
  });

  it('uses the usual parts, and never the manual ones, when the style names none or names parts nobody has', () => {
    const { script } = scriptFromStyle({ rhythm: 5, parts: [], design }, 20, cat, 'medium');
    expect(script.pieces.map((p) => p.part)).toEqual(['a', 'b', 'c', 'd']);
    const unknown = scriptFromStyle({ rhythm: 5, parts: ['ghost'], design }, 10, cat, 'medium');
    expect(unknown.script.pieces.map((p) => p.part)).toEqual(['a', 'b']);
  });

  it('gives each slot the section and mode the design has for where it starts', () => {
    const sections = [{ tag: 'Intro', start: 0, end: 10 }, { tag: 'Chorus', start: 10, end: 30 }];
    const { script } = scriptFromStyle({ rhythm: 10, parts: ['a', 'b', 'c'], design: { modes: { intro: 'dark', chorus: 'light' } } }, 30, cat, 'medium', sections);
    expect(script.pieces.map((p) => [p.section, p.mode])).toEqual([['intro', 'dark'], ['chorus', 'light'], ['chorus', 'light']]);
  });
});
