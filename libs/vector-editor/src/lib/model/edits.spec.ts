import { sampleDocument } from '../../testing/sample-document';
import type { Param } from './document';
import { addParam, moveKeyframe, removeKeyframe, removeParam, rename, setEase, setKeyframe, setLocked, setOpacity, setPaint, setTransform, setVisible, VectorEditError } from './edits';
import { findNode } from './tree';

const node = (doc: ReturnType<typeof sampleDocument>, id: string) => findNode(doc.nodes, id)!;

describe('edits', () => {
  it('change static values without touching the document they came from', () => {
    const doc = sampleDocument();
    const next = setTransform(doc, 'tag', { x: 12, rotate: 30 });
    expect(node(next, 'tag').transform).toMatchObject({ x: 12, rotate: 30 });
    expect(node(doc, 'tag').transform.x).toBe(0);
    expect(node(setOpacity(doc, 'tag', 3), 'tag').opacity).toBe(1);
    expect(node(setPaint(doc, 'tag', 'fill', { kind: 'none' }), 'tag').fill).toEqual({ kind: 'none' });
    expect(node(rename(setLocked(setVisible(doc, 'tag', false), 'tag', true), 'tag', 'Tab'), 'tag')).toMatchObject({ name: 'Tab', visible: false, locked: true });
    expect(() => setTransform(doc, 'nope', { x: 1 })).toThrow(VectorEditError);
  });

  it('add a keyframe in order, or replace the one at that time keeping its ease', () => {
    let doc = sampleDocument();
    doc = setKeyframe(doc, 'dot', 'x', 1, 20);
    expect(node(doc, 'dot').tracks.x!.map((f) => f.t)).toEqual([0, 1, 2]);
    doc = setKeyframe(doc, 'dot', 'x', 0, 5);
    expect(node(doc, 'dot').tracks.x![0]).toEqual({ t: 0, value: 5, ease: 'in-out' });
    doc = setKeyframe(doc, 'tag', 'opacity', 99, 0.5);
    expect(node(doc, 'tag').tracks.opacity).toEqual([{ t: 4, value: 0.5, ease: 'linear' }]);
  });

  it('move a keyframe, clamped and in order, and leave it where it was on a collision', () => {
    const doc = sampleDocument();
    const moved = moveKeyframe(doc, 'dot', 'x', 0, 9);
    expect(node(moved, 'dot').tracks.x!.map((f) => f.t)).toEqual([2, 4]);
    expect(moveKeyframe(doc, 'dot', 'x', 0, 2)).toBe(doc);
    expect(() => moveKeyframe(doc, 'dot', 'x', 7, 1)).toThrow(/no keyframe 7/);
  });

  it('remove a keyframe, and the track when it was the last, and change an ease', () => {
    let doc = removeKeyframe(sampleDocument(), 'wing-a', 'fill', 0);
    expect(node(doc, 'wing-a').tracks.fill).toHaveLength(1);
    doc = removeKeyframe(doc, 'wing-a', 'fill', 0);
    expect('fill' in node(doc, 'wing-a').tracks).toBe(false);
    expect(node(setEase(sampleDocument(), 'dot', 'x', 1, 'step'), 'dot').tracks.x![1].ease).toBe('step');
  });
});

describe('parameters and tracks exclude each other', () => {
  const brand = (nodeId: string, what: Param['target']['what']): Param => ({ name: 'brand', type: 'string', description: 'x', default: '#ff0000', target: { nodeId, what } });

  it('accept a fill with no track and then refuse to animate it', () => {
    const doc = addParam(sampleDocument(), brand('wing-b', 'fill'));
    expect(doc.params.map((p) => p.name)).toEqual(['title', 'brand']);
    expect(() => setKeyframe(doc, 'wing-b', 'fill', 1, '#00ff00')).toThrow(expect.objectContaining({ code: 'param-animated' }));
    expect(() => setPaint(doc, 'wing-b', 'fill', { kind: 'none' })).toThrow(expect.objectContaining({ code: 'track-parametrised' }));
  });

  it('refuse a fill that is animated, saying so, and change nothing', () => {
    const doc = sampleDocument();
    expect(() => addParam(doc, brand('wing-a', 'fill'))).toThrow(/is animated/);
    expect(doc.params).toHaveLength(1);
  });

  it('refuse a bad name, a repeated name, a target that is not there and a text that is not a text', () => {
    const doc = sampleDocument();
    expect(() => addParam(doc, { ...brand('wing-b', 'fill'), name: 'Brand' })).toThrow(expect.objectContaining({ code: 'param-name' }));
    expect(() => addParam(doc, { ...brand('wing-b', 'fill'), name: 'title' })).toThrow(expect.objectContaining({ code: 'param-duplicate' }));
    expect(() => addParam(doc, brand('nope', 'fill'))).toThrow(expect.objectContaining({ code: 'param-target' }));
    expect(() => addParam(doc, brand('dot', 'text'))).toThrow(/is not a text/);
  });

  it('remove a parameter', () => {
    expect(removeParam(sampleDocument(), 'title').params).toEqual([]);
  });
});
