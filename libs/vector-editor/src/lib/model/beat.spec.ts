import { shapesDocument } from '../../testing/shapes-document';
import { newDocument, newShape, type BeatLink, type VectorDocument } from './document';
import { removeBeatLink, setBeatLink, VectorEditError } from './edits';
import { linkedNumber, nodeStateAt, stateAt } from './evaluate';
import { fromJson, toJson, VectorModelError } from './json';
import { findNode } from './tree';

const rectWith = (links: NonNullable<ReturnType<typeof newShape>['beat']>): VectorDocument => {
  const rect = newShape('rect', 'bar', 'Bar', { beat: links });
  return newDocument({ nodes: [rect] });
};
const scaleX = (doc: VectorDocument, t: number, beat?: { number: number; position: number } | null, loud?: (t: number) => number): number =>
  stateAt(doc, t, beat, loud).get('bar')!.transform.scaleX;

describe('beat links', () => {
  it('pulse adds amount × (1 − position)^decay: 1.0375 half way through a beat', () => {
    const doc = rectWith({ scaleX: { kind: 'pulse', amount: 0.3, decay: 3 } });
    expect(scaleX(doc, 1, { number: 4, position: 0.5 })).toBeCloseTo(1.0375, 9);
    expect(scaleX(doc, 1, { number: 4, position: 0 })).toBeCloseTo(1.3, 9);
    expect(scaleX(doc, 1, { number: 4, position: 0.999 })).toBeCloseTo(1, 6);
  });

  it('does nothing without a beat, before the first beat, or where the link is missing', () => {
    const doc = rectWith({ scaleX: { kind: 'pulse', amount: 0.3, decay: 3 } });
    expect(scaleX(doc, 1)).toBe(1);
    expect(scaleX(doc, 1, null)).toBe(1);
    expect(scaleX(doc, 1, { number: -1, position: 0.1 })).toBe(1);
    expect(stateAt(doc, 1, { number: 2, position: 0.1 }).get('bar')!.transform.scaleY).toBe(1);
  });

  it('clamps the decay to 1–8 and the position to 0–1', () => {
    expect(linkedNumber(1, { kind: 'pulse', amount: 1, decay: 99 }, 0, { number: 0, position: 0.5 })).toBeCloseTo(1 + Math.pow(0.5, 8), 9);
    expect(linkedNumber(1, { kind: 'pulse', amount: 1, decay: 0 }, 0, { number: 0, position: 0.5 })).toBeCloseTo(1 + Math.pow(0.5, 3), 9);
    expect(linkedNumber(1, { kind: 'pulse', amount: 1, decay: 2 }, 0, { number: 0, position: 2 })).toBe(1);
  });

  it('alternate takes the even or the odd beat’s value, for numbers and for colours', () => {
    const doc = rectWith({ fill: { kind: 'alternate', values: ['#ff0000', '#0000ff'] }, rotate: { kind: 'alternate', values: [0, 15] } });
    const at = (number: number) => stateAt(doc, 0, { number, position: 0.2 }).get('bar')!;
    expect(at(7).fill).toEqual({ kind: 'color', value: '#0000ff' });
    expect(at(6).fill).toEqual({ kind: 'color', value: '#ff0000' });
    expect(at(7).transform.rotate).toBe(15);
    expect(at(0).transform.rotate).toBe(0);
    expect(stateAt(doc, 0).get('bar')!.fill).toEqual({ kind: 'color', value: '#ffd166' });
  });

  it('loudness adds amount × the curve at t, only when there is a curve', () => {
    const doc = rectWith({ scaleX: { kind: 'loudness', amount: 0.5 } });
    expect(scaleX(doc, 2, null, (t) => t / 4)).toBeCloseTo(1.25, 9);
    expect(scaleX(doc, 2, null)).toBe(1);
    expect(scaleX(doc, 2, null, () => 7)).toBeCloseTo(1.5, 9);
  });

  it('rides on the track’s value, and on sizes and opacity', () => {
    const doc = shapesDocument();
    const bar = findNode(doc.nodes, 'bar')!;
    const withLink: VectorDocument = { ...doc, nodes: doc.nodes.map((n) => (n.id === 'bar' ? { ...n, beat: { width: { kind: 'pulse', amount: 50, decay: 1 }, opacity: { kind: 'pulse', amount: 5, decay: 1 } } } : n)) as VectorDocument['nodes'] };
    const plain = nodeStateAt(bar, 2);
    const linked = nodeStateAt(findNode(withLink.nodes, 'bar')!, 2, { number: 0, position: 0 });
    expect(linked.shape.width).toBeCloseTo(plain.shape.width! + 50, 9);
    expect(linked.opacity).toBe(1);
  });
});

describe('editing and keeping beat links', () => {
  it('sets and removes a link, and keeps it through toJson and fromJson', () => {
    const link: BeatLink = { kind: 'pulse', amount: 0.2, decay: 2 };
    let doc = setBeatLink(shapesDocument(), 'bar', 'scaleY', link);
    expect(findNode(doc.nodes, 'bar')!.beat).toEqual({ scaleY: link });
    expect(findNode(fromJson(toJson(doc)).nodes, 'bar')!.beat!.scaleY).toEqual(link);
    doc = removeBeatLink(doc, 'bar', 'scaleY');
    expect('beat' in findNode(doc.nodes, 'bar')!).toBe(false);
  });

  it('is allowed beside a track', () => {
    const doc = setBeatLink(shapesDocument(), 'bar', 'width', { kind: 'pulse', amount: 10, decay: 3 });
    expect(findNode(doc.nodes, 'bar')!.tracks.width).toBeDefined();
    expect(findNode(doc.nodes, 'bar')!.beat!.width).toBeDefined();
  });

  it('refuses a pulse on a colour and an alternate of the wrong kind of value', () => {
    expect(() => setBeatLink(shapesDocument(), 'bar', 'fill', { kind: 'pulse', amount: 1, decay: 2 })).toThrow(VectorEditError);
    expect(() => setBeatLink(shapesDocument(), 'bar', 'fill', { kind: 'alternate', values: [1, 2] })).toThrow(/two colours/);
    expect(() => setBeatLink(shapesDocument(), 'bar', 'rotate', { kind: 'alternate', values: ['#fff', '#000'] })).toThrow(/two numbers/);
  });

  it('opens a document written before links existed, and refuses a link of an unknown kind', () => {
    expect(fromJson(toJson(shapesDocument()))).toEqual(shapesDocument());
    const bad = JSON.parse(toJson(shapesDocument())) as VectorDocument;
    (bad.nodes[0] as { beat?: unknown }).beat = { scaleX: { kind: 'wobble' } };
    expect(() => fromJson(bad)).toThrow(VectorModelError);
    expect(() => fromJson(bad)).toThrow(/unknown kind "wobble"/);
  });
});
