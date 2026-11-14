import type { Keyframe, Script, ScriptPiece } from '@lab/animation-core';

import { keyframeRows } from './keyframe-rows';

const kf = (t: number, value: number): Keyframe => ({ t, value });
const piece = (id: string, start: number, end: number, extra: Partial<ScriptPiece> = {}): ScriptPiece => ({ id, start, end, part: 'counter', ...extra });

describe('keyframeRows', () => {
  it('has no row for a script that animates nothing', () => {
    expect(keyframeRows({ version: 1, pieces: [piece('a', 0, 4), piece('b', 4, 8, { animate: {} })] })).toEqual([]);
  });

  it('has one row per animated parameter, listing the pieces that animate it in time order', () => {
    const script: Script = { version: 1, pieces: [piece('b', 4, 8, { animate: { to: [kf(0, 5)] } }), piece('a', 0, 4, { animate: { to: [kf(0, 1), kf(4, 9)], speed: [kf(0, 2)] } })] };
    const rows = keyframeRows(script);
    expect(rows.map((r) => r.key)).toEqual(['main:speed', 'main:to']);
    const to = rows.find((r) => r.param === 'to')!;
    expect(to.spans.map((s) => [s.piece, s.index, s.start, s.end, s.frames.length])).toEqual([['a', 1, 0, 4, 2], ['b', 0, 4, 8, 1]]);
  });

  it('puts the rows of the extras after the main ones, by extra and then by name', () => {
    const script: Script = { version: 1, pieces: [piece('a', 0, 4, { animate: { to: [kf(0, 1)] }, with: [{ part: 'toggle', animate: { on: [kf(0, 1)] } }, { part: 'counter', animate: { to: [kf(0, 1)], from: [kf(0, 1)] } }] })] };
    expect(keyframeRows(script).map((r) => [r.key, r.extra])).toEqual([['main:to', undefined], ['0:on', 0], ['1:from', 1], ['1:to', 1]]);
  });

  it('keeps the part each span belongs to, since two pieces may use another part for the same name', () => {
    const script: Script = { version: 1, pieces: [piece('a', 0, 4, { animate: { to: [kf(0, 1)] } }), piece('b', 4, 8, { part: 'ring', animate: { to: [kf(0, 1)] } })] };
    expect(keyframeRows(script)[0].spans.map((s) => s.part)).toEqual(['counter', 'ring']);
  });
});
