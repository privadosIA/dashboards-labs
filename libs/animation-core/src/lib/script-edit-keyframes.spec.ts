import type { Catalog, Keyframe, Script, ScriptPiece } from './model';
import { addKeyframe, clearAnimate, editKeyframe, hasKeyframes, keyframesOf, moveKeyframe, removeKeyframe, setKeyframes, splitPiece, swapContents } from './script-edit';

const kf = (t: number, value: Keyframe['value'], ease?: Keyframe['ease']): Keyframe => ({ t, value, ...(ease ? { ease } : {}) });
const piece = (id: string, start: number, end: number, extra: Partial<ScriptPiece> = {}): ScriptPiece => ({ id, start, end, part: 'counter', params: { to: 100 }, ...extra });
const script = (): Script => ({ version: 1, pieces: [piece('p1', 0, 8), piece('p2', 8, 16, { part: 'toggle', params: { label: 'x' }, with: [{ part: 'counter', params: { to: 5 } }] })] });
const map = { words: [] as { text: string; start: number; end: number; line: number }[] };
const catalog = { parts: [{ name: 'counter', params: [{ name: 'to', type: 'int' }, { name: 'speed', type: 'number' }] }] } as unknown as Catalog;

describe('setKeyframes', () => {
  it('puts the keyframes of a parameter on the piece, in order and inside it', () => {
    const next = setKeyframes(script(), 0, 'to', [kf(20, 100), kf(-3, 0)]);
    expect(next.pieces[0].animate).toEqual({ to: [kf(0, 0), kf(8, 100)] });
    expect('animate' in next.pieces[1]).toBe(false);
  });

  it('does not change the script it was given', () => {
    const before = script();
    const copy = JSON.stringify(before);
    setKeyframes(before, 0, 'to', [kf(0, 1)]);
    expect(JSON.stringify(before)).toBe(copy);
  });

  it('works on an extra part, and an empty list takes the animation away down to the field', () => {
    let s = setKeyframes(script(), 1, 'to', [kf(0, 1), kf(4, 9)], 0);
    expect(s.pieces[1].with![0].animate).toEqual({ to: [kf(0, 1), kf(4, 9)] });
    expect(s.pieces[1].animate).toBeUndefined();
    s = setKeyframes(s, 1, 'to', [], 0);
    expect(s.pieces[1].with![0]).toEqual({ part: 'counter', params: { to: 5 } });
    expect('animate' in s.pieces[1].with![0]).toBe(false);
  });

  it('keeps the other parameters when one is cleared', () => {
    let s = setKeyframes(script(), 0, 'to', [kf(0, 1)]);
    s = setKeyframes(s, 0, 'speed', [kf(0, 2)]);
    s = setKeyframes(s, 0, 'to', []);
    expect(s.pieces[0].animate).toEqual({ speed: [kf(0, 2)] });
  });

  it('leaves a script alone for a piece or an extra that is not there', () => {
    const s = script();
    expect(setKeyframes(s, 9, 'to', [kf(0, 1)])).toBe(s);
    expect(setKeyframes(s, 0, 'to', [kf(0, 1)], 3)).toBe(s);
  });
});

describe('adding, moving, editing and removing a keyframe', () => {
  const base = (): Script => setKeyframes(script(), 0, 'to', [kf(0, 0, 'linear'), kf(8, 100, 'linear')]);

  it('adds a keyframe between the others, and one at the same second takes its place', () => {
    const next = addKeyframe(base(), 0, 'to', kf(4, 50, 'out'));
    expect(keyframesOf(next.pieces[0], 'to')?.map((k) => [k.t, k.value])).toEqual([[0, 0], [4, 50], [8, 100]]);
    const again = addKeyframe(next, 0, 'to', kf(4, 60));
    expect(keyframesOf(again.pieces[0], 'to')?.map((k) => [k.t, k.value])).toEqual([[0, 0], [4, 60], [8, 100]]);
  });

  it('moves a keyframe between its neighbours, never onto them, and keeps the first inside the piece', () => {
    const three = addKeyframe(base(), 0, 'to', kf(4, 50));
    expect(keyframesOf(moveKeyframe(three, 0, 'to', 1, 6).pieces[0], 'to')?.[1].t).toBe(6);
    expect(keyframesOf(moveKeyframe(three, 0, 'to', 1, 99).pieces[0], 'to')?.[1].t).toBe(7.99);
    expect(keyframesOf(moveKeyframe(three, 0, 'to', 1, -5).pieces[0], 'to')?.[1].t).toBe(0.01);
    expect(keyframesOf(moveKeyframe(three, 0, 'to', 0, 2).pieces[0], 'to')?.[0].t).toBe(2);
    expect(keyframesOf(moveKeyframe(three, 0, 'to', 2, 99).pieces[0], 'to')?.[2].t).toBe(8);
    expect(moveKeyframe(three, 0, 'to', 1, 4)).toBe(three);
  });

  it('edits the value and the ease of a keyframe, and only what is given', () => {
    const next = editKeyframe(base(), 0, 'to', 1, { value: 40, ease: 'in-out' });
    expect(keyframesOf(next.pieces[0], 'to')?.[1]).toEqual(kf(8, 40, 'in-out'));
    expect(keyframesOf(editKeyframe(next, 0, 'to', 1, { value: 41 }).pieces[0], 'to')?.[1]).toEqual(kf(8, 41, 'in-out'));
  });

  it('removes a keyframe, and the parameter stops animating with the last one', () => {
    const one = removeKeyframe(base(), 0, 'to', 0);
    expect(keyframesOf(one.pieces[0], 'to')).toEqual([kf(8, 100, 'linear')]);
    const none = removeKeyframe(one, 0, 'to', 0);
    expect(none.pieces[0].animate).toBeUndefined();
  });

  it('clears one piece, or the whole script, main parts and extras', () => {
    let s = setKeyframes(base(), 1, 'to', [kf(0, 1)], 0);
    s = setKeyframes(s, 1, 'label', [kf(0, 'a'), kf(2, 'b')]);
    expect(hasKeyframes(s)).toBe(true);
    const one = clearAnimate(s, 1);
    expect(one.pieces[0].animate).toBeDefined();
    expect(one.pieces[1].animate).toBeUndefined();
    expect(one.pieces[1].with![0].animate).toBeUndefined();
    expect(hasKeyframes(one)).toBe(true);
    expect(hasKeyframes(clearAnimate(s))).toBe(false);
  });
});

describe('splitting a piece that animates', () => {
  it('splits the keyframes at the cut, with the value there on both sides', () => {
    const s = setKeyframes(script(), 0, 'to', [kf(0, 0, 'linear'), kf(8, 100, 'linear')]);
    const next = splitPiece(s, 0, 2, 'p9', map);
    expect(next.pieces[0].animate).toEqual({ to: [kf(0, 0, 'linear'), kf(2, 25)] });
    expect(next.pieces[1].animate).toEqual({ to: [kf(0, 25, 'linear'), kf(6, 100, 'linear')] });
    expect(next.pieces[1].id).toBe('p9');
    expect(next.pieces[0].end).toBe(2);
    expect(next.pieces[1].start).toBe(2);
  });

  it('splits the keyframes of the extras too, and the halves do not share them', () => {
    const s = setKeyframes(script(), 1, 'to', [kf(0, 0), kf(8, 80)], 0);
    const next = splitPiece(s, 1, 12, 'p9', map);
    expect(next.pieces[1].with![0].animate).toEqual({ to: [kf(0, 0), kf(4, 40)] });
    expect(next.pieces[2].with![0].animate).toEqual({ to: [kf(0, 40), kf(4, 80)] });
    (next.pieces[2].with![0].animate!['to'] as Keyframe[])[0] = kf(0, 99);
    expect(next.pieces[1].with![0].animate!['to'][1].value).toBe(40);
  });

  it('rounds the value at the cut of a whole-number parameter when the catalog says so', () => {
    const s = setKeyframes(script(), 0, 'to', [kf(0, 0), kf(8, 100)]);
    const exact = splitPiece(s, 0, 3, 'p9', map, catalog);
    expect(exact.pieces[0].animate!['to'].at(-1)?.value).toBe(38);
    const loose = splitPiece(s, 0, 3, 'p9', map);
    expect(loose.pieces[0].animate!['to'].at(-1)?.value).toBe(37.5);
  });

  it('leaves a piece without keyframes the way it was', () => {
    const next = splitPiece(script(), 0, 2, 'p9', map);
    expect('animate' in next.pieces[0]).toBe(false);
    expect('animate' in next.pieces[1]).toBe(false);
    expect(next.pieces[1].with).toBeUndefined();
  });
});

describe('swapping the contents of two pieces', () => {
  it('moves the keyframes with the parameters', () => {
    const s = setKeyframes(script(), 0, 'to', [kf(0, 1), kf(8, 9)]);
    const next = swapContents(s, 0, 1);
    expect(next.pieces[0].animate).toBeUndefined();
    expect(next.pieces[1].animate).toEqual({ to: [kf(0, 1), kf(8, 9)] });
    expect(next.pieces[1].id).toBe('p2');
  });
});
