import { PageBuildError, buildScenePage, fillSlots } from './page-builder';
import { scenesOf, type SceneInput } from './scene-model';
import { LAYER_SEEK } from './layer-script';
import { CATALOG, DESIGN, FRAGMENTS, SCRIPT, SONG_MAP } from './test-data';
import type { Script } from '@lab/animation-core';

const scenes = (design = DESIGN): SceneInput[] => scenesOf({ piece: { width: 1280, height: 720, songMap: SONG_MAP }, design, script: SCRIPT, catalog: CATALOG, fragments: FRAGMENTS });

describe('fillSlots', () => {
  it('escapes {{name}} for HTML and writes {{json:name}} safe for a script', () => {
    const out = fillSlots('<b>{{ label }}</b><script>var x={{json:label}};</script>', { label: '</script><b>&"\'' }, 'toggle');
    expect(out).toContain('<b>&lt;/script&gt;&lt;b&gt;&amp;&#34;&#39;</b>');
    expect(out).toContain('var x="\\u003c/script\\u003e\\u003cb\\u003e\\u0026\\"\'";');
    expect(out).not.toContain('</script><b>');
  });

  it('refuses a slot that is not a parameter of the part, naming it', () => {
    expect(() => fillSlots('{{nope}}', { a: 1 }, 'toggle')).toThrow(new PageBuildError('part toggle: the fragment uses {{nope}}, which is not a parameter of the part'));
  });
});

describe('buildScenePage', () => {
  it('writes the colours, the font stacks, the size and the mode of the scene', () => {
    const page = buildScenePage(scenes()[1]);
    expect(page.startsWith('<!doctype html><html><head><meta charset="utf-8"><style>:root{--bg:#101018;--fg:#f4f1ea;--accent:#ff5a3c;--dark:#101018;--light:#f4f1ea;')).toBe(true);
    expect(page).toContain('--display:"Arial Black", "Helvetica Neue", Impact, sans-serif;--body:"Helvetica Neue", Arial, "Liberation Sans", sans-serif}');
    expect(page).toContain('html,body{margin:0;padding:0;width:1280px;height:720px;');
    expect(page).toContain('font-size:44px'); // 720 * 62 / 1000
    expect(page).toContain('<body class="mode-dark">');
  });

  it('swaps background and text in a light scene, and uses a stack of the name for an unknown font', () => {
    const page = buildScenePage(scenes()[2]);
    expect(page).toContain('--bg:#f4f1ea;--fg:#101018;--accent:#00ff00;');
    expect(page).toContain('--display:"Comic Sans", sans-serif;');
    expect(page).toContain('<body class="mode-light">');
  });

  it('puts the scene and the parameters first, then the stage with the main part and the extras in order', () => {
    const page = buildScenePage(scenes()[1]);
    const scene = page.indexOf('<script>window.__scene=');
    const stage = page.indexOf('<div id="stage">');
    expect(scene).toBeGreaterThan(0);
    expect(scene).toBeLessThan(stage);
    expect(page).toContain('window.__params={"rings":3};');
    const main = page.indexOf('<div id="pr">3 rings</div>');
    const extra = page.indexOf('id="ph-counter"');
    expect(main).toBeGreaterThan(stage);
    expect(extra).toBeGreaterThan(main);
    expect(page.match(/window\.__partSeeks=window\.__partSeeks\|\|\[\]/g)).toHaveLength(2);
    expect(page).toContain('<script>window.__params={"to":5};</script>');
  });

  it('writes the scene as the server does, with sorted keys and null for no hit', () => {
    const page = buildScenePage(scenes()[1]);
    expect(page).toContain('window.__scene={"actors":[],"duration":8,"hit":null,"hit_style":"","lines":[],"mode":"dark","song_length":20,"song_start":4};');
  });

  it('keeps the hit and the lines of a piece in its own time', () => {
    const page = buildScenePage(scenes()[0]);
    expect(page).toContain('"hit":{"word":"Hello","at":1,"length":1}');
    expect(page).toContain('"lines":[{"text":"Hello, quiet town","start":1,"end":2.6,"words":[{"t":"Hello,","s":1,"e":1.4},{"t":"quiet","s":1.5,"e":2},{"t":"town","s":2,"e":2.6}],"keyword":1}]');
  });

  it('draws a placeholder card for a part with no fragment, with its name, description and values, escaped', () => {
    const page = buildScenePage(scenes()[0]);
    expect(page).toContain('<div id="ph-toggle"><h3>toggle</h3><p>The toggle part</p><ul><li><b>label</b> on &lt;air&gt;</li><li><b>on</b> true</li></ul></div>');
    expect(page).toContain('Math.sin(Math.PI*p)');
  });

  it('marks the verse class and the hit letters for the looks that have them', () => {
    expect(buildScenePage(scenes({ ...DESIGN, verseStyle: 'karaoke', hitStyle: 'metal' })[0])).toContain('<div id="verse" class="verse-karaoke"></div>');
    expect(buildScenePage(scenes({ ...DESIGN, verseStyle: 'glow', hitStyle: 'glow' })[0])).toContain('"hit_style":"glow"');
    expect(buildScenePage(scenes()[0])).toContain('<div id="verse"></div><div id="hitbg"></div><div id="hit"></div>');
  });

  it('draws the stage as silhouettes at the position the script gives, with the expression rules', () => {
    const page = buildScenePage(scenes()[2]);
    expect(page).toContain('<div id="backdrop"><svg');
    expect(page).toContain('<div class="actor char-bot-a1" id="actor-a1"><svg');
    expect(page).toContain('"actors":[{"id":"a1","scope":"char-bot-a1","action":"bounce","x":30,"y":80,"size":40,');
    expect(page).toContain('#actor-a1 .expr{display:none !important}#actor-a1 .expr-neutral{display:inline !important}');
  });

  it('refuses what the server refuses: no duration, no size, too many extras, a part twice', () => {
    const base = scenes()[1];
    expect(() => buildScenePage({ ...base, duration: 0 })).toThrow('the scene has no duration');
    expect(() => buildScenePage({ ...base, width: 0 })).toThrow('the scene needs a width and a height');
    expect(() => buildScenePage({ ...base, extras: [base.part, base.part, base.part, base.part] })).toThrow('up to 3 extra parts');
    expect(() => buildScenePage({ ...base, extras: [base.part] })).toThrow('is in the piece twice');
  });
});

describe('the font stacks the server gives', () => {
  it('are used in place of the library\'s own, and the font is no longer a gap', () => {
    const catalog = { ...CATALOG, fontStacks: { heavy: 'Impact, fantasy', 'Comic Sans': '"Comic Sans MS", cursive', grotesk: 'Arial, sans-serif' } };
    const out = scenesOf({ piece: { width: 1280, height: 720, songMap: SONG_MAP }, design: DESIGN, script: SCRIPT, catalog, fragments: FRAGMENTS });
    expect(buildScenePage(out[1])).toContain('--display:Impact, fantasy;--body:Arial, sans-serif}');
    expect(buildScenePage(out[2])).toContain('--display:"Comic Sans MS", cursive;');
    expect(out[2].gaps).not.toContainEqual({ kind: 'fonts' });
  });
});

describe('buildScenePage with layers', () => {
  const layered: Script = { ...SCRIPT, layers: [{ id: 'a', items: [{ part: 'pulse-ring', params: { rings: 2 }, start: 5, end: 9 }, { part: 'pulse-ring', start: 14, end: 16, animate: {} }] }] };
  const build = (script: Script, features: string[] = ['layers']) =>
    scenesOf({ piece: { width: 1280, height: 720, songMap: SONG_MAP }, design: DESIGN, script, catalog: { ...CATALOG, features }, fragments: FRAGMENTS });

  it('draws each item in a wrapper after the extras, registered apart, only in the scenes it touches', () => {
    const [, p2, p3] = build(layered);
    const page = buildScenePage(p2);
    expect(page).toContain('<div class="layer" id="layer-0" style="display:none">');
    expect(page).toContain("window.__layers.push({el:document.getElementById('layer-0'),from:5,to:9,seek:typeof window.__partSeek==='function'?window.__partSeek:null})");
    expect(page.indexOf('id="ph-counter"')).toBeLessThan(page.indexOf('id="layer-0"'));
    expect(page).toContain(LAYER_SEEK);
    expect(page).toContain('<script>window.__params={"rings":2};</script>');
    expect(buildScenePage(p3)).toContain("from:14,to:16");
    expect(buildScenePage(p3)).not.toContain('id="layer-1"');
  });

  it('leaves a page without layers as it was', () => {
    const page = buildScenePage(build(SCRIPT)[1]);
    expect(page).not.toContain('__layers');
    expect(page).not.toContain(LAYER_SEEK);
  });

  it('says the browser is the only one to draw layers when the server does not say layers', () => {
    expect(build(layered, [])[1].gaps).toContainEqual({ kind: 'layers' });
    expect(build(layered)[1].gaps).not.toContainEqual({ kind: 'layers' });
  });
});
