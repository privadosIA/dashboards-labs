import { shapesDocument } from '../../testing/shapes-document';
import { newShape, type VectorDocument } from './document';
import { addNode, addParam, duplicate, group, sendBackward, sendForward, sendToBack, sendToFront, setKeyframe, setShape, setText, ungroup, VectorEditError } from './edits';
import { nodeStateAt, propertyAt } from './evaluate';
import { setStatic } from './auto-key';
import { compose, findNode, matrixOf, worldTransform } from './tree';

const ids = (doc: VectorDocument): string[] => doc.nodes.map((n) => n.id);
const node = (doc: VectorDocument, id: string) => findNode(doc.nodes, id)!;

describe('drawn nodes', () => {
  it('evaluate their size, radius and text size from the tracks, else from the node', () => {
    const doc = shapesDocument();
    expect(nodeStateAt(node(doc, 'bar'), 2).shape).toEqual({ width: 200, height: 40, rx: 13 });
    expect(nodeStateAt(node(doc, 'title'), 4).shape).toEqual({ fontSize: 80 });
    expect(nodeStateAt(node(doc, 'photo'), 1).shape).toEqual({ width: 80, height: 60 });
    expect(propertyAt(node(doc, 'dot'), 'height', 0)).toBe(40);
    expect(propertyAt(node(doc, 'rule'), 'width', 0)).toBeUndefined();
  });

  it('are added on top, inside a group when asked', () => {
    let doc = addNode(shapesDocument(), newShape('rect', 'r2', 'R2'));
    expect(ids(doc).at(-1)).toBe('r2');
    doc = group(doc, ['dot'], 'g1');
    doc = addNode(doc, newShape('ellipse', 'e2', 'E2'), 'g1');
    expect(node(doc, 'g1').children.map((c) => c.id)).toEqual(['dot', 'e2']);
    expect(() => addNode(doc, newShape('rect', 'r3', 'R3'), 'nope')).toThrow(VectorEditError);
  });

  it('change their shape and their text, refusing what has no such thing', () => {
    let doc = setShape(shapesDocument(), 'bar', { width: 250, rx: -3 });
    expect(node(doc, 'bar')).toMatchObject({ width: 250, rx: 0 });
    doc = setText(doc, 'title', { content: 'Bye', fontSize: 0, align: 'middle' });
    expect(node(doc, 'title')).toMatchObject({ content: 'Bye', fontSize: 1, align: 'middle' });
    expect(() => setText(doc, 'bar', { content: 'x' })).toThrow(/not a text/);
    expect(() => setShape(doc, 'title', { width: 1 })).toThrow(/not a shape/);
    expect(node(setShape(doc, 'rule', { x2: -50 }), 'rule')).toMatchObject({ x2: -50 });
  });

  it('take a static value or a keyframe on width, height, rx and fontSize through the one rule', () => {
    const doc = shapesDocument();
    expect(node(setStatic(doc, 'rule', 'width', 5), 'rule')).toBeDefined();
    expect(node(setStatic(doc, 'dot', 'width', 90), 'dot')).toMatchObject({ width: 90 });
    expect(node(setStatic(doc, 'title', 'fontSize', 55), 'title')).toMatchObject({ fontSize: 55 });
    expect(node(setKeyframe(doc, 'bar', 'height', 2, 70), 'bar').tracks.height).toEqual([{ t: 2, value: 70, ease: 'linear' }]);
  });
});

describe('number parameters', () => {
  it('can target a width, a height or a font size, and exclude the track on it', () => {
    const doc = shapesDocument();
    const param = { type: 'number' as const, description: 'x', default: '120', min: 10, max: 400 };
    expect(addParam(doc, { ...param, name: 'dot_w', target: { nodeId: 'dot', what: 'width' } }).params).toHaveLength(1);
    const withNote = addNode(doc, newShape('text', 'note', 'Note'));
    expect(addParam(withNote, { ...param, name: 'size', target: { nodeId: 'note', what: 'fontSize' } }).params).toHaveLength(1);
    expect(() => addParam(doc, { ...param, name: 'title_s', target: { nodeId: 'title', what: 'fontSize' } })).toThrow(/animated/);
    expect(() => addParam(doc, { ...param, name: 'bar_w', target: { nodeId: 'bar', what: 'width' } })).toThrow(/animated/);
    expect(() => addParam(doc, { ...param, name: 'rule_w', target: { nodeId: 'rule', what: 'width' } })).toThrow(/no width/);
    expect(() => addParam(doc, { ...param, name: 'bar_s', target: { nodeId: 'bar', what: 'fontSize' } })).toThrow(/not a text/);
    expect(addParam(doc, { name: 'words', type: 'string', description: 'x', default: 'Hi', max_length: 12, target: { nodeId: 'title', what: 'text' } }).params).toHaveLength(1);
  });
});

describe('order', () => {
  it('moves one step or to the ends among siblings, and stays at the ends', () => {
    const doc = shapesDocument();
    expect(ids(sendForward(doc, 'bar'))).toEqual(['title', 'bar', 'dot', 'rule', 'photo']);
    expect(ids(sendBackward(doc, 'dot'))).toEqual(['bar', 'dot', 'title', 'rule', 'photo']);
    expect(ids(sendToFront(doc, 'bar'))).toEqual(['title', 'dot', 'rule', 'photo', 'bar']);
    expect(ids(sendToBack(doc, 'photo'))).toEqual(['photo', 'bar', 'title', 'dot', 'rule']);
    expect(ids(sendBackward(doc, 'bar'))).toEqual(ids(doc));
    expect(ids(sendToFront(doc, 'photo'))).toEqual(ids(doc));
  });
});

describe('duplicate', () => {
  it('copies the node right above itself with a new id, a "copy" name and its tracks', () => {
    const { doc, ids: made } = duplicate(shapesDocument(), ['bar']);
    expect(made).toEqual(['bar-copy']);
    expect(ids(doc)).toEqual(['bar', 'bar-copy', 'title', 'dot', 'rule', 'photo']);
    expect(node(doc, 'bar-copy')).toMatchObject({ name: 'Bar copy', width: 100 });
    expect(node(doc, 'bar-copy').tracks.width).toEqual(node(doc, 'bar').tracks.width);
    expect(node(doc, 'bar-copy').tracks.width).not.toBe(node(doc, 'bar').tracks.width);
    expect(duplicate(doc, ['bar']).ids).toEqual(['bar-copy-2']);
  });

  it('copies a group with its children under new ids', () => {
    const grouped = group(shapesDocument(), ['bar', 'dot'], 'g1');
    const { doc, ids: made } = duplicate(grouped, ['g1']);
    expect(made).toEqual(['g1-copy']);
    expect(node(doc, 'g1-copy').children.map((c) => c.id)).toEqual(['bar-copy', 'dot-copy']);
  });
});

describe('group and ungroup', () => {
  it('wraps the nodes in a group where the topmost of them was, at identity', () => {
    const doc = group(shapesDocument(), ['bar', 'dot'], 'g1', 'Pair');
    expect(ids(doc)).toEqual(['title', 'g1', 'rule', 'photo']);
    expect(node(doc, 'g1')).toMatchObject({ kind: 'group', name: 'Pair', transform: { x: 0, y: 0, scaleX: 1, rotate: 0 } });
    expect(node(doc, 'g1').children.map((c) => c.id)).toEqual(['bar', 'dot']);
  });

  it('ungroups into the same place, the children keeping where they stand', () => {
    let doc = group(shapesDocument(), ['title', 'rule'], 'g1');
    doc = { ...doc, nodes: doc.nodes.map((n) => (n.id === 'g1' ? { ...n, transform: { ...n.transform, x: 50, y: 10, rotate: 90, scaleX: 2, scaleY: 2 } } : n)) };
    const before = ['title', 'rule'].map((id) => worldTransform(doc.nodes, id));
    const after = ungroup(doc, 'g1');
    expect(ids(after)).toEqual(['bar', 'dot', 'title', 'rule', 'photo']);
    expect(findNode(after.nodes, 'g1')).toBeUndefined();
    ['title', 'rule'].forEach((id, k) => {
      const m = worldTransform(after.nodes, id);
      m.forEach((v, i) => expect(Math.abs(v - before[k][i])).toBeLessThan(1e-4));
    });
  });

  it('refuses to ungroup a group that has tracks, and what is not a group', () => {
    let doc = group(shapesDocument(), ['title', 'rule'], 'g1');
    const animated = setKeyframe(doc, 'g1', 'rotate', 1, 45);
    expect(() => ungroup(animated, 'g1')).toThrow(/animated/);
    expect(() => ungroup(doc, 'bar')).toThrow(/not a group/);
    doc = ungroup(doc, 'g1');
    expect(findNode(doc.nodes, 'g1')).toBeUndefined();
  });
});

describe('compose', () => {
  it('gives the matrix of the parent times the child', () => {
    const parent = { x: 10, y: 20, scaleX: 2, scaleY: 2, rotate: 0, anchorX: 0, anchorY: 0 };
    const child = { x: 5, y: 5, scaleX: 1, scaleY: 1, rotate: 0, anchorX: 3, anchorY: 3 };
    const composed = compose(parent, child);
    expect(composed).toMatchObject({ x: 23, y: 33, scaleX: 2, scaleY: 2, rotate: 0 });
    const m = matrixOf(composed);
    expect(m[4]).toBeCloseTo(20, 6);
    expect(m[5]).toBeCloseTo(30, 6);
  });
});
