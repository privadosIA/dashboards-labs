import { evaluateKeyframes, type Keyframe, type Script } from '@lab/animation-core';

import { ANIMATION_SCRIPT, animateData } from './animate-script';
import { buildScenePage } from './page-builder';
import { scenesOf } from './scene-model';
import { CATALOG, DESIGN, FRAGMENTS, SCRIPT, SONG_MAP } from './test-data';

const kf = (t: number, value: Keyframe['value'], ease?: Keyframe['ease']): Keyframe => ({ t, value, ...(ease ? { ease } : {}) });
const jsonSafe = (v: unknown): string => JSON.stringify(v).replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

/** The page's own evaluator, run on a window of its own, for the value of one track at `t`. */
function pageValue(keyframes: readonly Keyframe[], t: number, int = false): unknown {
  const win: Record<string, unknown> = { __animate: [{ x: { k: keyframes, ...(int ? { int: true } : {}) } }], __partParams: [{}] };
  new Function('window', ANIMATION_SCRIPT)(win);
  (win['__setAnimated'] as (t: number) => void)(t);
  return (win['__partParams'] as Record<string, unknown>[])[0]['x'];
}

const CASES: { name: string; keyframes: Keyframe[] }[] = [
  { name: 'linear', keyframes: [kf(0, 0), kf(4, 100)] },
  { name: 'each ease', keyframes: [kf(0, 0, 'in'), kf(2, 10, 'out'), kf(4, 0, 'in-out'), kf(6, 50, 'linear'), kf(8, 7, 'step'), kf(10, 9)] },
  { name: 'text, held', keyframes: [kf(0, 'a'), kf(2, 'b', 'step'), kf(5, 'c')] },
  { name: 'switch', keyframes: [kf(1, true), kf(3, false)] },
  { name: 'a number then text', keyframes: [kf(0, 1), kf(2, 'x')] },
  { name: 'one keyframe', keyframes: [kf(2, 5)] },
];

describe('the evaluator the page carries', () => {
  it.each(CASES)('gives what evaluateKeyframes gives, $name', ({ keyframes }) => {
    for (let t = -1; t <= 12; t += 0.25) {
      expect(pageValue(keyframes, t)).toEqual(evaluateKeyframes(keyframes, t));
      expect(pageValue(keyframes, t, true)).toEqual(evaluateKeyframes(keyframes, t, true));
    }
  });

  it('rounds the numbers of a whole-number parameter and leaves other values alone', () => {
    expect(pageValue([kf(0, 0), kf(3, 10)], 1, true)).toBe(3);
    expect(pageValue([kf(0, 'a')], 1, true)).toBe('a');
  });

  it('moves only the parts that have tracks, by their place', () => {
    const win: Record<string, unknown> = { __animate: [null, { n: { k: [kf(0, 1), kf(2, 3)] } }], __partParams: [{ n: 0 }, { n: 0 }] };
    new Function('window', ANIMATION_SCRIPT)(win);
    (win['__setAnimated'] as (t: number) => void)(1);
    expect((win['__partParams'] as { n: number }[]).map((p) => p.n)).toEqual([0, 2]);
  });
});

describe('animateData', () => {
  it('is nothing when no part moves', () => {
    expect(animateData([{ animate: undefined, ints: new Set() }, { animate: {}, ints: new Set() }], jsonSafe)).toBe('');
  });

  it('writes the tracks in the order of the parts, null for one that stands still, the keys of a keyframe in the server\'s order and the whole-number flag', () => {
    const out = animateData([{ animate: undefined, ints: new Set() }, { animate: { z: [kf(0, 1)], a: [kf(0, 1, 'in'), kf(2, 'x')] }, ints: new Set(['a']) }], jsonSafe);
    expect(out).toBe('<script>window.__animate=[null,{"a":{"k":[{"t":0,"value":1,"ease":"in"},{"t":2,"value":"x"}],"int":true},"z":{"k":[{"t":0,"value":1}]}}];</script>');
  });
});

const animated = (): Script => ({ version: 1, pieces: SCRIPT.pieces.map((p) => (p.id === 'p2' ? { ...p, with: [{ part: 'counter', params: { to: 5 }, animate: { to: [kf(0, 1), kf(4, 9, 'out')] } }] } : p)) });
const sceneOf = (script: Script, catalog = CATALOG) => scenesOf({ piece: { width: 1280, height: 720, songMap: SONG_MAP }, design: DESIGN, script, catalog, fragments: FRAGMENTS });

describe('a page with keyframes', () => {
  const page = buildScenePage(sceneOf(animated())[1]);

  it('carries the tracks, the evaluator and the call in its seek, before the layers', () => {
    expect(page).toContain('<script>window.__animate=[null,{"to":{"k":[{"t":0,"value":1},{"t":4,"value":9,"ease":"out"}],"int":true}}];</script>');
    expect(page).toContain('window.__setAnimated = function(t){');
    const layers = page.indexOf('window.__seek = function(t){\n    window.__setAnimated(t);\n    if (typeof window.__stageSeek');
    expect(layers).toBeGreaterThan(page.indexOf('window.__animateValue = function'));
    expect(page.indexOf('window.__animate=')).toBeLessThan(page.indexOf('window.__animateValue'));
  });

  it('has the part that moves hand over its own parameters by its place, and the others not', () => {
    expect(page).toContain('window.__partParams=window.__partParams||{};window.__partParams[1]=window.__params;');
    expect(page.match(/window\.__partParams\[/g)).toHaveLength(1);
  });

  it('is the page it always was for a piece without keyframes', () => {
    const plain = buildScenePage(sceneOf(SCRIPT)[1]);
    for (const absent of ['__animate', '__setAnimated', '__partParams', '__animateValue']) expect(plain).not.toContain(absent);
    expect(plain).toContain('window.__seek = function(t){\n    if (typeof window.__stageSeek');
  });
});

describe('the gap of a page with keyframes', () => {
  it('is said while the catalog does not say the server draws them, and not when it does', () => {
    const without = sceneOf(animated(), { ...CATALOG, features: [] })[1];
    expect(without.gaps).toContainEqual({ kind: 'keyframes' });
    const withFeature = sceneOf(animated(), { ...CATALOG, features: ['animate'] })[1];
    expect(withFeature.gaps).not.toContainEqual({ kind: 'keyframes' });
    expect(sceneOf(SCRIPT, { ...CATALOG, features: [] })[1].gaps).not.toContainEqual({ kind: 'keyframes' });
  });
});

describe('a part drawn as an item of a layer', () => {
  it('has its offset written by place, as the server writes it, and only when it animates', () => {
    const out = animateData([{ animate: { a: [kf(0, 1)] }, ints: new Set() }, { animate: { b: [kf(0, 1)] }, ints: new Set(), off: 12.5 }, { animate: undefined, ints: new Set(), off: 3 }, ...Array.from({ length: 8 }, () => ({ animate: { c: [kf(0, 1)] }, ints: new Set<string>(), off: 1 }))], jsonSafe);
    expect(out).toMatch(/<script>window\.__animateOff=\{"1":12\.5,"10":1,"3":1,"4":1,"5":1,"6":1,"7":1,"8":1,"9":1\};<\/script>$/);
  });

  it('reads the keyframes at the song time less the offset, and a part with none at the piece\'s time', () => {
    const win: Record<string, unknown> = { __animate: [{ x: { k: [kf(0, 0), kf(4, 40)] } }, { x: { k: [kf(0, 0), kf(4, 40)] } }], __partParams: [{}, {}], __animateOff: { '1': 10 }, __scene: { song_start: 20 } };
    new Function('window', ANIMATION_SCRIPT)(win);
    (win['__setAnimated'] as (t: number) => void)(2);
    // the first part is at the piece's 2 s; the second is an item that starts at song second 10, and the piece starts at 20: 20 + 2 - 10 = 12 s into it
    expect((win['__partParams'] as { x: number }[]).map((p) => p.x)).toEqual([20, 40]);
  });
});
