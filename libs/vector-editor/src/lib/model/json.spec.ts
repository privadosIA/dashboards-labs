import { shapesDocument } from '../../testing/shapes-document';
import { sampleDocument } from '../../testing/sample-document';
import { newDocument, type VectorDocument } from './document';
import { fromJson, toJson, VectorModelError } from './json';

describe('toJson and fromJson', () => {
  it('round-trips the sample and keeps a field it does not know', () => {
    const doc = sampleDocument();
    (doc.nodes[0] as unknown as Record<string, unknown>)['x_future'] = { a: 1 };
    const back = fromJson(toJson(doc));
    expect(back).toEqual(doc);
    expect((back.nodes[0] as unknown as Record<string, unknown>)['x_future']).toEqual({ a: 1 });
  });

  it('refuses keyframes out of order, naming the node, the property and the keyframe', () => {
    const doc = sampleDocument();
    doc.nodes[0].children[0].children[0].tracks['x'] = [
      { t: 3, value: 0, ease: 'linear' },
      { t: 1, value: 5, ease: 'linear' },
    ];
    expect(() => fromJson(toJson(doc))).toThrow(/node "dot", property "x", keyframe 1/);
  });

  it('refuses keyframes outside the duration, a repeated id, a newer version and what is not JSON', () => {
    const doc = sampleDocument();
    doc.nodes[0].children[0].tracks['opacity'] = [{ t: 9, value: 1, ease: 'linear' }];
    expect(() => fromJson(doc)).toThrow(/outside 0 to 4/);
    const twice = sampleDocument();
    twice.nodes[0].children.push({ ...twice.nodes[0].children[1] });
    expect(() => fromJson(twice)).toThrow(/used twice/);
    expect(() => fromJson({ ...newDocument(), version: 2 })).toThrow(/newer version/);
    expect(() => fromJson('{')).toThrow(VectorModelError);
    expect(() => fromJson('[]')).toThrow(/not a vector document/);
  });
});

describe('the drawn kinds in a document', () => {
  it('round-trips a document of the five kinds', () => {
    const doc = shapesDocument();
    expect(fromJson(toJson(doc))).toEqual(doc);
  });

  it('opens a document written before these kinds existed', () => {
    const old = JSON.parse(toJson(sampleDocument())) as VectorDocument;
    expect(fromJson(old).nodes[0].kind).toBe('import');
    expect(fromJson(old)).toEqual(sampleDocument());
  });

  it('still refuses a kind it does not know, and a track of a property it does not know', () => {
    const doc = JSON.parse(toJson(shapesDocument())) as VectorDocument;
    (doc.nodes[0] as unknown as { kind: string }).kind = 'star';
    expect(() => fromJson(doc)).toThrow(/unknown kind "star"/);
    const bad = JSON.parse(toJson(shapesDocument())) as VectorDocument;
    (bad.nodes[0].tracks as Record<string, unknown>)['skew'] = [];
    expect(() => fromJson(bad)).toThrow(/not an animatable property/);
  });
});
