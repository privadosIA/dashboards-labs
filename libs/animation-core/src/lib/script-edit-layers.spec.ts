import type { Catalog, Keyframe, LayerItem, Script } from './model';
import {
  DEFAULT_ITEM_SECONDS,
  addItem,
  addItemKeyframe,
  addLayer,
  addLayerWithItem,
  clearLayers,
  duplicateItem,
  editItemKeyframe,
  hasLayers,
  itemKeyframes,
  layerEditProblem,
  moveItem,
  moveItemKeyframe,
  moveLayer,
  newItemRange,
  newLayerId,
  removeItem,
  removeItemKeyframe,
  removeLayer,
  resizeItem,
  setItemKeyframes,
  setItemParams,
  setItemPart,
  setItemRange,
  splitPiece,
} from './script-edit';

const part = (name: string, params: Catalog['parts'][number]['params'] = []) => ({ name, description: '', levels: ['simple'], costMs: 1, manual: false, params });
const catalog = { parts: [part('toggle', [{ name: 'count', type: 'int', default: '3', min: 1, max: 5, animatable: true }]), part('stamp'), part('strip'), part('ticker')] } as unknown as Catalog;
const piece = (id: string, start: number, end: number, extra: object = {}) => ({ id, start, end, part: 'stamp', ...extra });
const base = (): Script => ({ version: 1, pieces: [piece('p1', 0, 20), piece('p2', 20, 60)] });
const item = (start: number, end: number, extra: Partial<LayerItem> = {}): LayerItem => ({ part: 'strip', start, end, ...extra });
const withLayer = (items: LayerItem[], id = 'a'): Script => ({ ...base(), layers: [{ id, items }] });
const kf = (t: number, value: Keyframe['value']): Keyframe => ({ t, value });

describe('layers', () => {
  it('adds an empty layer on top with a free id, up to four, and takes the field away when the last goes', () => {
    let s = addLayer(base());
    expect(s.layers).toEqual([{ id: 'layer-1', items: [] }]);
    s = addLayer(s);
    expect(s.layers!.map((l) => l.id)).toEqual(['layer-1', 'layer-2']);
    expect(newLayerId(removeLayer(s, 'layer-1'))).toBe('layer-1');
    s = addLayer(addLayer(s));
    expect(addLayer(s)).toBe(s);
    expect(addLayer(base(), 'Bad Id')).toEqual(base());
    expect(addLayer(s, 'layer-1')).toBe(s);
    const none = removeLayer(addLayer(base()), 'layer-1');
    expect('layers' in none).toBe(false);
    expect(hasLayers(none)).toBe(false);
  });

  it('keeps the order of drawing and moves a layer in it', () => {
    let s = addLayer(addLayer(addLayer(base())));
    s = moveLayer(s, 'layer-3', 0);
    expect(s.layers!.map((l) => l.id)).toEqual(['layer-3', 'layer-1', 'layer-2']);
    expect(moveLayer(s, 'layer-3', 0)).toBe(s);
    expect(moveLayer(s, 'nope', 1)).toBe(s);
    expect(moveLayer(s, 'layer-1', 7)).toBe(s);
  });

  it('does not change the script it was given', () => {
    const before = withLayer([item(0, 10)]);
    const copy = JSON.stringify(before);
    moveItem(before, 'a', 0, 20);
    removeItem(before, 'a', 0);
    expect(JSON.stringify(before)).toBe(copy);
  });

  it('clears every layer', () => {
    expect('layers' in clearLayers(withLayer([item(0, 10)]))).toBe(false);
    const plain = base();
    expect(clearLayers(plain)).toBe(plain);
  });
});

describe('where a new item goes', () => {
  it('starts where it is dropped and is as long as the room after it, at most the default', () => {
    expect(newItemRange(base(), null, 10)).toEqual({ start: 10, end: 10 + DEFAULT_ITEM_SECONDS });
    expect(newItemRange(withLayer([item(15, 30)]), 'a', 10)).toEqual({ start: 10, end: 15 });
    expect(newItemRange(base(), null, 58)).toEqual({ start: 58, end: 60 });
  });

  it('is nowhere inside another item or with less than half a second of room', () => {
    expect(newItemRange(withLayer([item(5, 30)]), 'a', 10)).toBeNull();
    expect(newItemRange(withLayer([item(10.2, 30)]), 'a', 10)).toBeNull();
    expect(newItemRange(base(), null, 59.8)).toBeNull();
  });

  it('holds the drop point inside the song', () => {
    expect(newItemRange(base(), null, -4)?.start).toBe(0);
    expect(newItemRange(base(), null, 900)).toBeNull();
  });
});

describe('adding an item', () => {
  it('keeps the items of a layer in time order', () => {
    const s = addItem(withLayer([item(30, 40)]), 'a', item(0, 10, { part: 'ticker' }));
    expect(s.layers![0].items.map((i) => [i.start, i.part])).toEqual([[0, 'ticker'], [30, 'strip']]);
  });

  it.each([
    ['overlaps another', item(35, 50)],
    ['lies outside the song', item(50, 70)],
    ['is shorter than half a second', item(5, 5.2)],
    ['starts before the song', item(-1, 5)],
  ])('refuses an item that %s', (_name, bad) => {
    const s = withLayer([item(30, 40)]);
    expect(addItem(s, 'a', bad)).toBe(s);
  });

  it('refuses a layer that is not there, and a layer with 32 items', () => {
    const s = withLayer([item(0, 1)]);
    expect(addItem(s, 'nope', item(10, 20))).toBe(s);
    const full = withLayer(Array.from({ length: 32 }, (_, i) => item(i, i + 0.5)));
    expect(addItem(full, 'a', item(40, 50))).toBe(full);
  });

  it('refuses, with the catalog, a part its page already draws, and says why', () => {
    const s = withLayer([]);
    const same = addItem(s, 'a', item(0, 10, { part: 'stamp' }), catalog);
    expect(same).toBe(s);
    expect(layerEditProblem(s, { ...s, layers: [{ id: 'a', items: [item(0, 10, { part: 'stamp' })] }] }, catalog)).toBe('piece "p1" (#1): the part "stamp" is drawn twice (the main part and layer "a" item #1)');
    expect(addItem(s, 'a', item(0, 10), catalog).layers![0].items).toHaveLength(1);
  });

  it('makes a layer with it, up to four layers', () => {
    const s = addLayerWithItem(base(), item(0, 10), catalog);
    expect(s.layers).toEqual([{ id: 'layer-1', items: [item(0, 10)] }]);
    const four = addLayer(addLayer(addLayer(addLayer(base()))));
    expect(addLayerWithItem(four, item(0, 10))).toBe(four);
    expect(addLayerWithItem(base(), item(50, 70))).toEqual(base());
  });
});

describe('moving and resizing an item', () => {
  const s = (): Script => withLayer([item(0, 10), item(20, 30, { part: 'ticker' }), item(40, 50)]);

  it('moves an item keeping its length, held between its neighbours and the song', () => {
    expect(moveItem(s(), 'a', 1, 22).layers![0].items[1]).toMatchObject({ start: 22, end: 32 });
    expect(moveItem(s(), 'a', 1, 99).layers![0].items[1]).toMatchObject({ start: 30, end: 40 });
    expect(moveItem(s(), 'a', 1, -5).layers![0].items[1]).toMatchObject({ start: 10, end: 20 });
    expect(moveItem(s(), 'a', 2, 99).layers![0].items[2]).toMatchObject({ start: 50, end: 60 });
  });

  it('stays the same when it cannot move', () => {
    const tight = withLayer([item(0, 10), item(10, 20, { part: 'ticker' }), item(20, 30)]);
    expect(moveItem(tight, 'a', 1, 12)).toBe(tight);
    expect(moveItem(s(), 'a', 7, 12)).toEqual(s());
    expect(moveItem(s(), 'nope', 0, 12)).toEqual(s());
  });

  it('resizes by either end, held between its neighbours, at least half a second long', () => {
    expect(resizeItem(s(), 'a', 1, 'end', 38).layers![0].items[1]).toMatchObject({ start: 20, end: 38 });
    expect(resizeItem(s(), 'a', 1, 'end', 99).layers![0].items[1].end).toBe(40);
    expect(resizeItem(s(), 'a', 1, 'end', 20.1).layers![0].items[1].end).toBe(20.5);
    expect(resizeItem(s(), 'a', 1, 'start', 5).layers![0].items[1].start).toBe(10);
    expect(resizeItem(s(), 'a', 1, 'start', 29.9).layers![0].items[1].start).toBe(29.5);
    expect(resizeItem(s(), 'a', 1, 'start', 20)).toEqual(s());
  });

  it('sets both ends at once', () => {
    expect(setItemRange(s(), 'a', 1, 22, 28).layers![0].items[1]).toMatchObject({ start: 22, end: 28 });
    expect(setItemRange(s(), 'a', 1, 22, 99).layers![0].items[1]).toMatchObject({ start: 22, end: 40 });
  });

  it('refuses, with the catalog, a move that would put its part on a page that draws it', () => {
    const t: Script = { ...base(), pieces: [piece('p1', 0, 20), piece('p2', 20, 60, { part: 'strip' })], layers: [{ id: 'a', items: [item(0, 10)] }] };
    expect(moveItem(t, 'a', 0, 15, catalog)).toBe(t);
    expect(moveItem(t, 'a', 0, 15)).not.toBe(t);
  });
});

describe('changing an item', () => {
  it('gives it another part with its own defaults and takes its old keyframes away', () => {
    const s = withLayer([item(0, 10, { part: 'toggle', params: { count: 4 }, animate: { count: [kf(0, 1)] } })]);
    const next = setItemPart(s, 'a', 0, 'ticker', catalog);
    expect(next.layers![0].items[0]).toEqual({ part: 'ticker', params: {}, start: 0, end: 10 });
    expect(setItemPart(s, 'a', 0, 'toggle', catalog)).toBe(s);
    expect(setItemPart(s, 'a', 0, 'nope', catalog)).toBe(s);
  });

  it('refuses a part the pages it covers already draw', () => {
    const s = withLayer([item(0, 10, { part: 'ticker' })]);
    expect(setItemPart(s, 'a', 0, 'stamp', catalog)).toBe(s);
  });

  it('sets the parameters and removes an item', () => {
    const s = withLayer([item(0, 10, { part: 'toggle' }), item(20, 30)]);
    expect(setItemParams(s, 'a', 0, { count: 2 }).layers![0].items[0].params).toEqual({ count: 2 });
    expect(removeItem(s, 'a', 0).layers![0].items).toEqual([item(20, 30)]);
    expect(removeItem(s, 'a', 5)).toBe(s);
  });
});

describe('the keyframes of an item', () => {
  const s = (): Script => withLayer([item(10, 20, { part: 'toggle' })]);

  it('are inside the item\'s own length, in order, and the field goes with the last', () => {
    let next = setItemKeyframes(s(), 'a', 0, 'count', [kf(99, 5), kf(-1, 1)]);
    expect(itemKeyframes(next, 'a', 0, 'count')).toEqual([kf(0, 1), kf(10, 5)]);
    next = removeItemKeyframe(removeItemKeyframe(next, 'a', 0, 'count', 0), 'a', 0, 'count', 0);
    expect('animate' in next.layers![0].items[0]).toBe(false);
  });

  it('are added, moved between their neighbours, and edited', () => {
    let next = setItemKeyframes(s(), 'a', 0, 'count', [kf(0, 1), kf(10, 5)]);
    next = addItemKeyframe(next, 'a', 0, 'count', kf(4, 3));
    expect(itemKeyframes(next, 'a', 0, 'count')!.map((k) => k.t)).toEqual([0, 4, 10]);
    expect(itemKeyframes(moveItemKeyframe(next, 'a', 0, 'count', 1, 99), 'a', 0, 'count')![1].t).toBe(9.99);
    expect(itemKeyframes(editItemKeyframe(next, 'a', 0, 'count', 1, { value: 4, ease: 'out' }), 'a', 0, 'count')![1]).toEqual({ t: 4, value: 4, ease: 'out' });
  });

  it('follow an item that is resized only by the person: the times stay as written', () => {
    const next = setItemKeyframes(s(), 'a', 0, 'count', [kf(0, 1), kf(8, 5)]);
    expect(itemKeyframes(resizeItem(next, 'a', 0, 'end', 25), 'a', 0, 'count')!.map((k) => k.t)).toEqual([0, 8]);
  });
});

describe('splitting a piece with layers', () => {
  it('leaves the layers as they are: they belong to the song, not to a piece', () => {
    const s = withLayer([item(10, 50)]);
    const next = splitPiece(s, 1, 40, 'p9', { words: [] });
    expect(next.layers).toEqual(s.layers);
    expect(next.pieces).toHaveLength(3);
  });
});

describe('duplicating an item', () => {
  it('copies the part, the parameters and the keyframes right after the item, as long as it was', () => {
    const original = item(5, 15, { part: 'toggle', params: { count: 2 }, animate: { count: [kf(0, 1), kf(10, 4)] } });
    const s = duplicateItem(withLayer([original]), 'a', 0);
    expect(s.layers![0].items).toEqual([original, { ...original, start: 15, end: 25 }]);
    // a copy, not the same object
    expect(s.layers![0].items[1].animate).not.toBe(original.animate);
  });

  it('is shortened to the room before the next item and its keyframes beyond it go; refused with less than half a second', () => {
    const original = item(5, 15, { part: 'toggle', animate: { count: [kf(0, 1), kf(4, 2), kf(10, 4)] } });
    const s = duplicateItem(withLayer([original, item(18, 30, { part: 'ticker' })]), 'a', 0);
    expect(s.layers![0].items[1]).toMatchObject({ start: 15, end: 18, animate: { count: [kf(0, 1)] } });
    expect(duplicateItem(withLayer([item(5, 15), item(15.3, 30, { part: 'ticker' })]), 'a', 0).layers![0].items).toHaveLength(2);
    const full = withLayer([item(5, 59.8)]);
    expect(duplicateItem(full, 'a', 0)).toBe(full);
  });

  it('is refused, with the catalog, when the copy would make a page draw the same part twice, and allowed from a cut', () => {
    // the item ends inside p1 and the copy would start in it: p1 would draw `strip` twice
    const inside = withLayer([item(2, 10)]);
    expect(duplicateItem(inside, 'a', 0, catalog)).toBe(inside);
    expect(layerEditProblem(inside, duplicateItem(inside, 'a', 0), catalog)).toBe('piece "p1" (#1): the part "strip" is drawn twice (layer "a" item #1 and layer "a" item #2)');
    // an item that fills p1 ends at the cut: the copy lands in p2 only
    const atCut = withLayer([item(0, 20)]);
    expect(duplicateItem(atCut, 'a', 0, catalog).layers![0].items.map((i) => [i.start, i.end])).toEqual([[0, 20], [20, 40]]);
  });

  it('does nothing for an item or a layer that is not there', () => {
    const s = withLayer([item(5, 15)]);
    expect(duplicateItem(s, 'a', 3)).toBe(s);
    expect(duplicateItem(s, 'nope', 0)).toBe(s);
  });
});
