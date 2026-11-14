import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { firstValueFrom } from 'rxjs';

import { CATALOG } from '@lab/animation-core/testing';
import type { Script, SongMap } from '@lab/animation-core';
import { FakePort } from '../testing/fake-port';
import { FAKE_SONGS } from '../testing/fake-port';
import { MAX_KEYFRAMES, validateAnimationDataset, type AnimationDataset } from './dataset-file';
import { animatedParams, planAnimationImport, readCurrentState } from './dataset-plan';
import { runAnimationImport } from './dataset-run';
import { fitScript } from './fit-script';

const golden = (): AnimationDataset => {
  const raw = JSON.parse(readFileSync(join(process.cwd(), 'libs/animation-dataset/src/testing/golden', 'keyframes.json'), 'utf8')) as unknown;
  const check = validateAnimationDataset(raw, 'en');
  if (!check.ok) throw new Error(check.problems.join('; '));
  return check.dataset;
};

/** The same file with its first piece's `to` keyframes replaced. */
const withKeyframes = (keyframes: unknown, where: 'piece' | 'extra' = 'piece'): unknown => {
  const raw = JSON.parse(readFileSync(join(process.cwd(), 'libs/animation-dataset/src/testing/golden', 'keyframes.json'), 'utf8')) as { animation: { script: { pieces: Record<string, unknown>[] } } };
  const pieces = raw.animation.script.pieces;
  if (where === 'piece') (pieces[0]['animate'] as Record<string, unknown>)['to'] = keyframes;
  else ((pieces[1]['with'] as Record<string, unknown>[])[0]['animate'] as Record<string, unknown>)['to'] = keyframes;
  return raw;
};
const problems = (raw: unknown, lang: 'en' | 'es' = 'en'): string[] => {
  const check = validateAnimationDataset(raw, lang);
  return check.ok ? [] : check.problems;
};

describe('the keyframes of a dataset: the shape', () => {
  it('accepts the golden file, with and without ease, on a piece and on an extra', () => {
    expect(golden().animation.script.pieces[0].animate?.['to']).toHaveLength(3);
    expect(problems(withKeyframes([{ t: 0, value: 1 }]))).toEqual([]);
  });

  it('lists every problem of malformed keyframes with its place, and nothing is made', () => {
    const list = problems(withKeyframes([{ t: 3 }, { t: 1, value: 2, ease: 'bounce' }]));
    expect(list).toEqual([
      expect.stringContaining('animation.script.pieces[0].animate.to[0]: needs a value'),
      expect.stringContaining('animation.script.pieces[0].animate.to[1]: t must be a number from 0 to 24'),
      expect.stringContaining('animation.script.pieces[0].animate.to[1]: ease must be one of linear, in, out, in-out, step'),
    ]);
  });

  it('refuses times that do not increase or that fall outside the piece', () => {
    expect(problems(withKeyframes([{ t: 2, value: 1 }, { t: 2, value: 2 }]))).toHaveLength(1);
    expect(problems(withKeyframes([{ t: -1, value: 1 }]))).toHaveLength(1);
    expect(problems(withKeyframes([{ t: 25, value: 1 }]))).toHaveLength(1);
    expect(problems(withKeyframes([{ t: 24, value: 1 }]))).toEqual([]);
  });

  it('refuses a parameter with no keyframe, more than the most, a keyframe that is not an object and an animate that is not an object', () => {
    expect(problems(withKeyframes([]))).toEqual([expect.stringContaining('1 to 200 keyframes')]);
    expect(problems(withKeyframes(Array.from({ length: MAX_KEYFRAMES + 1 }, (_, i) => ({ t: i / 100, value: i }))))).toEqual([expect.stringContaining('1 to 200 keyframes')]);
    expect(problems(withKeyframes([5]))).toEqual([expect.stringContaining('a keyframe must be an object')]);
    const raw = withKeyframes([{ t: 0, value: 1 }]) as { animation: { script: { pieces: Record<string, unknown>[] } } };
    raw.animation.script.pieces[0]['animate'] = [1];
    expect(problems(raw)).toEqual([expect.stringContaining('animate must be an object of parameter names')]);
  });

  it('checks the keyframes of an extra part against the length of its piece', () => {
    expect(problems(withKeyframes([{ t: 30, value: 1 }], 'extra'))).toEqual([expect.stringContaining('pieces[1].with[0].animate.to[0]: t must be a number from 0 to 24')]);
  });

  it('says it in Spanish too', () => {
    expect(problems(withKeyframes([{ t: 3 }]), 'es')).toEqual([expect.stringContaining('necesita un value')]);
  });

  it('keeps the version of the format', () => {
    expect((JSON.parse(readFileSync(join(process.cwd(), 'libs/animation-dataset/src/testing/golden', 'keyframes.json'), 'utf8')) as { version: number }).version).toBe(2);
  });
});

describe('the keyframes of a dataset: importing where the server does not take them', () => {
  const portWithoutFeature = (): FakePort => new FakePort(FAKE_SONGS, CATALOG);

  it('names the parameters of the pieces and of the extras', () => {
    expect(animatedParams(golden().animation.script)).toEqual(['p1: to', 'p1: speed', 'p2 (counter): to']);
  });

  it('plans the animation with the reason and what would be dropped, when the catalog lacks the feature', async () => {
    const file = golden();
    const port = portWithoutFeature();
    const plan = planAnimationImport(file, await readCurrentState(port, file));
    const animation = plan.items.find((i) => i.kind === 'animation')!;
    expect(animation).toMatchObject({ action: 'create', reason: 'animate-unsupported', detail: ['p1: to', 'p1: speed', 'p2 (counter): to'] });
  });

  it('plans it plainly when the catalog has the feature, and when the catalog cannot be read', async () => {
    const file = golden();
    const withFeature = planAnimationImport(file, await readCurrentState(new FakePort(), file));
    expect(withFeature.items.find((i) => i.kind === 'animation')).toMatchObject({ action: 'create' });
    expect(withFeature.items.find((i) => i.kind === 'animation')?.reason).toBeUndefined();
    const unknown = planAnimationImport(file, { ...(await readCurrentState(new FakePort(), file)), catalog: null });
    expect(unknown.items.find((i) => i.kind === 'animation')?.reason).not.toBe('animate-unsupported');
  });

  it('leaves the animation alone until the person agrees, and makes nothing', async () => {
    const file = golden();
    const port = portWithoutFeature();
    const plan = planAnimationImport(file, await readCurrentState(port, file));
    const results = await runAnimationImport(file, plan, port, { keepLocal: () => false, pollMs: 1 });
    expect(results.find((r) => r.kind === 'animation')).toMatchObject({ state: 'skipped', code: 'animate-unsupported' });
    expect(await firstValueFrom(port.pieces())).toHaveLength(0);
  });

  it('makes it without the keyframes, and says so, once the person agrees', async () => {
    const file = golden();
    const port = portWithoutFeature();
    const plan = planAnimationImport(file, await readCurrentState(port, file));
    const results = await runAnimationImport(file, plan, port, { keepLocal: () => false, pollMs: 1, dropAnimate: true });
    const made = results.find((r) => r.kind === 'animation')!;
    expect(made).toMatchObject({ state: 'created', code: 'animate-unsupported' });
    const piece = await firstValueFrom(port.piece(made.pieceId!));
    expect(JSON.stringify(piece.script)).not.toContain('animate');
    expect(piece.script.pieces.map((p) => [p.id, p.part, p.params])).toEqual([['p1', 'counter', { to: 50, speed: 1.5 }], ['p2', 'toggle', { label: 'one', on: false }]]);
    expect(piece.script.pieces[0].with).toEqual([{ part: 'toggle', params: { label: 'allow', on: true } }]);
  });

  it('keeps the keyframes where the server takes them', async () => {
    const file = golden();
    const port = new FakePort();
    const plan = planAnimationImport(file, await readCurrentState(port, file));
    const results = await runAnimationImport(file, plan, port, { keepLocal: () => false, pollMs: 1 });
    const made = results.find((r) => r.kind === 'animation')!;
    expect(made.state).toBe('created');
    expect((await firstValueFrom(port.piece(made.pieceId!))).script.pieces[0].animate?.['to']).toHaveLength(3);
  });
});

describe('fitting a script with keyframes to another song', () => {
  const map = (duration: number): SongMap => ({ duration, bpm: 100, beats: [], beatBase: 0, gridAnchored: true, sections: [], words: [], wordsEstimated: false, loudnessHop: 0.1, loudness: [] });

  it('scales the times of the keyframes with their piece, on the main part and on the extras', () => {
    const script: Script = golden().animation.script;
    const fitted = fitScript(script, 48, map(24), { modes: {} });
    expect(fitted.pieces.map((p) => [p.start, p.end])).toEqual([[0, 12], [12, 24]]);
    expect(fitted.pieces[0].animate?.['to'].map((k) => k.t)).toEqual([0, 6, 12]);
    expect(fitted.pieces[0].animate?.['speed'].map((k) => k.t)).toEqual([0, 12]);
    expect(fitted.pieces[1].with![0].animate?.['to'].map((k) => k.t)).toEqual([1, 5]);
    expect(fitted.pieces[0].animate?.['to'].map((k) => k.ease)).toEqual(['in', 'out', undefined]);
  });

  it('keeps the times when the song is the same length', () => {
    const script: Script = golden().animation.script;
    expect(fitScript(script, 48, map(48), { modes: {} }).pieces[0].animate).toEqual(script.pieces[0].animate);
  });
});
