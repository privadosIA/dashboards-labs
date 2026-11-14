import type { Catalog, Design, Part, Script, SongMap } from '@lab/animation-core';

import { checkDoc, type Warning } from './checks';
import type { Doc } from './editor-store';

const design: Design = { dark: '#000000', light: '#ffffff', accent: '#ff0000', display: 'grotesk', body: 'grotesk', defaultMode: 'dark', modes: {}, concept: '' };
const part = (name: string, extra: Partial<Part> = {}): Part => ({ name, description: '', levels: ['simple', 'medium', 'advanced'], costMs: 0, manual: false, params: [], ...extra });
const catalog = {
  parts: [
    part('toggle', {
      params: [
        { name: 'count', type: 'int', default: '3', min: 1, max: 5 },
        { name: 'ratio', type: 'number', default: '1', min: 0, max: 2 },
        { name: 'label', type: 'string', default: 'a', maxLength: 4 },
        { name: 'on', type: 'bool', default: 'true' },
        { name: 'shape', type: 'enum', default: 'round', options: ['round', 'square'] },
      ],
    }),
    part('counter'),
    part('pulse-ring'),
    part('fancy', { levels: ['advanced'] }),
  ],
} as unknown as Catalog;
const map = {
  duration: 30,
  beats: [],
  beatBase: 0,
  sections: [],
  words: [
    { text: 'walking', start: 1, end: 2, line: 0 },
    { text: 'through', start: 2, end: 3, line: 0 },
  ],
} as unknown as SongMap;
const doc = (pieces: Script['pieces']): Doc => ({ design, script: { version: 1, pieces } });
const base = (extra: object = {}) => ({ id: 'p1', start: 0, end: 30, part: 'toggle', ...extra });
const kinds = (warnings: Warning[]) => warnings.map((w) => w.kind);

describe('checkDoc', () => {
  it('has nothing to say about a script that is fine', () => {
    expect(checkDoc(doc([base({ params: { count: 3, label: 'ok' }, with: [{ part: 'counter' }], lines: [{ line: 0, keyword: 'walking' }] })]), map, catalog, 'medium')).toEqual([]);
  });

  it('says when the script does not cover the song', () => {
    expect(kinds(checkDoc(doc([base({ end: 20 })]), map, catalog, 'medium'))).toEqual(['coverage']);
    expect(kinds(checkDoc(doc([base({ end: 15 }), base({ id: 'p2', start: 16, end: 30 })]), map, catalog, 'medium'))).toEqual(['coverage']);
  });

  it('names a part that is not in the catalog, in the main block and in an extra', () => {
    const w = checkDoc(doc([base({ part: 'ghost', with: [{ part: 'nope' }] })]), map, catalog, 'medium');
    expect(w.map((x) => [x.kind, x.piece, x.extra, x.part])).toEqual([['unknown-part', 'p1', undefined, 'ghost'], ['unknown-part', 'p1', 0, 'nope']]);
  });

  it('checks each parameter against its type, limits and options', () => {
    const w = checkDoc(doc([base({ params: { count: 9, ratio: 'x', label: 'too long', on: 'yes', shape: 'star' } })]), map, catalog, 'medium');
    expect(w.map((x) => [x.param, x.kind, x.limit])).toEqual([['count', 'param-range', 5], ['ratio', 'param-type', undefined], ['label', 'param-length', 4], ['on', 'param-type', undefined], ['shape', 'param-option', undefined]]);
    expect(kinds(checkDoc(doc([base({ params: { count: 2.5 } })]), map, catalog, 'medium'))).toEqual(['param-type']);
    expect(kinds(checkDoc(doc([base({ params: { count: 0 } })]), map, catalog, 'medium'))).toEqual(['param-range']);
  });

  it('checks the parameters of an extra part too, saying which one', () => {
    const w = checkDoc(doc([base({ part: 'pulse-ring', with: [{ part: 'counter' }, { part: 'toggle', params: { count: 7 } }] })]), map, catalog, 'medium');
    expect(w.map((x) => [x.kind, x.extra])).toEqual([['param-range', 1]]);
  });

  it('refuses more than three extras and a repeated part', () => {
    const four = checkDoc(doc([base({ with: [{ part: 'counter' }, { part: 'pulse-ring' }, { part: 'fancy' }, { part: 'toggle' }] })]), map, catalog, 'advanced');
    expect(kinds(four)).toContain('extras-count');
    const again = checkDoc(doc([base({ with: [{ part: 'counter' }, { part: 'counter' }, { part: 'toggle' }] })]), map, catalog, 'medium');
    expect(again.filter((x) => x.kind === 'extras-repeat').map((x) => x.extra)).toEqual([1, 2]);
  });

  it('wants the keyword and the hit word to be words of the lines', () => {
    const w = checkDoc(doc([base({ lines: [{ line: 0, keyword: 'quiet' }], hit: { word: 'town', at: 3, length: 1 } })]), map, catalog, 'medium');
    expect(w.map((x) => [x.kind, x.text])).toEqual([['keyword', 'quiet'], ['hit-word', 'town']]);
    expect(checkDoc(doc([base({ lines: [{ text: 'my own words', keyword: 'own' }], hit: { word: 'words', at: 3, length: 1 } })]), map, catalog, 'medium')).toEqual([]);
  });

  it('says as information that the level does not support a part', () => {
    const w = checkDoc(doc([base({ part: 'fancy' })]), map, catalog, 'simple');
    expect(w).toEqual([{ kind: 'level', severity: 'info', piece: 'p1', part: 'fancy', text: 'simple' }]);
  });
});

describe('checkDoc: keyframes the server does not take', () => {
  const withKeyframes = (): Doc => ({ design, script: { version: 1, pieces: [{ id: 'p1', start: 0, end: 20, part: 'toggle', params: {}, animate: { count: [{ t: 0, value: 1 }] } }] } });
  const feature = (features: string[]): Catalog => ({ ...catalog, features }) as Catalog;

  it('is a blocking error, once and for the document, when the catalog does not say animate', () => {
    const found = checkDoc(withKeyframes(), map, feature([]), 'simple').filter((w) => w.kind === 'animate-unsupported');
    expect(found).toEqual([{ kind: 'animate-unsupported', severity: 'error' }]);
  });

  it('is not there when the server says it takes them, or when nothing is animated', () => {
    expect(checkDoc(withKeyframes(), map, feature(['animate']), 'simple').some((w) => w.kind === 'animate-unsupported')).toBe(false);
    const plain: Doc = { design, script: { version: 1, pieces: [{ id: 'p1', start: 0, end: 20, part: 'toggle', params: {} }] } };
    expect(checkDoc(plain, map, feature([]), 'simple').some((w) => w.kind === 'animate-unsupported')).toBe(false);
  });

  it('counts the keyframes of an extra part too', () => {
    const doc: Doc = { design, script: { version: 1, pieces: [{ id: 'p1', start: 0, end: 20, part: 'toggle', params: {}, with: [{ part: 'toggle', animate: { on: [{ t: 0, value: true }] } }] }] } };
    expect(checkDoc(doc, map, feature([]), 'simple').some((w) => w.kind === 'animate-unsupported')).toBe(true);
  });
});

describe('checkDoc: layers', () => {
  const feature = (features: string[]): Catalog => ({ ...catalog, features }) as Catalog;
  const layered = (items: NonNullable<Script['layers']>[number]['items'], pieces: Script['pieces'] = [{ id: 'p1', start: 0, end: 30, part: 'toggle', params: {} }]): Doc => ({ design, script: { version: 1, pieces, layers: [{ id: 'a', items }] } });

  it('is a blocking error, once and for the document, when the catalog does not say layers; and says nothing else about them', () => {
    const found = checkDoc(layered([{ part: 'counter', start: 1, end: 5 }]), map, feature([]), 'simple').filter((w) => w.kind === 'layers-unsupported' || w.kind === 'layer-problem');
    expect(found).toEqual([{ kind: 'layers-unsupported', severity: 'error' }]);
  });

  it('is not there when the server says it takes them, or when there are none', () => {
    expect(checkDoc(layered([{ part: 'counter', start: 1, end: 5 }]), map, feature(['layers']), 'simple').some((w) => w.kind === 'layers-unsupported')).toBe(false);
    const plain: Doc = { design, script: { version: 1, pieces: [{ id: 'p1', start: 0, end: 30, part: 'toggle', params: {} }] } };
    expect(checkDoc(plain, map, feature([]), 'simple').some((w) => w.kind === 'layers-unsupported')).toBe(false);
  });

  it('marks what the server would refuse, in its words, on the layer and the item, and the piece when it is about its page', () => {
    const found = checkDoc(layered([{ part: 'counter', start: 1, end: 5 }, { part: 'counter', start: 4, end: 8 }, { part: 'toggle', start: 10, end: 12 }]), map, feature(['layers']), 'simple').filter((w) => w.kind === 'layer-problem');
    expect(found).toEqual([
      { kind: 'layer-problem', severity: 'warning', layer: 'a', item: 1, text: 'layer "a" item #2 overlaps item #1 (items of a layer follow one another, in order)' },
      { kind: 'layer-problem', severity: 'warning', piece: 'p1', layer: 'a', item: 1, text: 'piece "p1" (#1): the part "counter" is drawn twice (layer "a" item #1 and layer "a" item #2)' },
      { kind: 'layer-problem', severity: 'warning', piece: 'p1', layer: 'a', item: 2, text: 'piece "p1" (#1): the part "toggle" is drawn twice (the main part and layer "a" item #3)' },
    ]);
  });
});
