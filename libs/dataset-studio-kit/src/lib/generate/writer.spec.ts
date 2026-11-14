import { ApiError } from '@lab/api-client';
import { firstValueFrom, of, throwError } from 'rxjs';

import { GenerateFailed, ServerWriter, wireExamples } from './writer';

const fake = (answer: unknown) => {
  const calls: { path: string; body: unknown }[] = [];
  const api = { post: (path: string, options: { body: unknown }) => (calls.push({ path, body: options.body }), answer instanceof Error ? throwError(() => answer) : of(answer)) };
  return { api: api as never, calls };
};

describe('wireExamples', () => {
  it('puts the tags in one comma-separated string, as the contract takes them, and leaves out what is empty', () => {
    expect(wireExamples([{ prompt: 'a', negative: 'n', tags: ['x', 'y'] }, { prompt: 'b', tags: [] }])).toEqual([{ prompt: 'a', negative: 'n', tags: 'x, y' }, { prompt: 'b' }]);
    expect(wireExamples([])).toBeUndefined();
    expect(wireExamples(undefined)).toBeUndefined();
  });
});

describe('ServerWriter', () => {
  it('sends the examples of an image call with their tags as a string', async () => {
    const { api, calls } = fake({ text: ' a prompt ' });
    expect(await firstValueFrom(new ServerWriter(api).image({ text: 't', examples: [{ prompt: 'p', tags: ['a', 'b'] }] }))).toBe('a prompt');
    expect(calls[0]).toEqual({ path: '/api/assist', body: { task: 'image', text: 't', examples: [{ prompt: 'p', tags: 'a, b' }] } });
  });

  it('calls the dataset writer with the sentence, the engine, the negative, the look, the variants and the examples, and reads the tuples and the warnings', async () => {
    const { api, calls } = fake({ entries: [['s01', 'T', '', 'x']], mode: 'video', warnings: ['one dropped'] });
    const out = await firstValueFrom(new ServerWriter(api).dataset({ mode: 'video', text: 'bees', language: 'en', engine: 'ltx', negative: 'blur', look: 'photorealistic', images: { variants: 2 }, examples: [{ prompt: 'p', tags: ['t'] }], model: 'qwen3:8b' }));
    expect(out).toEqual({ entries: [['s01', 'T', '', 'x']], warnings: ['one dropped'] });
    expect(calls[0]).toEqual({ path: '/api/assist/dataset', body: { mode: 'video', text: 'bees', language: 'en', engine: 'ltx', negative: 'blur', look: 'photorealistic', images: { variants: 2 }, examples: [{ prompt: 'p', tags: 't' }], model: 'qwen3:8b' } });
  });

  it('says why in words: a run in progress, a refusal (nothing usable written), no assistant', async () => {
    for (const [status, kind] of [[409, 'busy'], [422, 'refused'], [503, 'unavailable']] as const) {
      const err = await firstValueFrom(new ServerWriter(fake(new ApiError(status, 'unknown', 'x')).api).music({ text: 't', generator: 'ace-step', instrumental: false })).catch((e) => e);
      expect(err).toBeInstanceOf(GenerateFailed);
      expect((err as GenerateFailed).kind).toBe(kind);
    }
  });
});
