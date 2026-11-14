import type { Catalog, Design, Script } from '@lab/animation-core';

import { withPieceTransition, assetNameOf, assetProblem, compactTheme, framePreset, thumbnailOf, withTheme, withTransition } from './theme-edit';

const design: Design = { dark: '#111111', light: '#eeeeee', accent: '#ff3366', display: 'a', body: 'b', defaultMode: 'dark', modes: {}, concept: '' };
const parts = [
  { name: 'toggle', levels: ['basic'], params: [] },
  { name: 'hud-chrome', levels: ['basic'], params: [] },
  { name: 'grain', levels: ['basic'], params: [] },
] as unknown as Catalog['parts'];
const script: Script = { version: 1, pieces: [{ id: 'p1', start: 0, end: 10, part: 'toggle' }, { id: 'p2', start: 10, end: 30, part: 'toggle' }] } as Script;

describe('the theme of a design', () => {
  it('leaves no theme when nothing is in it, and keeps only what has something', () => {
    expect(compactTheme({ css: '  ', assets: {}, hud: { tl: ' ' } })).toBeUndefined();
    expect(compactTheme({ css: 'a{}', hud: { tl: 'LAB', tr: '' } })).toEqual({ css: 'a{}', hud: { tl: 'LAB' } });
  });

  it('changes one part of the theme and keeps the others; emptying the last removes it from the design', () => {
    const a = withTheme(design, { css: '#verse{color:red}' });
    const b = withTheme(a, { hud: { tl: 'SIGNAL' } });
    expect(b.theme).toEqual({ css: '#verse{color:red}', hud: { tl: 'SIGNAL' } });
    expect(withTheme(withTheme(b, { css: '' }), { hud: {} }).theme).toBeUndefined();
    expect('theme' in withTheme(withTheme(b, { css: '' }), { hud: {} })).toBe(false);
  });

  it('sets the crossfade within the server\'s limits and takes it out for a cut', () => {
    expect(withTransition(design, 0.34567).transitionSeconds).toBe(0.35);
    expect(withTransition(design, 9).transitionSeconds).toBe(2);
    expect('transitionSeconds' in withTransition(withTransition(design, 0.4), 0)).toBe(false);
    expect('transitionSeconds' in withTransition(design, undefined)).toBe(false);
  });
});

describe('the drawings of a theme', () => {
  it('names a file in the letters the server takes', () => {
    expect(assetNameOf('My Mascot-01.svg')).toBe('my_mascot_01');
    expect(assetNameOf('3d logo.svg')).toBe('a3d_logo');
    expect(assetNameOf('...svg')).toBe('drawing');
    expect(assetNameOf(`${'x'.repeat(60)}.svg`)).toHaveLength(32);
  });

  it('applies the server\'s checks before asking it', () => {
    const svg = '<svg viewBox="0 0 1 1"></svg>';
    expect(assetProblem('mascot', svg)).toBeNull();
    expect(assetProblem('Mascot', svg)).toBe('name');
    expect(assetProblem('mascot', '<div></div>')).toBe('svg');
    expect(assetProblem('mascot', `<svg>${'x'.repeat(51200)}</svg>`)).toBe('size');
    expect(assetProblem('mascot', svg, { mascot: svg })).toBe('duplicate');
    expect(assetProblem('six', svg, { a: svg, b: svg, c: svg, d: svg, e: svg })).toBe('full');
  });

  it('shows a drawing as a data picture, which runs no script', () => {
    expect(thumbnailOf('<svg a="&"></svg>')).toMatch(/^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
  });
});

describe('the frame preset', () => {
  it('adds the HUD and the grain over the whole song, a layer each', () => {
    const r = framePreset(script, { parts });
    expect(r.result).toBe('added');
    expect(r.script.layers).toHaveLength(2);
    expect(r.script.layers!.map((l) => l.items.map((i) => [i.part, i.start, i.end]))).toEqual([[['hud-chrome', 0, 30]], [['grain', 0, 30]]]);
  });

  it('adds only what is missing, and says so when both are already drawn', () => {
    const once = framePreset(script, { parts }).script;
    expect(framePreset(once, { parts }).result).toBe('has');
    const half: Script = { ...once, layers: [once.layers![0]] };
    const more = framePreset(half, { parts });
    expect(more.result).toBe('added');
    expect(more.script.layers).toHaveLength(2);
  });

  it('is refused, with the reason, when a part is not in the catalog', () => {
    const r = framePreset(script, { parts: parts.filter((p) => p.name !== 'grain') });
    expect(r.result).toBe('refused');
    expect(r.script).toBe(script);
    expect(r.reason).toBeTruthy();
  });
});

describe('the crossfade of one piece', () => {
  it('is set on that piece alone, clamped, and given back to the design with undefined', () => {
    const a = withPieceTransition(script, 1, 0.34567);
    expect((a.pieces[1] as { transition_seconds?: number }).transition_seconds).toBe(0.35);
    expect('transition_seconds' in a.pieces[0]).toBe(false);
    expect((withPieceTransition(script, 0, 9).pieces[0] as { transition_seconds?: number }).transition_seconds).toBe(2);
    expect((withPieceTransition(script, 0, 0).pieces[0] as { transition_seconds?: number }).transition_seconds).toBe(0);
    expect('transition_seconds' in withPieceTransition(a, 1, undefined).pieces[1]).toBe(false);
    expect(withPieceTransition(script, 7, 1)).toBe(script);
  });
});
