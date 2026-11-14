import { firstValueFrom, type Observable } from 'rxjs';

import { DEMO_IMAGE_MODELS, InMemoryImageEdit } from './in-memory.adapter';
import { DEFAULT_EDIT, type EditRequest } from './model';
import { EditRefused } from './validate';

const image = { name: 'a.png', dataUrl: 'data:image/png;base64,AAAA' };
const request = (patch: Partial<EditRequest> = {}): EditRequest => ({ ...DEFAULT_EDIT, image, model: 'balanced', prompt: 'make it watercolor', ...patch });

function collect<T>(source: Observable<T>) {
  const seen: T[] = [];
  const done = { complete: false, error: undefined as unknown };
  source.subscribe({ next: (v) => seen.push(v), complete: () => (done.complete = true), error: (e) => (done.error = e) });
  return { seen, done };
}

describe('InMemoryImageEdit', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  describe('the models', () => {
    it('lists demonstration models, each with an identifier, a name and a description, all identifiers different', async () => {
      const models = await firstValueFrom(new InMemoryImageEdit().models());
      expect(models.length).toBeGreaterThan(0);
      expect(models).toEqual(DEMO_IMAGE_MODELS);
      for (const m of models) {
        expect(m.id.trim()).not.toBe('');
        expect(m.name.trim()).not.toBe('');
        expect(m.description.trim()).not.toBe('');
      }
      expect(new Set(models.map((m) => m.id)).size).toBe(models.length);
    });

    it('says what each takes: at least one takes neither a strength nor a negative prompt, and one makes more than 4 variants', () => {
      expect(DEMO_IMAGE_MODELS.some((m) => !m.strength && !m.negativePrompt)).toBe(true);
      expect(DEMO_IMAGE_MODELS.some((m) => m.maxVariants > 4)).toBe(true);
      for (const m of DEMO_IMAGE_MODELS) expect(m.maxVariants).toBeGreaterThanOrEqual(1);
    });

    it('edits with each model it lists', async () => {
      const a = new InMemoryImageEdit({ pace: 0 });
      for (const m of DEMO_IMAGE_MODELS.filter((x) => x.available)) {
        const run = collect(a.edit(request({ model: m.id, variants: 1 })));
        await vi.advanceTimersByTimeAsync(0);
        expect(run.done.error, m.id).toBeUndefined();
        expect(run.seen).toHaveLength(1);
      }
    });

    it('lists a model that cannot be used, marked, and refuses it', async () => {
      const a = new InMemoryImageEdit({ pace: 0 });
      const off = DEMO_IMAGE_MODELS.find((m) => !m.available)!;
      expect(off.reason).toBeTruthy();
      expect(DEMO_IMAGE_MODELS.some((m) => m.available)).toBe(true);
      const run = collect(a.edit(request({ model: off.id, variants: 1 })));
      await vi.advanceTimersByTimeAsync(0);
      expect(run.done.error).toBeInstanceOf(EditRefused);
      expect(run.seen).toEqual([]);
    });

    it('gives as many variants as the model makes, and no more', async () => {
      const a = new InMemoryImageEdit({ pace: 0 });
      const wide = DEMO_IMAGE_MODELS.find((m) => m.maxVariants > 4)!;
      const ok = collect(a.edit(request({ model: wide.id, variants: wide.maxVariants })));
      const tooMany = collect(a.edit(request({ model: wide.id, variants: wide.maxVariants + 1 })));
      await vi.advanceTimersByTimeAsync(0);
      expect(ok.seen[0]).toHaveLength(wide.maxVariants);
      expect(tooMany.done.error).toBeInstanceOf(EditRefused);
    });

    it('does not judge the strength of a model that takes none', async () => {
      const a = new InMemoryImageEdit({ pace: 0 });
      const none = DEMO_IMAGE_MODELS.find((m) => !m.strength)!;
      const run = collect(a.edit(request({ model: none.id, strength: 0, variants: 1 })));
      await vi.advanceTimersByTimeAsync(0);
      expect(run.done.error).toBeUndefined();
    });

    it('refuses a model it does not list, or none, and produces nothing', async () => {
      const a = new InMemoryImageEdit({ pace: 0 });
      for (const model of ['unknown', '']) {
        const run = collect(a.edit(request({ model })));
        await vi.advanceTimersByTimeAsync(0);
        expect(run.done.error, model).toBeInstanceOf(EditRefused);
        expect(run.seen).toEqual([]);
      }
      await expect(firstValueFrom(a.edit(request({ model: 'unknown' })))).rejects.toThrow('one of the available');
    });
  });

  it('gives as many results as variants, each the original image with its own seed', async () => {
    const a = new InMemoryImageEdit({ pace: 10 });
    const pending = firstValueFrom(a.edit(request({ variants: 3 })));
    await vi.advanceTimersByTimeAsync(10);
    const results = await pending;
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.image === image)).toBe(true);
    expect(new Set(results.map((r) => r.seed)).size).toBe(3);
  });

  it('gives different seeds on every call', async () => {
    const a = new InMemoryImageEdit({ pace: 0 });
    const first = firstValueFrom(a.edit(request({ variants: 2 })));
    const second = firstValueFrom(a.edit(request({ variants: 2 })));
    await vi.advanceTimersByTimeAsync(0);
    const seeds = [...(await first), ...(await second)].map((r) => r.seed);
    expect(new Set(seeds).size).toBe(4);
  });

  it('waits the pace before answering, and answers once', async () => {
    const a = new InMemoryImageEdit({ pace: 50 });
    const run = collect(a.edit(request()));
    await vi.advanceTimersByTimeAsync(49);
    expect(run.seen).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(run.seen).toHaveLength(1);
    expect(run.done.complete).toBe(true);
  });

  it('accepts a request with a negative prompt and one without', async () => {
    const a = new InMemoryImageEdit({ pace: 0 });
    const withIt = collect(a.edit(request({ negativePrompt: 'blurry' })));
    const without = collect(a.edit(request({ negativePrompt: '' })));
    await vi.advanceTimersByTimeAsync(0);
    expect(withIt.done.error).toBeUndefined();
    expect(without.done.error).toBeUndefined();
    expect(withIt.seen).toHaveLength(1);
    expect(without.seen).toHaveLength(1);
  });

  it('refuses an invalid request with the reason and produces nothing', async () => {
    const a = new InMemoryImageEdit({ pace: 0 });
    for (const bad of [request({ prompt: ' ' }), request({ strength: 0 }), request({ strength: 1.2 }), request({ variants: 0 }), request({ variants: 5 }), request({ variants: 1.5 })]) {
      const run = collect(a.edit(bad));
      await vi.advanceTimersByTimeAsync(0);
      expect(run.done.error).toBeInstanceOf(EditRefused);
      expect(run.seen).toEqual([]);
    }
    await expect(firstValueFrom(a.edit(request({ prompt: ' ' })))).rejects.toThrow('a prompt is needed');
  });

  it('does nothing until the Observable is subscribed to', async () => {
    const a = new InMemoryImageEdit({ pace: 0 });
    a.edit(request({ variants: 4 }));
    const afterwards = firstValueFrom(a.edit(request({ variants: 1 })));
    await vi.advanceTimersByTimeAsync(0);
    expect((await afterwards)[0].seed).toBe(1);
  });

  it('makes no network request and opens nothing', async () => {
    const fetchSpy = vi.fn();
    const open = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('open', open);
    try {
      const a = new InMemoryImageEdit({ pace: 10 });
      const pending = firstValueFrom(a.edit(request()));
      await vi.advanceTimersByTimeAsync(10);
      await pending;
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(open).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
