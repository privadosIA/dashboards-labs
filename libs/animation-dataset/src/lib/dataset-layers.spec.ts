import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { firstValueFrom } from 'rxjs';

import { CATALOG } from '@lab/animation-core/testing';
import type { Script, SongMap } from '@lab/animation-core';
import { FAKE_SONGS, FakePort } from '../testing/fake-port';
import { validateAnimationDataset, type AnimationDataset } from './dataset-file';
import { itemAnimatedParams, layerNames, planAnimationImport, readCurrentState } from './dataset-plan';
import { runAnimationImport } from './dataset-run';
import { fitScript } from './fit-script';

// Paths from the repository root: with --coverage `__dirname` is the root itself, not this file's folder.
const GOLDEN = join(process.cwd(), 'libs/animation-dataset/src/testing/golden', 'layers.json');
const raw = (): { animation: { script: { pieces: Record<string, unknown>[]; layers: Record<string, unknown>[] } } } => JSON.parse(readFileSync(GOLDEN, 'utf8'));
const golden = (): AnimationDataset => {
  const check = validateAnimationDataset(raw(), 'en');
  if (!check.ok) throw new Error(check.problems.join('; '));
  return check.dataset;
};
const problems = (value: unknown, lang: 'en' | 'es' = 'en'): string[] => {
  const check = validateAnimationDataset(value, lang);
  return check.ok ? [] : check.problems;
};
const withLayers = (layers: unknown): unknown => {
  const r = raw();
  (r.animation.script as { layers: unknown }).layers = layers;
  return r;
};

describe('the layers of a dataset: the shape', () => {
  it('accepts the golden file', () => {
    expect(golden().animation.script.layers).toHaveLength(2);
  });

  it('refuses more than four layers, a layer without a good id, a repeated id and too many items', () => {
    const lane = (id: string) => ({ id, items: [] });
    expect(problems(withLayers(['a', 'b', 'c', 'd', 'e'].map(lane)))).toEqual([expect.stringContaining('layers must be a list of up to 4 layers')]);
    expect(problems(withLayers([lane('Bad Id')]))).toEqual([expect.stringContaining('script.layers[0]: a layer needs an id')]);
    expect(problems(withLayers([lane('a'), lane('a')]))).toEqual([expect.stringContaining('script.layers[1]: a layer needs an id')]);
    expect(problems(withLayers([{ id: 'a', items: Array.from({ length: 33 }, (_, i) => ({ part: 'toggle', start: i, end: i + 0.5 })) }]))).toEqual([expect.stringContaining('script.layers[0]: a layer needs an id')]);
    expect(problems(withLayers('nope'))).toEqual([expect.stringContaining('layers must be a list')]);
  });

  it('names the place of an item that is not one, one outside the song and one that overlaps the one before', () => {
    const list = problems(withLayers([{ id: 'a', items: [{ part: 'toggle', start: 5 }, { part: 'toggle', start: 0, end: 10 }, { part: 'toggle', start: 8, end: 12 }, { part: 'toggle', start: 40, end: 99 }] }]));
    expect(list).toEqual([
      expect.stringContaining('script.layers[0].items[0]: an item needs a part, and a start and an end'),
      expect.stringContaining('script.layers[0].items[2]: an item must lie inside the song (0 to 48 s)'),
      expect.stringContaining('script.layers[0].items[3]: an item must lie inside the song (0 to 48 s)'),
    ]);
  });

  it('checks the keyframes of an item against the length of the item', () => {
    const list = problems(withLayers([{ id: 'a', items: [{ part: 'counter', start: 10, end: 20, animate: { to: [{ t: 11, value: 1 }] } }] }]));
    expect(list).toEqual([expect.stringContaining('script.layers[0].items[0].animate.to[0]: t must be a number from 0 to 10')]);
  });

  it('says it in Spanish', () => {
    expect(problems(withLayers('nope'), 'es')).toEqual([expect.stringContaining('layers debe ser una lista de hasta 4 capas')]);
  });
});

describe('the layers of a dataset: importing where the server does not take them', () => {
  const withoutLayers = (): FakePort => new FakePort(FAKE_SONGS, { ...CATALOG, features: ['animate'], parts: CATALOG.parts.map((p) => (p.name === 'counter' ? { ...p, params: p.params.map((q) => ({ ...q, animatable: true })) } : p)) });
  const withoutAnything = (): FakePort => new FakePort(FAKE_SONGS, CATALOG);

  it('names the layers, and the keyframes of their items', () => {
    expect(layerNames(golden().animation.script)).toEqual(['layer "strip"', 'layer "counting"']);
    expect(itemAnimatedParams(golden().animation.script)).toEqual(['layer "counting" item #1: to']);
  });

  it('plans the animation with the reason and what would be dropped', async () => {
    const file = golden();
    const port = withoutLayers();
    const animation = planAnimationImport(file, await readCurrentState(port, file)).items.find((i) => i.kind === 'animation')!;
    expect(animation).toMatchObject({ action: 'create', reason: 'layers-unsupported', drops: ['layers'], detail: ['layer "strip"', 'layer "counting"'] });
    const neither = planAnimationImport(file, await readCurrentState(withoutAnything(), file)).items.find((i) => i.kind === 'animation')!;
    expect(neither).toMatchObject({ reason: 'layers-unsupported', drops: ['animate', 'layers'], detail: ['layer "strip"', 'layer "counting"', 'layer "counting" item #1: to'] });
  });

  it('plans it plainly where the server takes layers', async () => {
    const file = golden();
    const animation = planAnimationImport(file, await readCurrentState(new FakePort(), file)).items.find((i) => i.kind === 'animation')!;
    expect(animation.reason).toBeUndefined();
  });

  it('leaves it alone until the person agrees, then makes it without the layers', async () => {
    const file = golden();
    const port = withoutLayers();
    const plan = planAnimationImport(file, await readCurrentState(port, file));
    const skipped = await runAnimationImport(file, plan, port, { keepLocal: () => false, pollMs: 1 });
    expect(skipped.find((r) => r.kind === 'animation')).toMatchObject({ state: 'skipped', code: 'layers-unsupported' });
    expect(await firstValueFrom(port.pieces())).toHaveLength(0);
    const made = await runAnimationImport(file, plan, port, { keepLocal: () => false, pollMs: 1, dropAnimate: true });
    const result = made.find((r) => r.kind === 'animation')!;
    expect(result).toMatchObject({ state: 'created', code: 'layers-unsupported' });
    const piece = await firstValueFrom(port.piece(result.pieceId!));
    expect(piece.script.layers).toBeUndefined();
    expect(piece.script.pieces).toHaveLength(2);
  });

  it('drops the keyframes of the items too where the server takes neither', async () => {
    const file = golden();
    const port = withoutAnything();
    const plan = planAnimationImport(file, await readCurrentState(port, file));
    const made = await runAnimationImport(file, plan, port, { keepLocal: () => false, pollMs: 1, dropAnimate: true });
    const piece = await firstValueFrom(port.piece(made.find((r) => r.kind === 'animation')!.pieceId!));
    expect(JSON.stringify(piece.script)).not.toMatch(/layers|animate/);
  });

  it('keeps the layers where the server takes them', async () => {
    const file = golden();
    const port = new FakePort();
    const plan = planAnimationImport(file, await readCurrentState(port, file));
    const made = await runAnimationImport(file, plan, port, { keepLocal: () => false, pollMs: 1 });
    const piece = await firstValueFrom(port.piece(made.find((r) => r.kind === 'animation')!.pieceId!));
    expect(piece.script.layers).toEqual(golden().animation.script.layers);
  });
});

describe('fitting layers to another song', () => {
  const map = (duration: number): SongMap => ({ duration, bpm: 100, beats: [], beatBase: 0, gridAnchored: true, sections: [], words: [], wordsEstimated: false, loudnessHop: 0.1, loudness: [] });

  it('scales the times of the items with the song and the keyframes with their item', () => {
    const script: Script = golden().animation.script;
    const fitted = fitScript(script, 48, map(24), { modes: {} });
    expect(fitted.layers![0].items).toEqual([{ part: 'wire-sphere', params: { detail: 12 }, start: 0, end: 24 }]);
    const counting = fitted.layers![1].items;
    expect(counting.map((i) => [i.start, i.end])).toEqual([[5, 15], [15, 20]]);
    expect(counting[0].animate!['to'].map((k) => k.t)).toEqual([0, 10]);
  });

  it('keeps an item inside the song and in order, and drops one that collapses', () => {
    const script: Script = { version: 1, pieces: [{ id: 'p1', start: 0, end: 100, part: 'toggle' }], layers: [{ id: 'a', items: [{ part: 'strip', start: 0, end: 50 }, { part: 'ticker', start: 50, end: 50.6 }, { part: 'x', start: 51, end: 100 }] }] };
    const fitted = fitScript(script, 100, map(10), { modes: {} });
    expect(fitted.layers![0].items.map((i) => [i.part, i.start, i.end])).toEqual([['strip', 0, 5], ['x', 5.1, 10]]);
  });

  it('keeps a script without layers without the field', () => {
    expect('layers' in fitScript({ version: 1, pieces: [{ id: 'p1', start: 0, end: 10, part: 'toggle' }] }, 10, map(20), { modes: {} })).toBe(false);
  });
});
