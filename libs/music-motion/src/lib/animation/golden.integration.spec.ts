import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { firstValueFrom } from 'rxjs';

import { sceneOf, buildAnimationExport, countResults, planAnimationImport, readCurrentState, runAnimationImport, validateAnimationDataset, type AnimationDataset } from '@lab/animation-dataset';

import { InMemoryAnimation } from './in-memory.adapter';
import { expectScenesAgain } from '../../../../animation-dataset/src/testing/scenes-again';

// The golden files of @lab/animation-dataset, read from the other side: through the in-memory adapter instead of the fake port.
// Paths from the repository root: with --coverage `__dirname` is the root itself, not this file's folder.
const DIR = join(process.cwd(), 'libs/animation-dataset/src/testing/golden');
const NAMES = readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));

async function roundTrip(file: AnimationDataset): Promise<AnimationDataset> {
  const port = new InMemoryAnimation({ stepMs: 100, pollMs: 5, analyseMs: 20, writeMs: 20 });
  const run = async () => {
    const plan = planAnimationImport(file, await readCurrentState(port, file));
    return runAnimationImport(file, plan, port, { keepLocal: () => false, pollMs: 5 });
  };
  let results = await run();
  if (results.some((r) => r.code === 'parts-missing')) {
    for (const d of await firstValueFrom(port.drafts())) await firstValueFrom(port.approveDraft(d.id));
    results = await run();
  }
  expect(results.filter((r) => r.state === 'failed')).toEqual([]);
  const made = results.find((r) => r.kind === 'animation' && r.state === 'created')!;
  return buildAnimationExport(port, made.pieceId!, undefined, () => new Date('2026-11-09T10:00:00.000Z'));
}

describe('the golden datasets through the in-memory adapter', () => {
  it.each(NAMES)('%s imports and exports again without loss', async (name) => {
    const check = validateAnimationDataset(JSON.parse(readFileSync(join(DIR, `${name}.json`), 'utf8')), 'en');
    if (!check.ok) throw new Error(check.problems.join('; '));
    const again = await roundTrip(check.dataset);
    // An approved part of the user's cannot be read back from the server: it goes as its description and parameters, with no text.
    const a = check.dataset.animation;
    if (a.parts?.some((p) => p.text && sceneOf(p.text.manifest))) return expectScenesAgain(a, again.animation);
    const expected = a.parts ? { ...a, parts: a.parts.map((p) => ({ name: p.name, description: p.description, levels: ['simple', 'medium', 'advanced'], params: [], text: null })) } : a;
    expect(again.animation).toEqual(expected);
  });
});
