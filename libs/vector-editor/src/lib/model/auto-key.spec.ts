import { sampleDocument } from '../../testing/sample-document';
import { editProperty, keyframeIndexAt, setStatic, toggleKeyframe } from './auto-key';
import { setKeyframe } from './edits';
import { findNode } from './tree';

const node = (doc: ReturnType<typeof sampleDocument>, id: string) => findNode(doc.nodes, id)!;

describe('editProperty (auto-key)', () => {
  it('changes the keyframe at the playhead and leaves the others', () => {
    const doc = editProperty(sampleDocument(), 'dot', 'x', 2, 99);
    expect(node(doc, 'dot').tracks.x).toEqual([
      { t: 0, value: 0, ease: 'in-out' },
      { t: 2, value: 99, ease: 'linear' },
    ]);
  });

  it('adds a keyframe at the playhead when the property has keyframes elsewhere', () => {
    const doc = editProperty(setKeyframe(sampleDocument(), 'tag', 'rotate', 0, 0), 'tag', 'rotate', 2, 45);
    expect(node(doc, 'tag').tracks.rotate).toEqual([
      { t: 0, value: 0, ease: 'linear' },
      { t: 2, value: 45, ease: 'linear' },
    ]);
  });

  it('changes the static value when the property has no keyframes, and makes none', () => {
    const doc = editProperty(sampleDocument(), 'tag', 'x', 3, 40);
    expect(node(doc, 'tag').transform.x).toBe(40);
    expect(node(doc, 'tag').tracks).toEqual({});
    expect(node(setStatic(sampleDocument(), 'tag', 'fill', '#00ff00'), 'tag').fill).toEqual({ kind: 'color', value: '#00ff00' });
    expect(node(setStatic(sampleDocument(), 'tag', 'fill', 'none'), 'tag').fill).toEqual({ kind: 'none' });
    expect(node(setStatic(sampleDocument(), 'tag', 'opacity', 0.5), 'tag').opacity).toBe(0.5);
    expect(node(setStatic(sampleDocument(), 'tag', 'strokeWidth', 3), 'tag').strokeWidth).toBe(3);
  });
});

describe('toggleKeyframe', () => {
  it('adds a keyframe with the value shown now and removes it when pressed again', () => {
    const on = toggleKeyframe(sampleDocument(), 'tag', 'opacity', 1.5);
    expect(node(on, 'tag').tracks.opacity).toEqual([{ t: 1.5, value: 1, ease: 'linear' }]);
    expect(keyframeIndexAt(node(on, 'tag'), 'opacity', 1.5)).toBe(0);
    const off = toggleKeyframe(on, 'tag', 'opacity', 1.5);
    expect('opacity' in node(off, 'tag').tracks).toBe(false);
  });

  it('starts a paint with no colour from a grey, and the value of a track where it has one', () => {
    expect(node(toggleKeyframe(sampleDocument(), 'tag', 'fill', 1), 'tag').tracks.fill![0].value).toBe('#808080');
    expect(node(toggleKeyframe(sampleDocument(), 'dot', 'x', 1), 'dot').tracks.x![1].value).toBeCloseTo(30);
  });
});
