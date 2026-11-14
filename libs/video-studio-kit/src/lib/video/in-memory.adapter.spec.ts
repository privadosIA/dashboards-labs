import { firstValueFrom, type Observable } from 'rxjs';

import { DEMO_MODELS, InMemoryVideoGeneration, GenerationNotFound } from './in-memory.adapter';
import { DEFAULT_SETTINGS, type GenerationSettings } from './model';
import { GenerationRefused } from './validate';

const settings = (patch: Partial<GenerationSettings> = {}): GenerationSettings => ({ ...DEFAULT_SETTINGS, model: 'balanced', prompt: 'a fox', ...patch });
const adapter = (steps = 4) => new InMemoryVideoGeneration({ pace: 10, steps, videoUrl: 'v.mp4' });

/** Collects what an Observable emits until it completes or errors, so a test can read it afterwards. */
function collect<T>(source: Observable<T>) {
  const seen: T[] = [];
  const done = { complete: false, error: undefined as unknown };
  const subscription = source.subscribe({ next: (v) => seen.push(v), complete: () => (done.complete = true), error: (e) => (done.error = e) });
  return { seen, done, subscription };
}

const create = (a: InMemoryVideoGeneration, s = settings()) => firstValueFrom(a.create(s));

describe('InMemoryVideoGeneration', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  describe('a generation completes', () => {
    it('goes queued, running with growing progress, then done with a video address', async () => {
      const a = adapter();
      const created = await create(a);
      const run = collect(a.follow(created.id));
      await vi.advanceTimersByTimeAsync(200);

      expect(run.seen.map((g) => g.state)).toEqual(['queued', 'running', 'running', 'running', 'running', 'done']);
      const progress = run.seen.map((g) => g.progress);
      expect([...progress].sort((x, y) => x - y)).toEqual(progress);
      expect(run.seen.at(-1)).toMatchObject({ state: 'done', progress: 100, videoUrl: 'v.mp4' });
      expect(run.done.complete).toBe(true);
    });

    it('delivers the final state at once when following a finished generation', async () => {
      const a = adapter();
      const created = await create(a);
      await vi.advanceTimersByTimeAsync(200);
      const late = collect(a.follow(created.id));
      expect(late.seen).toHaveLength(1);
      expect(late.seen[0]).toMatchObject({ state: 'done' });
      expect(late.done.complete).toBe(true);
    });

    it('stops sending when the caller unsubscribes', async () => {
      const a = adapter();
      const created = await create(a);
      const run = collect(a.follow(created.id));
      await vi.advanceTimersByTimeAsync(15);
      run.subscription.unsubscribe();
      const count = run.seen.length;
      await vi.advanceTimersByTimeAsync(200);
      expect(run.seen).toHaveLength(count);
    });
  });

  describe('the models', () => {
    it('lists demonstration models, each with an identifier, a name and a description, all identifiers different', async () => {
      const models = await firstValueFrom(adapter().models());
      expect(models.length).toBeGreaterThan(0);
      expect(models).toEqual(DEMO_MODELS);
      for (const m of models) {
        expect(m.id.trim()).not.toBe('');
        expect(m.name.trim()).not.toBe('');
        expect(m.description.trim()).not.toBe('');
      }
      expect(new Set(models.map((m) => m.id)).size).toBe(models.length);
    });

    it('creates a generation that keeps the model chosen', async () => {
      const a = adapter();
      const created = await create(a, settings({ model: 'cinematic' }));
      expect(created.settings.model).toBe('cinematic');
      expect((await firstValueFrom(a.list()))[0].settings.model).toBe('cinematic');
    });

    it('has demonstration models that write sound and models that do not, so the studio can show both', async () => {
      const models = await firstValueFrom(adapter().models());
      expect(models.some((m) => m.audio === true)).toBe(true);
      expect(models.some((m) => m.audio === false)).toBe(true);
    });

    it('refuses a prompt that is too long with its sound, but only for a model that writes sound', async () => {
      const a = adapter();
      const writes = DEMO_MODELS.find((m) => m.audio && m.available)!.id;
      const silent = DEMO_MODELS.find((m) => m.audio === false && m.available)!.id;
      const long = { prompt: 'x'.repeat(1995), sound: 'rain and wind' };
      await expect(create(a, settings({ ...long, model: writes }))).rejects.toBeInstanceOf(GenerationRefused);
      expect((await create(a, settings({ ...long, model: silent }))).state).toBe('queued');
    });

    it('refuses a model it does not list, or none, and creates nothing', async () => {
      const a = adapter();
      await expect(create(a, settings({ model: 'unknown' }))).rejects.toThrow('one of the available');
      await expect(create(a, settings({ model: '' }))).rejects.toBeInstanceOf(GenerationRefused);
      expect(await firstValueFrom(a.list())).toEqual([]);
    });

    it('lists a model that cannot be used, marked with its reason, and refuses it', async () => {
      const a = adapter();
      const off = DEMO_MODELS.find((m) => !m.available)!;
      expect(off.reason).toBeTruthy();
      expect(DEMO_MODELS.some((m) => m.available)).toBe(true);
      await expect(create(a, settings({ model: off.id }))).rejects.toThrow('one of the available');
      expect(await firstValueFrom(a.list())).toEqual([]);
    });

    it('gives the same estimate whatever the model', () => {
      const a = adapter();
      const [first, ...others] = DEMO_MODELS.map((m) => a.estimate(settings({ model: m.id, duration: 12 })));
      for (const other of others) expect(other).toEqual(first);
    });
  });

  describe('refusing', () => {
    it('refuses an invalid request with the reason and creates nothing', async () => {
      const a = adapter();
      await expect(create(a, settings({ duration: 3 }))).rejects.toBeInstanceOf(GenerationRefused);
      await expect(create(a, settings({ prompt: ' ' }))).rejects.toThrow('prompt or a start image');
      expect(await firstValueFrom(a.list())).toEqual([]);
    });

    it('does nothing until the Observable is subscribed to', async () => {
      const a = adapter();
      a.create(settings());
      expect(await firstValueFrom(a.list())).toEqual([]);
    });
  });

  describe('list, repeat and remove', () => {
    it('lists newest first', async () => {
      const a = adapter();
      const first = await create(a, settings({ prompt: 'one' }));
      const second = await create(a, settings({ prompt: 'two' }));
      expect((await firstValueFrom(a.list())).map((g) => g.id)).toEqual([second.id, first.id]);
    });

    it('emits the list again when a generation changes', async () => {
      const a = adapter();
      const lists = collect(a.list());
      await create(a);
      await vi.advanceTimersByTimeAsync(200);
      expect(lists.seen.at(-1)?.[0].state).toBe('done');
    });

    it('repeats with the same settings and leaves the original as it was', async () => {
      const a = adapter();
      const original = await create(a, settings({ prompt: 'one', duration: 9, quality: '1080p', aspectRatio: '9:16', audio: false }));
      await vi.advanceTimersByTimeAsync(200);
      const again = await firstValueFrom(a.repeat(original.id));
      expect(again.id).not.toBe(original.id);
      expect(again.settings).toEqual(original.settings);
      expect(again.state).toBe('queued');
      const listed = await firstValueFrom(a.list());
      expect(listed.find((g) => g.id === original.id)).toMatchObject({ state: 'done' });
    });

    it('cancels a running generation when it is removed, and following it ends with no further update', async () => {
      const a = adapter();
      const created = await create(a);
      const run = collect(a.follow(created.id));
      await vi.advanceTimersByTimeAsync(25);
      const before = run.seen.length;
      await firstValueFrom(a.remove(created.id));
      await vi.advanceTimersByTimeAsync(200);
      expect(run.seen).toHaveLength(before);
      expect(run.done.complete).toBe(true);
      expect(await firstValueFrom(a.list())).toEqual([]);
    });

    it('says so when the generation does not exist', async () => {
      const a = adapter();
      await expect(firstValueFrom(a.remove('nope'))).rejects.toBeInstanceOf(GenerationNotFound);
      await expect(firstValueFrom(a.repeat('nope'))).rejects.toBeInstanceOf(GenerationNotFound);
      await expect(firstValueFrom(a.follow('nope'))).rejects.toBeInstanceOf(GenerationNotFound);
    });
  });

  describe('failing on demand', () => {
    it('fails only the next generation, with a message and no video, and then stays failed', async () => {
      const a = adapter();
      a.failNext();
      const doomed = await create(a);
      const fine = await create(a);
      const run = collect(a.follow(doomed.id));
      await vi.advanceTimersByTimeAsync(300);

      expect(run.seen.at(-1)).toMatchObject({ state: 'failed', error: expect.any(String) });
      expect(run.seen.at(-1)?.videoUrl).toBeUndefined();
      const listed = await firstValueFrom(a.list());
      expect(listed.find((g) => g.id === doomed.id)?.state).toBe('failed');
      expect(listed.find((g) => g.id === fine.id)?.state).toBe('done');
    });
  });

  describe('needs no server', () => {
    it('makes no network request from creating to completing a generation', async () => {
      const fetchSpy = vi.fn();
      const open = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      vi.stubGlobal('XMLHttpRequest', open);
      try {
        const a = adapter();
        a.failNext();
        await create(a);
        await create(a);
        await vi.advanceTimersByTimeAsync(300);
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(open).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('takes the forced failure back with failNext(false)', async () => {
      const a = adapter();
      a.failNext();
      a.failNext(false);
      const created = await create(a);
      const run = collect(a.follow(created.id));
      await vi.advanceTimersByTimeAsync(200);
      expect(run.seen.at(-1)?.state).toBe('done');
    });

    it('answers an estimate without creating anything', async () => {
      const a = adapter();
      const estimate = a.estimate(settings({ duration: 20 }));
      expect(estimate.seconds).toBeGreaterThan(0);
      expect(await firstValueFrom(a.list())).toEqual([]);
    });
  });

  describe('with a storage', () => {
    /** A storage that keeps what it is given; `broken` makes it throw, like a full or blocked one. */
    const storage = (initial?: string, broken = false) => {
      const data = new Map<string, string>(initial === undefined ? [] : [['video-studio.history', initial]]);
      return {
        data,
        getItem: (k: string) => {
          if (broken) throw new Error('blocked');
          return data.get(k) ?? null;
        },
        setItem: (k: string, v: string) => {
          if (broken) throw new Error('full');
          data.set(k, v);
        },
      };
    };
    const kept = (store: ReturnType<typeof storage>, steps = 4) => new InMemoryVideoGeneration({ pace: 10, steps, videoUrl: 'v.mp4', storage: store });
    const list = (a: InMemoryVideoGeneration) => firstValueFrom(a.list());
    const image = { name: 'a.png', dataUrl: 'data:image/png;base64,AAAA' };

    it('lists, in the same order, what an adapter sharing the storage finished', async () => {
      const store = storage();
      const first = kept(store);
      await create(first, settings({ prompt: 'one', quality: '1080p' }));
      await create(first, settings({ prompt: 'two' }));
      await vi.advanceTimersByTimeAsync(300);

      const again = await list(kept(store));
      expect(again).toEqual(await list(first));
      expect(again.map((g) => g.settings.prompt)).toEqual(['two', 'one']);
      expect(again.map((g) => g.state)).toEqual(['done', 'done']);
      expect(again[1].settings.quality).toBe('1080p');
      expect(await list(adapter())).toEqual([]);
    });

    it('delivers a restored finished generation at once when following it', async () => {
      const store = storage();
      const first = kept(store);
      const created = await create(first);
      await vi.advanceTimersByTimeAsync(200);
      const run = collect(kept(store).follow(created.id));
      expect(run.seen).toHaveLength(1);
      expect(run.seen[0]).toMatchObject({ state: 'done', videoUrl: 'v.mp4' });
      expect(run.done.complete).toBe(true);
    });

    it('brings back as failed the generations the reload cut short, and starts no timer for them', async () => {
      const store = storage();
      const first = kept(store);
      const queued = await create(first, settings({ prompt: 'queued' }));
      await vi.advanceTimersByTimeAsync(5);
      const running = await create(first, settings({ prompt: 'running' }));
      await vi.advanceTimersByTimeAsync(25);

      const again = kept(store);
      const restored = await list(again);
      expect(restored.map((g) => [g.id, g.state])).toEqual([[running.id, 'failed'], [queued.id, 'failed']]);
      expect(restored.every((g) => g.error?.includes('page was reloaded'))).toBe(true);
      await vi.advanceTimersByTimeAsync(300);
      expect(await list(again)).toEqual(restored);
    });

    it('keeps its ids unique after restoring', async () => {
      const store = storage();
      const first = kept(store);
      await create(first);
      await create(first);
      await vi.advanceTimersByTimeAsync(300);
      const again = kept(store);
      const next = await create(again);
      expect(next.id).toBe('gen-3');
      expect(new Set((await list(again)).map((g) => g.id)).size).toBe(3);
    });

    it('does not store the start image and keeps every other setting', async () => {
      const store = storage();
      const first = kept(store);
      await create(first, settings({ prompt: 'with image', startImage: image, duration: 12 }));
      await vi.advanceTimersByTimeAsync(300);
      expect(store.data.get('video-studio.history')).not.toContain('data:image');

      const [restored] = await list(kept(store));
      expect(restored.settings).toEqual(settings({ prompt: 'with image', startImage: null, duration: 12 }));
    });

    it('repeats a restored generation that has a prompt, and refuses one that was only an image', async () => {
      const store = storage();
      const first = kept(store);
      const withPrompt = await create(first, settings({ prompt: 'a fox', startImage: image }));
      const onlyImage = await create(first, settings({ prompt: '', startImage: image }));
      await vi.advanceTimersByTimeAsync(300);

      const again = kept(store);
      const repeated = await firstValueFrom(again.repeat(withPrompt.id));
      expect(repeated.settings).toMatchObject({ prompt: 'a fox', startImage: null });
      await expect(firstValueFrom(again.repeat(onlyImage.id))).rejects.toBeInstanceOf(GenerationRefused);
    });

    it('restores a saved generation from before models existed with the default model', async () => {
      const old = { id: 'gen-1', state: 'done', progress: 100, videoUrl: 'v.mp4', settings: { prompt: 'old', startImage: null, duration: 8, aspectRatio: '16:9', quality: '720p', audio: true } };
      const [restored] = await list(kept(storage(JSON.stringify([old]))));
      expect(restored.settings).toEqual({ ...old.settings, model: DEMO_MODELS[0].id });
      expect(restored.state).toBe('done');
    });

    it('keeps the removal of an entry', async () => {
      const store = storage();
      const first = kept(store);
      const created = await create(first);
      await create(first);
      await vi.advanceTimersByTimeAsync(300);
      await firstValueFrom(first.remove(created.id));
      expect((await list(kept(store))).map((g) => g.id)).not.toContain(created.id);
    });

    it.each([['text that is not JSON', 'not json'], ['JSON that is not a list', '{"a":1}'], ['entries that are not generations', '[1,{"id":"x"},null]']])(
      'starts empty on %s',
      async (_what, saved) => {
        expect(await list(kept(storage(saved)))).toEqual([]);
      },
    );

    it('drops the entries that are not generations and keeps the ones that are', async () => {
      const store = storage();
      const first = kept(store);
      await create(first);
      await vi.advanceTimersByTimeAsync(300);
      const good = JSON.parse(store.data.get('video-studio.history')!)[0];
      const mixed = storage(JSON.stringify([{ id: 'x' }, good, null]));
      expect((await list(kept(mixed))).map((g) => g.id)).toEqual([good.id]);
    });

    it('keeps working when the storage throws on reading and on writing', async () => {
      const a = kept(storage('[]', true));
      const created = await create(a);
      await vi.advanceTimersByTimeAsync(300);
      expect(await list(a)).toHaveLength(1);
      expect((await list(a))[0]).toMatchObject({ id: created.id, state: 'done' });
    });
  });
});
