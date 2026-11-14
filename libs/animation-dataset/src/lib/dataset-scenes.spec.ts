import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { firstValueFrom } from 'rxjs';

import type { Catalog, Part } from '@lab/animation-core';
import { FAKE_CATALOG, FakePort } from '../testing/fake-port';
import { buildAnimationExport } from './dataset-export';
import { validateAnimationDataset, type AnimationDataset } from './dataset-file';
import { planAnimationImport, readCurrentState, sceneOf } from './dataset-plan';
import { runAnimationImport } from './dataset-run';

// Paths from the repository root: with --coverage `__dirname` is the root itself, not this file's folder.
const GOLDEN = join(process.cwd(), 'libs/animation-dataset/src/testing/golden', 'scenes.json');
const raw = (): { animation: { design: Record<string, unknown>; script: { pieces: Record<string, unknown>[] }; parts: { name: string; text: { manifest: string } }[] } } => JSON.parse(readFileSync(GOLDEN, 'utf8'));
const golden = (): AnimationDataset => {
  const check = validateAnimationDataset(raw(), 'en');
  if (!check.ok) throw new Error(check.problems.join('; '));
  return check.dataset;
};
const problems = (value: unknown, lang: 'en' | 'es' = 'en'): string[] => {
  const check = validateAnimationDataset(value, lang);
  return check.ok ? [] : check.problems;
};
const withDesign = (patch: Record<string, unknown>): unknown => {
  const r = raw();
  Object.assign(r.animation.design, patch);
  return r;
};
const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

/** The catalog of a server with the theme: it has the two parts for layers. */
const THEME_PART = (name: string): Part => ({ name, description: name, levels: ['simple', 'medium', 'advanced'], costMs: 5, manual: true, params: [], source: 'builtin' });
const THEMED: Catalog = { ...FAKE_CATALOG, features: [...FAKE_CATALOG.features, 'scene', 'theme'], parts: [...FAKE_CATALOG.parts, THEME_PART('hud-chrome'), THEME_PART('grain')] };

describe('the theme and the crossfade of a dataset', () => {
  it('accepts the golden file with its theme, its crossfade and the one of a script piece', () => {
    const a = golden().animation;
    expect(a.design.theme?.hud).toEqual({ tl: 'QUIET TOWN', br: '00:48' });
    expect(a.design.transitionSeconds).toBe(0.3);
    expect(a.script.pieces[0].transition_seconds).toBe(0);
  });

  it.each([
    ['a css over 20 KB', { theme: { css: 'a'.repeat(20481) } }, 'design.theme.css'],
    ['a css that is not text', { theme: { css: 3 } }, 'design.theme.css'],
    ['six assets', { theme: { assets: Object.fromEntries('abcdef'.split('').map((n) => [n, svg])) } }, 'design.theme.assets'],
    ['an asset over 50 KB', { theme: { assets: { big: 'x'.repeat(51201) } } }, 'design.theme.assets'],
    ['an asset name with a capital', { theme: { assets: { Big: svg } } }, 'design.theme.assets'],
    ['a hud text over 40 characters', { theme: { hud: { tl: 'x'.repeat(41) } } }, 'design.theme.hud'],
    ['a hud corner that is not one', { theme: { hud: { top: 'x' } } }, 'design.theme.hud'],
    ['a crossfade of 3 seconds', { transitionSeconds: 3 }, 'design.transitionSeconds'],
    ['a negative crossfade', { transitionSeconds: -1 }, 'design.transitionSeconds'],
  ])('refuses %s and names where it is', (_name, patch, at) => {
    const list = problems(withDesign(patch));
    expect(list).toHaveLength(1);
    expect(list[0]).toContain(at);
  });

  it('says it in Spanish too', () => {
    expect(problems(withDesign({ transitionSeconds: 3 }), 'es')[0]).toContain('el fundido debe ser un número de segundos de 0 a 2');
    expect(problems(withDesign({ theme: { hud: { tl: 'x'.repeat(41) } } }), 'es')[0]).toContain('el hud del tema');
  });

  it('refuses the crossfade of a script piece out of range, naming the piece', () => {
    const r = raw();
    r.animation.script.pieces[1]['transition_seconds'] = 2.5;
    const list = problems(r);
    expect(list).toEqual([expect.stringContaining('script.pieces[1].transition_seconds')]);
  });

  it('accepts a file with none of it, as before', () => {
    const r = raw();
    delete r.animation.design['theme'];
    delete r.animation.design['transitionSeconds'];
    expect(problems(r)).toEqual([]);
  });
});

describe('the scenes of a dataset', () => {
  const port = (): FakePort => new FakePort(undefined, THEMED);

  it('reads the scene a manifest says it is', () => {
    expect(sceneOf(raw().animation.parts[0].text.manifest)).toEqual({ piece: 'old-piece', script_piece: 'p1' });
    expect(sceneOf('{"name":"x"}')).toBeUndefined();
    expect(sceneOf('not json')).toBeUndefined();
    expect(sceneOf('{"scene":{"piece":1}}')).toBeUndefined();
  });

  it('plans the scenes as parts to make again, whatever the catalog has by the old name, and the animation is not held up by them', async () => {
    const p = port();
    const plan = planAnimationImport(golden(), await readCurrentState(p, golden()));
    expect(plan.scenes).toBe(2);
    const parts = plan.items.filter((i) => i.kind === 'part');
    expect(parts.map((i) => [i.label, i.action, i.scene])).toEqual([['scene-old-1', 'create', true], ['scene-old-2', 'create', true]]);
    expect(plan.items.find((i) => i.kind === 'animation')).toMatchObject({ action: 'create' });
  });

  it('makes the piece first, then every scene for it under a new name, approved, with the script pointing to them', async () => {
    const p = port();
    const file = golden();
    const plan = planAnimationImport(file, await readCurrentState(p, file));
    const results = await runAnimationImport(file, plan, p, { keepLocal: () => false, pollMs: 1 });
    expect(results.filter((r) => r.state === 'failed')).toEqual([]);
    const made = results.find((r) => r.kind === 'animation')!;
    expect(made.state).toBe('created');
    const scenes = results.filter((r) => r.scene);
    expect(scenes.map((r) => r.state)).toEqual(['created', 'created']);
    const piece = await firstValueFrom(p.piece(made.pieceId!));
    const names = piece.script.pieces.map((x) => x.part);
    expect(names).toHaveLength(2);
    expect(names.every((n) => /^scene-[a-z0-9]+-\d$/.test(n) && n !== 'scene-old-1' && n !== 'scene-old-2')).toBe(true);
    const catalog = await firstValueFrom(p.catalog());
    for (const name of names) {
      const part = catalog.parts.find((x) => x.name === name)!;
      expect(part.scene).toEqual({ piece: made.pieceId, scriptPiece: piece.script.pieces[names.indexOf(name)].id });
      const text = await firstValueFrom(p.partText(name));
      expect(JSON.parse(text.manifest)).toMatchObject({ name, verse: 'own', scene: { piece: made.pieceId } });
    }
    expect(piece.design.design.theme?.css).toContain('#verse');
  });

  it('leaves the scenes unmade and says so when the animation is not made', async () => {
    const p = port();
    const file = golden();
    const plan = planAnimationImport(file, await readCurrentState(p, file));
    const results = await runAnimationImport(file, plan, p, { keepLocal: () => false, pollMs: 1, signal: AbortSignal.abort() });
    expect(results.filter((r) => r.scene).map((r) => r.state)).toEqual(['skipped', 'skipped']);
  });

  it('removes the piece and fails the animation when a scene cannot be made', async () => {
    const p = port();
    const file = golden();
    file.animation.parts![1] = { ...file.animation.parts![1], text: { ...file.animation.parts![1].text!, manifest: JSON.stringify({ name: 'scene-old-2', scene: { piece: 'x', script_piece: 'p2' } }) } };
    const plan = planAnimationImport(file, await readCurrentState(p, file));
    const make = p.createDraftFromText.bind(p);
    let calls = 0;
    p.createDraftFromText = ((t) => (++calls === 2 ? ({ subscribe: () => { throw new Error('the checks refused it'); } } as never) : make(t))) as typeof p.createDraftFromText;
    const results = await runAnimationImport(file, plan, p, { keepLocal: () => false, pollMs: 1 });
    expect(results.find((r) => r.kind === 'animation')).toMatchObject({ state: 'failed' });
    expect(results.filter((r) => r.scene).map((r) => r.state)).toEqual(['created', 'failed']);
    expect(await firstValueFrom(p.pieces())).toEqual([]);
  });

  it('exports a piece with scenes as own parts that carry their text, and imports that again', async () => {
    const p = port();
    const file = golden();
    const run = async (f: AnimationDataset) => runAnimationImport(f, planAnimationImport(f, await readCurrentState(p, f)), p, { keepLocal: () => false, pollMs: 1 });
    const first = (await run(file)).find((r) => r.kind === 'animation')!;
    const exported = await buildAnimationExport(p, first.pieceId!, undefined, () => new Date('2026-11-13T10:00:00Z'));
    expect(exported.animation.parts).toHaveLength(2);
    for (const part of exported.animation.parts!) {
      expect(part.text).not.toBeNull();
      expect(sceneOf(part.text!.manifest)).toMatchObject({ piece: first.pieceId });
    }
    const again = (await run(exported)).filter((r) => r.scene);
    expect(again.map((r) => r.state)).toEqual(['created', 'created']);
    expect((await firstValueFrom(p.pieces())).length).toBe(2);
  });
});
