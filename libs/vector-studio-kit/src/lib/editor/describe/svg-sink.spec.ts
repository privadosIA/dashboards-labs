import { TestBed } from '@angular/core/testing';
import { ANIMATION, InMemoryAnimation } from '@lab/music-motion';
import { firstValueFrom } from 'rxjs';

import { MODEL_KEY, rememberedModel, rememberModel, SvgSink } from './svg-sink';

function setup(options: ConstructorParameters<typeof InMemoryAnimation>[0] = {}) {
  const data = new Map<string, string>();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) } as Storage;
  const port = new InMemoryAnimation({ storage, writeMs: 5, ...options });
  TestBed.configureTestingModule({ providers: [SvgSink, { provide: ANIMATION, useValue: port }] });
  return TestBed.inject(SvgSink);
}

describe('SvgSink over the in-memory adapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists the models of the adapter, the ones that do not fit marked', async () => {
    const models = await firstValueFrom(setup().models());
    expect(models.default).toBe('qwen3:8b');
    expect(models.models.map((m) => [m.name, m.fits])).toEqual([['qwen3:8b', true], ['gemma4:26b', false]]);
  });

  it('writes a drawing from the text and the model, and without a model lets the server choose', async () => {
    const sink = setup();
    expect(await firstValueFrom(sink.write('a circle', 'qwen3:8b'))).toContain('id="ring"');
    expect(await firstValueFrom(sink.write('some bars', ''))).toContain('id="bar-1"');
  });

  it('fails with the adapter’s words', async () => {
    await expect(firstValueFrom(setup().write('notsvg', ''))).rejects.toThrow(/no <svg>/);
    TestBed.resetTestingModule();
    await expect(firstValueFrom(setup({ assistant: 'missing' }).models())).rejects.toThrow(/no assistant/);
  });

  it('remembers the model in the browser, and works without storage', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) });
    expect(rememberedModel()).toBe('');
    rememberModel('qwen3:8b');
    expect(data.get(MODEL_KEY)).toBe('qwen3:8b');
    expect(rememberedModel()).toBe('qwen3:8b');
    rememberModel('');
    expect(rememberedModel()).toBe('');
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } });
    expect(rememberedModel()).toBe('');
    expect(() => rememberModel('x')).not.toThrow();
  });
});
