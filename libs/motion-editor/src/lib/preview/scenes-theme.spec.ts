import type { Catalog, Design, Script } from '@lab/animation-core';
import { buildScenePage, fillAssets } from './page-builder';
import { fadeInto, scenesOf } from './scene-model';
import { CATALOG, DESIGN, FRAGMENTS, SCRIPT, SONG_MAP } from './test-data';
import { planFrames, type PlannedPage } from './frame-host/frame-plan';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" id="mascot"></svg>';
const build = (over: { design?: Partial<Design>; catalog?: Partial<Catalog>; script?: Script; fragments?: typeof FRAGMENTS } = {}) =>
  scenesOf({ piece: { width: 1280, height: 720, songMap: SONG_MAP }, design: { ...DESIGN, ...over.design }, script: over.script ?? SCRIPT, catalog: { ...CATALOG, ...over.catalog }, fragments: over.fragments ?? FRAGMENTS });

describe('the theme in a local page', () => {
  const themed = { theme: { css: '#verse{letter-spacing:.1em}', assets: { mascot: svg }, hud: { tl: 'LIVE' } } };

  it('injects the theme CSS after the page CSS, and hands the theme to the page as window.__theme', () => {
    const page = buildScenePage(build({ design: themed })[1]);
    expect(page.indexOf('<style data-theme>#verse{letter-spacing:.1em}</style>')).toBeGreaterThan(page.indexOf('#verse{position:absolute'));
    expect(page).toContain('window.__theme={"assets":{"mascot":');
    expect(page).toContain('"hud":{"tl":"LIVE"}');
  });

  it('has an empty theme for a design with none, and no theme style', () => {
    const page = buildScenePage(build()[1]);
    expect(page).toContain('window.__theme={"assets":{},"css":"","hud":{}}');
    expect(page).not.toContain('data-theme');
  });

  it('cannot close its style tag from the CSS', () => {
    const page = buildScenePage(build({ design: { theme: { css: 'a{}</style><script>x</script>' } } })[1]);
    expect(page).not.toMatch(/<style data-theme>[^<]*<\/style><script>x/);
  });

  it('puts the drawing of {{asset:name}} in a fragment and leaves an unknown slot empty', () => {
    expect(fillAssets('<i>{{asset:mascot}}</i><b>{{ asset:none }}</b>', { mascot: svg })).toBe(`<i>${svg}</i><b></b>`);
    expect(fillAssets('{{asset:x}}', undefined)).toBe('');
    const fragments = new Map(FRAGMENTS).set('pulse-ring', { name: 'pulse-ring', manifest: '{}', fragment: '<div>{{asset:mascot}}</div><script>window.__partSeek=function(){};</script>' });
    expect(buildScenePage(build({ design: themed, fragments })[1])).toContain(`<div>${svg}</div>`);
  });
});

describe('a main part that draws the lyric or the hit itself', () => {
  const own = (verse: 'own' | undefined, hit: 'own' | undefined): Catalog => ({ ...CATALOG, parts: CATALOG.parts.map((p) => (p.name === 'pulse-ring' ? { ...p, ...(verse ? { verse } : {}), ...(hit ? { hit } : {}) } : p)) });

  it('leaves #verse out for verse: own and #hit for hit: own, and keeps the other', () => {
    const verse = buildScenePage(build({ catalog: own('own', undefined) })[1]);
    expect(verse).not.toContain('<div id="verse"');
    expect(verse).toContain('<div id="hit"></div>');
    const hit = buildScenePage(build({ catalog: own(undefined, 'own') })[1]);
    expect(hit).toContain('<div id="verse"');
    expect(hit).not.toContain('<div id="hit"');
    expect(buildScenePage(build({ catalog: own('own', 'own') })[1])).not.toContain('id="hitbg"');
  });

  it('still hands the lines to the page, for the part to read', () => {
    expect(buildScenePage(build({ catalog: own('own', undefined) })[0])).toContain('window.__scene=');
  });

  it('draws the page as before when the part declares nothing', () => {
    const page = buildScenePage(build()[1]);
    expect(page).toContain('<div id="verse"></div><div id="hitbg"></div><div id="hit"></div>');
  });
});

describe('fonts and the crossfade in the scene model', () => {
  it('says fonts may differ for a font the server embeds, even though its stack is known', () => {
    const catalog = { fontStacks: { Inter: '"Inter", sans-serif' }, fontFiles: { Inter: { family: 'Inter', weights: [400], licence: 'OFL-1.1' } } };
    const s = build({ design: { display: 'Inter', body: 'Inter' }, catalog });
    expect(s[0].gaps.some((g) => g.kind === 'fonts')).toBe(true);
    expect(s[0].fontFiles).toBeDefined();
    const plain = build({ design: { display: 'Inter', body: 'Inter' }, catalog: { fontStacks: { Inter: '"Inter", sans-serif' } } });
    expect(plain[0].gaps.some((g) => g.kind === 'fonts')).toBe(false);
  });

  it('gives each scene but the first its crossfade, the piece\'s own before the design\'s, capped at two seconds', () => {
    const script: Script = { ...SCRIPT, pieces: SCRIPT.pieces.map((p, i) => (i === 2 ? { ...p, transition_seconds: 0 } : p)) };
    expect([0, 1, 2].map((i) => fadeInto({ transitionSeconds: 0.4 }, script, i))).toEqual([0, 0.4, 0]);
    expect(fadeInto({ transitionSeconds: 5 }, SCRIPT, 1)).toBe(2);
    expect(fadeInto({}, SCRIPT, 1)).toBe(0);
    const s = build({ design: { transitionSeconds: 0.4 } });
    expect(s.map((x) => x.fade)).toEqual([undefined, 0.4, 0.4]);
    expect(s[1].gaps).toContainEqual({ kind: 'crossfade' });
    expect(s[0].gaps).not.toContainEqual({ kind: 'crossfade' });
  });
});

describe('the frames during a crossfade', () => {
  const pages: PlannedPage[] = [{ id: 'a', start: 0, end: 10 }, { id: 'b', start: 10, end: 20, fade: 0.4 }];

  it('blends the next scene in during the fade before its start: half way at 0.2 s before', () => {
    const p = planFrames(pages, 9.8, ['a', 'b']);
    expect(p.current).toBe(0);
    expect(p.blend).toBeCloseTo(0.5);
    expect(p.slots).toEqual(['a', 'b']);
    expect(p.preload).toBe(1);
  });

  it('is a cut before the fade begins and after the cut, and a scene without a crossfade never blends', () => {
    expect(planFrames(pages, 9.5, none()).blend).toBe(0);
    expect(planFrames(pages, 10.1, ['a', 'b']).blend).toBe(0);
    expect(planFrames([{ id: 'a', start: 0, end: 10 }, { id: 'b', start: 10, end: 20 }], 9.99, none()).blend).toBe(0);
  });

  it('loads the next frame early enough for a long fade', () => {
    const long: PlannedPage[] = [{ id: 'a', start: 0, end: 10 }, { id: 'b', start: 10, end: 20, fade: 2 }];
    expect(planFrames(long, 8.5, none()).preload).toBe(1);
    expect(planFrames(long, 8.5, none()).blend).toBeCloseTo(0.25);
  });
});

function none(): readonly [string | null, string | null] {
  return [null, null];
}
