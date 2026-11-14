import { sampleDocument } from '../../testing/sample-document';
import { propertyAt, stateAt, valueAt } from './evaluate';
import type { Keyframe } from './document';

const kf = (t: number, value: number | string, ease: Keyframe['ease'] = 'linear'): Keyframe => ({ t, value, ease });

describe('valueAt', () => {
  it('goes with the earlier keyframe’s ease: out from 0 to 1 is 0.875 at the middle', () => {
    expect(valueAt([kf(0, 0, 'out'), kf(2, 1)], 1)).toBe(0.875);
  });

  it('mixes a colour channel by channel', () => {
    expect(valueAt([kf(0, '#000000'), kf(1, '#ff0000')], 0.5)).toBe('#800000');
  });

  it('clamps before the first and after the last keyframe, and has nothing for an empty track', () => {
    const track = [kf(1, 10), kf(3, 30)];
    expect(valueAt(track, 0)).toBe(10);
    expect(valueAt(track, 9)).toBe(30);
    expect(valueAt([], 1)).toBeUndefined();
    expect(valueAt(undefined, 1)).toBeUndefined();
  });

  it('holds under step, and holds what is not a number or a #rrggbb colour', () => {
    expect(valueAt([kf(0, 5, 'step'), kf(2, 9)], 1.9)).toBe(5);
    expect(valueAt([kf(0, 'none'), kf(2, '#ffffff')], 1)).toBe('none');
    expect(valueAt([kf(0, 'red'), kf(2, 'blue')], 1)).toBe('red');
  });

  it('has the cubic in, out and in-out', () => {
    expect(valueAt([kf(0, 0, 'in'), kf(1, 1)], 0.5)).toBeCloseTo(0.125);
    expect(valueAt([kf(0, 0, 'in-out'), kf(1, 1)], 0.25)).toBeCloseTo(0.0625);
    expect(valueAt([kf(0, 0, 'in-out'), kf(1, 1)], 0.75)).toBeCloseTo(0.9375);
  });
});

describe('stateAt', () => {
  it('gives every node of the sample a state, with the tracks applied', () => {
    const state = stateAt(sampleDocument(), 2);
    expect(state.get('dot')!.transform.x).toBe(60);
    expect(state.get('logo')!.transform.rotate).toBe(180);
    expect(state.get('label')!.transform.x).toBe(0);
  });

  it('cascades opacity and visibility down the tree', () => {
    const doc = sampleDocument();
    const state = stateAt(doc, 1);
    expect(state.get('logo')!.opacity).toBeCloseTo(0.875);
    expect(state.get('dot')!.opacity).toBe(1);
    expect(state.get('dot')!.effectiveOpacity).toBeCloseTo(0.875);
    doc.nodes[0].children[0].visible = false;
    const hidden = stateAt(doc, 1);
    expect(hidden.get('logo')!.shown).toBe(false);
    expect(hidden.get('dot')!.shown).toBe(false);
    expect(hidden.get('tag')!.shown).toBe(true);
  });

  it('reads a node’s static value where there is no track', () => {
    const doc = sampleDocument();
    expect(propertyAt(doc.nodes[0].children[1], 'x', 3)).toBe(0);
    expect(propertyAt(doc.nodes[0].children[0].children[0], 'x', 3)).toBeCloseTo(60);
  });
});
