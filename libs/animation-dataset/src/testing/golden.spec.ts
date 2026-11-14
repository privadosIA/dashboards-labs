import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { firstValueFrom } from 'rxjs';

import { buildAnimationExport } from '../lib/dataset-export';
import { type AnimationDataset, validateAnimationDataset } from '../lib/dataset-file';
import { countResults, runAnimationImport } from '../lib/dataset-run';
import { planAnimationImport, readCurrentState } from '../lib/dataset-plan';
import { FakePort } from './fake-port';
import { expectScenesAgain } from './scenes-again';
import { sceneOf } from '../lib/dataset-plan';

// Paths from the repository root: with --coverage `__dirname` is the root itself, not this file's folder.
const DIR = join(process.cwd(), 'libs/animation-dataset/src/testing/golden');
const NAMES = readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
const read = (name: string): unknown => JSON.parse(readFileSync(join(DIR, `${name}.json`), 'utf8'));

async function roundTrip(file: AnimationDataset): Promise<AnimationDataset> {
  const port = new FakePort();
  const run = async () => {
    const plan = planAnimationImport(file, await readCurrentState(port, file));
    return runAnimationImport(file, plan, port, { keepLocal: () => false, pollMs: 1 });
  };
  let results = await run();
  // An own part counts only once its draft is approved: the owner does that, then imports again.
  if (results.some((r) => r.code === 'parts-missing')) {
    for (const d of await firstValueFrom(port.drafts())) await firstValueFrom(port.approveDraft(d.id));
    results = await run();
  }
  expect(countResults(results).failed).toBe(0);
  const made = results.find((r) => r.kind === 'animation' && r.state === 'created')!;
  return buildAnimationExport(port, made.pieceId!, undefined, () => new Date('2026-11-09T10:00:00.000Z'));
}

describe('golden datasets', () => {
  it('has at least the three shapes', () => {
    expect(NAMES).toEqual(expect.arrayContaining(['typographic-simple', 'illustrated-stage', 'extras-and-overrides']));
  });

  it.each(NAMES)('%s is accepted by the validator', (name) => {
    const check = validateAnimationDataset(read(name), 'en');
    expect(check.ok).toBe(true);
  });

  it.each(NAMES)('%s imports and exports again without loss', async (name) => {
    const check = validateAnimationDataset(read(name), 'en');
    if (!check.ok) throw new Error(check.problems.join('; '));
    const again = await roundTrip(check.dataset);
    if (check.dataset.animation.parts?.some((p) => p.text && sceneOf(p.text.manifest))) return expectScenesAgain(check.dataset.animation, again.animation);
    expect(again.animation).toEqual(check.dataset.animation);
  });

  it('keeps an unknown field at the animation level and at the piece level', async () => {
    const raw = structuredClone(read('typographic-simple')) as { animation: Record<string, unknown> & { script: { pieces: Record<string, unknown>[] } } };
    raw.animation['x_editor'] = { zoom: 2 };
    raw.animation.script.pieces[0]['x_editor'] = { lane: 3 };
    const check = validateAnimationDataset(raw, 'en');
    if (!check.ok) throw new Error(check.problems.join('; '));
    expect((check.dataset.animation as unknown as Record<string, unknown>)['x_editor']).toEqual({ zoom: 2 });
    const again = await roundTrip(check.dataset);
    expect((again.animation.script.pieces[0] as unknown as Record<string, unknown>)['x_editor']).toEqual({ lane: 3 });
  });
});
