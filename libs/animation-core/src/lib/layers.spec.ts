import { hasLayersFeature, keyframeProblem, layerProblems, pageParts, touches, valueProblem } from './layers';
import type { Catalog, Layer, LayerItem, Script } from './model';

const part = (name: string, params: Catalog['parts'][number]['params'] = []) => ({ name, description: '', levels: ['simple'], costMs: 1, manual: false, params });
const catalog = {
  parts: [
    part('toggle', [{ name: 'label', type: 'string', default: 'x', maxLength: 6 }, { name: 'count', type: 'int', default: '3', min: 1, max: 5, animatable: true }]),
    part('stamp'),
    part('strip'),
    part('ticker'),
    part('a'), part('b'), part('c'), part('d'), part('e'), part('f'), part('g'),
  ],
} as unknown as Catalog;

const piece = (id: string, start: number, end: number, extra: object = {}) => ({ id, start, end, part: 'stamp', ...extra });
const item = (start: number, end: number, extra: Partial<LayerItem> = {}): LayerItem => ({ part: 'strip', start, end, ...extra });
const script = (layers: Layer[], pieces = [piece('p1', 0, 20), piece('p2', 20, 60)]): Script => ({ version: 1, pieces, layers });
const texts = (s: Script) => layerProblems(s, catalog).map((p) => p.text);

describe('layerProblems: the layers', () => {
  it('has nothing to say about a script with none, or with good ones', () => {
    expect(texts({ version: 1, pieces: [piece('p1', 0, 60)] })).toEqual([]);
    expect(texts(script([{ id: 'strip', items: [item(0, 30), item(30, 60, { part: 'ticker' })] }]))).toEqual([]);
  });

  it('refuses more than four layers', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, items: [] }));
    expect(texts(script(many))[0]).toBe('a script may have up to 4 layers, it has 5');
  });

  it('refuses an id that is not lower case, digits and dashes up to 24, and a repeated one', () => {
    expect(texts(script([{ id: 'Strip', items: [] }]))).toEqual(['layer "Strip": the id must be lower case letters, digits and dashes, up to 24 characters']);
    expect(texts(script([{ id: 'x'.repeat(25), items: [] }]))[0]).toContain('up to 24 characters');
    expect(texts(script([{ id: 'a', items: [] }, { id: 'a', items: [] }]))).toEqual(['layer "a": the id is repeated']);
  });

  it('refuses more than 32 items in a layer', () => {
    const items = Array.from({ length: 33 }, (_, i) => item(i, i + 0.5, { part: 'strip' }));
    expect(texts(script([{ id: 'a', items }]))[0]).toBe('layer "a": a layer may have up to 32 items, it has 33');
  });

  it('refuses a part that is not in the catalog, and parameters it would not take', () => {
    expect(texts(script([{ id: 'a', items: [item(0, 10, { part: 'nope' })] }]))).toEqual(['layer "a" item #1: the part "nope" is not in the catalog']);
    const bad = texts(script([{ id: 'a', items: [item(0, 10, { part: 'toggle', params: { nope: 1, label: 'too long!', count: 9 } })] }]));
    expect(bad).toEqual(['layer "a" item #1: part toggle has no parameter "nope"', 'layer "a" item #1: parameter label is longer than 6 characters', 'layer "a" item #1: parameter count is above 5']);
  });

  it('refuses an item that ends before it starts and one outside the song', () => {
    expect(texts(script([{ id: 'a', items: [item(10, 10)] }]))).toEqual(['layer "a" item #1 ends before it starts (10.00 s to 10.00 s)']);
    expect(texts(script([{ id: 'a', items: [item(50, 70)] }]))).toEqual(['layer "a" item #1 (50.00 s to 70.00 s) is outside the song (0 s to 60.00 s)']);
    expect(texts(script([{ id: 'a', items: [item(-1, 5)] }]))[0]).toContain('is outside the song');
  });

  it('refuses items of a layer that overlap, naming the one before', () => {
    expect(texts(script([{ id: 'a', items: [item(0, 20), item(19, 30, { part: 'ticker' })] }]))).toEqual(['layer "a" item #2 overlaps item #1 (items of a layer follow one another, in order)']);
    expect(texts(script([{ id: 'a', items: [item(0, 20), item(20, 30, { part: 'ticker' })] }]))).toEqual([]);
  });

  it('checks the keyframes of an item against its own length', () => {
    const ok = item(10, 20, { part: 'toggle', animate: { count: [{ t: 0, value: 1 }, { t: 10, value: 5 }] } });
    expect(texts(script([{ id: 'a', items: [ok] }]))).toEqual([]);
    const late = item(10, 20, { part: 'toggle', animate: { count: [{ t: 11, value: 1 }] } });
    expect(texts(script([{ id: 'a', items: [late] }]))).toEqual(['layer "a" item #1: keyframe #1 of "count" is at 11.00 s, outside the piece (0 s to 10.00 s)']);
  });

  it('says where each problem is', () => {
    const found = layerProblems(script([{ id: 'a', items: [item(0, 10), item(5, 8, { part: 'ticker' })] }]), catalog);
    expect(found[0]).toMatchObject({ layer: 'a', item: 1 });
  });
});

describe('layerProblems: the page of each piece', () => {
  it('refuses a part drawn twice: as the main part, as an extra or as another item', () => {
    expect(texts(script([{ id: 'a', items: [item(0, 30, { part: 'stamp' })] }]))).toEqual(['piece "p1" (#1): the part "stamp" is drawn twice (the main part and layer "a" item #1)', 'piece "p2" (#2): the part "stamp" is drawn twice (the main part and layer "a" item #1)']);
    const extras = script([{ id: 'a', items: [item(0, 10)] }], [piece('p1', 0, 60, { with: [{ part: 'strip' }] })]);
    expect(texts(extras)).toEqual(['piece "p1" (#1): the part "strip" is drawn twice (an extra part (with) and layer "a" item #1)']);
    const items = script([{ id: 'a', items: [item(0, 30)] }, { id: 'b', items: [item(10, 20)] }]);
    expect(texts(items)).toEqual(['piece "p1" (#1): the part "strip" is drawn twice (layer "a" item #1 and layer "b" item #1)']);
  });

  it('does not count an item that only touches a piece, or one outside it', () => {
    expect(texts(script([{ id: 'a', items: [item(0, 20, { part: 'stamp' })] }], [piece('p1', 0, 20, { part: 'toggle' }), piece('p2', 20, 60)]))).toEqual([]);
  });

  it('refuses a page that would draw more than eight parts', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((p, i) => item(i, i + 0.5, { part: p }));
    const layers = items.map((it, i) => ({ id: `l${i}`, items: [{ ...it, start: 0, end: 60 }] }));
    expect(layers).toHaveLength(7);
    expect(texts(script(layers.slice(0, 4), [piece('p1', 0, 60, { with: [{ part: 'ticker' }, { part: 'toggle' }, { part: 'g' }] })]))).toEqual([]);
    const nine = script([{ id: 'a', items: ['a', 'b', 'c', 'd'].map((p, i) => item(i * 10, i * 10 + 10, { part: p })) }, { id: 'b', items: [{ part: 'e', start: 0, end: 60 }] }, { id: 'c', items: [{ part: 'f', start: 0, end: 60 }] }], [piece('p1', 0, 60, { with: [{ part: 'ticker' }, { part: 'toggle' }, { part: 'g' }] })]);
    expect(texts(nine)).toEqual(['piece "p1" (#1): its page would draw 10 parts, the most is 8']);
  });
});

describe('the helpers', () => {
  it('says which parts a page draws, in drawing order', () => {
    const s = script([{ id: 'a', items: [item(0, 30)] }, { id: 'b', items: [item(10, 15, { part: 'ticker' })] }], [piece('p1', 0, 20, { with: [{ part: 'toggle' }] }), piece('p2', 20, 60)]);
    expect(pageParts(s, 0)).toEqual(['stamp', 'toggle', 'strip', 'ticker']);
    expect(pageParts(s, 1)).toEqual(['stamp', 'strip']);
    expect(pageParts(s, 9)).toEqual([]);
  });

  it('says an item touches a piece when they share more than a rounding', () => {
    expect(touches(item(30, 60), { start: 20, end: 40 })).toBe(true);
    expect(touches(item(40, 60), { start: 20, end: 40 })).toBe(false);
    expect(touches(item(39.995, 60), { start: 20, end: 40 })).toBe(false);
  });

  it('reads the feature from the catalog', () => {
    expect(hasLayersFeature({ features: ['animate', 'layers'] })).toBe(true);
    expect(hasLayersFeature({ features: ['animate'] })).toBe(false);
    expect(hasLayersFeature(null)).toBe(false);
  });

  it('says why a value is not one a parameter takes', () => {
    const def = { name: 'n', type: 'int' as const, default: '1', min: 1, max: 5 };
    expect(valueProblem(def, 3)).toBe('');
    expect(valueProblem(def, 2.5)).toBe('is not a whole number');
    expect(valueProblem(def, 0)).toBe('is below 1');
    expect(valueProblem({ name: 'b', type: 'bool', default: 'false' }, 'x')).toBe('is not true or false');
    expect(valueProblem({ name: 'e', type: 'enum', default: 'up', options: ['up', 'down'] }, 'sideways')).toBe('is not one of up, down');
  });

  it('says what is wrong with keyframes in the server\'s words, with where they are', () => {
    const toggle = catalog.parts[0];
    expect(keyframeProblem('layer "a" item #1', toggle, { nope: [{ t: 0, value: 1 }] }, 10)).toBe('layer "a" item #1: the part "toggle" has no parameter "nope"');
    expect(keyframeProblem('layer "a" item #1', toggle, { label: [{ t: 0, value: 'x' }] }, 10)).toBe('layer "a" item #1: the parameter "label" of "toggle" cannot be animated');
    expect(keyframeProblem('piece p1', toggle, { count: [] }, 10)).toBe('piece p1: the animation of "count" has no keyframe');
    expect(keyframeProblem('piece p1', toggle, undefined, 10)).toBe('');
  });
});
