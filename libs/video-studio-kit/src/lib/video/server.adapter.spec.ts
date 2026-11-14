import { ApiError, type components } from '@lab/api-client';
import { Observable, firstValueFrom, of, throwError, toArray } from 'rxjs';

import { DEFAULT_SETTINGS, type GenerationSettings } from './model';
import { ServerVideoGeneration, type VideoApi } from './server.adapter';
import { GenerationRefused } from './validate';

type Generation = components['schemas']['Generation'];
type Option = components['schemas']['VideoOption'];

const option = (over: Partial<Option>): Option => ({
  id: 'x',
  name: 'X',
  description: 'd',
  engine: 'wan',
  available: true,
  clip_seconds: 4,
  duration: { min: 2, max: 30, default: 5 },
  audio: false,
  default: false,
  ...over,
});
const OPTIONS = {
  video: [
    option({ id: 'h3-full', name: 'MiniMax H3', engine: 'minimax-h3', available: false, reason: 'does not fit', audio: true }),
    option({ id: 'wan-high', name: 'Wan (high)', estimate: 780, default: true }),
    option({ id: 'ltx', name: 'LTX 2.3', engine: 'ltx-2.3', audio: true, estimate: 190 }),
  ],
  image_models: [],
  aspect_ratios: ['16:9'],
  qualities: ['draft', 'normal', 'high'],
};

const server = (id: string, over: Partial<Generation> = {}): Generation => ({
  id,
  state: 'queued',
  progress: 0,
  request: { prompt: 'a cat', option: 'ltx', duration: 5, aspect_ratio: '16:9', quality: 'high' },
  client: 'video-studio',
  run_id: `run-${id}`,
  clip_seconds: 2,
  created_at: '2026-11-02T10:00:00Z',
  size_bytes: 0,
  inputs: [],
  ...over,
});
const settings = (over: Partial<GenerationSettings> = {}): GenerationSettings => ({ ...DEFAULT_SETTINGS, prompt: 'a cat', model: 'ltx', ...over });

/** A server in a few lines: what the adapter asks is answered from `store` and every call is recorded. */
class FakeApi {
  store: Generation[] = [];
  calls: { method: string; path: string; options?: unknown; form?: FormData }[] = [];
  nextId = 1;
  refuse?: ApiError;
  onGet?: (id: string) => Generation | null;

  get = ((path: string, options?: { path?: { id: string } }) => {
    this.calls.push({ method: 'get', path, options });
    if (path === '/api/generation/options') return of(OPTIONS);
    if (path === '/api/generations') return of(this.store);
    const id = options!.path!.id;
    const found = this.onGet ? this.onGet(id) : (this.store.find((g) => g.id === id) ?? null);
    return found ? of(found) : throwError(() => new ApiError(404, 'not_found', 'not found'));
  }) as unknown as VideoApi['get'];

  post = ((path: string, options: { body: { option?: string } }) => {
    this.calls.push({ method: 'post', path, options });
    return this.created(options.body);
  }) as unknown as VideoApi['post'];

  postForm = ((path: string, form: FormData) => {
    this.calls.push({ method: 'postForm', path, form });
    return this.created(JSON.parse(form.get('request') as string));
  }) as unknown as VideoApi['postForm'];

  delete = ((path: string, options: { path: { id: string } }) => {
    this.calls.push({ method: 'delete', path, options });
    this.store = this.store.filter((g) => g.id !== options.path.id);
    return of(undefined);
  }) as unknown as VideoApi['delete'];

  urlOf = (a: string) => `http://server:4666${a}`;

  private created(request: Generation['request']): Observable<Generation> {
    if (this.refuse) return throwError(() => this.refuse);
    const g = server(`api-gen-${this.nextId++}`, { request: { ...request, option: request.option ?? 'wan-high' } });
    this.store = [g, ...this.store];
    return of(g);
  }
}

const adapter = (api = new FakeApi(), pollMs = 2) => ({ api, port: new ServerVideoGeneration(api as unknown as VideoApi, { pollMs }) });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('ServerVideoGeneration', () => {
  describe('models and estimate', () => {
    it('lists every option in the order of the server, the unavailable ones marked with the server\'s reason', async () => {
      const { port } = adapter();
      const models = await firstValueFrom(port.models());
      expect(models.map((m) => m.id)).toEqual(['h3-full', 'wan-high', 'ltx']);
      expect(models.map((m) => m.available)).toEqual([false, true, true]);
      expect(models[0].reason).toBe('does not fit');
      expect(models.map((m) => m.audio)).toEqual([true, false, true]);
      expect(models[1].reason).toBeUndefined();
    });

    it('asks the server for the options once, however many times they are asked for', async () => {
      const { api, port } = adapter();
      await firstValueFrom(port.models());
      await firstValueFrom(port.models());
      expect(api.calls.filter((c) => c.path === '/api/generation/options')).toHaveLength(1);
    });

    it('estimates with the option\'s seconds whatever the duration, and with the studio\'s own before it knows them', async () => {
      const { port } = adapter();
      const before = port.estimate(settings({ duration: 5 }));
      await firstValueFrom(port.models());
      expect(port.estimate(settings({ duration: 5 })).seconds).toBe(190);
      expect(port.estimate(settings({ duration: 20 })).seconds).toBe(190);
      expect(port.estimate(settings({ model: '' })).seconds).toBe(780); // the default option
      expect(before.seconds).not.toBe(190);
      expect(port.estimate(settings({ model: 'unknown' })).seconds).toBe(before.seconds); // not an option it knows: its own model
    });
  });

  describe('create', () => {
    it('posts the settings in the server\'s words and emits the generation queued', async () => {
      const { api, port } = adapter();
      await firstValueFrom(port.models());
      const g = await firstValueFrom(port.create(settings({ duration: 8, aspectRatio: '1:1', quality: '1080p', audio: true })));
      expect(api.calls.find((c) => c.method === 'post')?.options).toEqual({ body: { prompt: 'a cat', option: 'ltx', duration: 8, aspect_ratio: '1:1', quality: 'high', audio: true, client: 'video-studio' } });
      expect(g).toMatchObject({ id: 'api-gen-1', state: 'queued', progress: 0 });
      expect(g.settings.audio).toBe(true);
    });

    it('drops the audio for an option that cannot write it', async () => {
      const { api, port } = adapter();
      await firstValueFrom(port.models());
      await firstValueFrom(port.create(settings({ model: 'wan-high', audio: true })));
      expect((api.calls.find((c) => c.method === 'post')!.options as { body: object }).body).not.toHaveProperty('audio');
    });

    it('sends the start image as a multipart form with the file', async () => {
      const { api, port } = adapter();
      await firstValueFrom(port.create(settings({ startImage: { name: 'photo', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' } })));
      const call = api.calls.find((c) => c.method === 'postForm')!;
      expect(call.path).toBe('/api/generations');
      expect(JSON.parse(call.form!.get('request') as string)).toMatchObject({ prompt: 'a cat', option: 'ltx' });
      const file = call.form!.get('image') as File;
      expect([file.name, file.type, file.size]).toEqual(['photo.png', 'image/png', 8]);
    });

    it('refuses with the studio\'s rules and sends nothing', async () => {
      const { api, port } = adapter();
      await firstValueFrom(port.models());
      const before = api.calls.length;
      await expect(firstValueFrom(port.create(settings({ prompt: '' })))).rejects.toBeInstanceOf(GenerationRefused);
      await expect(firstValueFrom(port.create(settings({ model: 'h3-full' })))).rejects.toBeInstanceOf(GenerationRefused); // unavailable
      expect(api.calls).toHaveLength(before);
    });

    it('errors with the server\'s own refusal', async () => {
      const { api, port } = adapter();
      api.refuse = new ApiError(503, 'unavailable', 'option ltx cannot run now');
      await expect(firstValueFrom(port.create(settings()))).rejects.toThrow('option ltx cannot run now');
    });

    it('puts the new generation first in the list', async () => {
      const { api, port } = adapter();
      api.store = [server('api-gen-0', { state: 'done', progress: 100 })];
      const seen: string[][] = [];
      port.list().subscribe((l) => seen.push(l.map((g) => g.id)));
      await wait(5);
      await firstValueFrom(port.create(settings()));
      expect(seen.at(-1)).toEqual(['api-gen-1', 'api-gen-0']);
    });
  });

  describe('list', () => {
    it('shows what the server has, with the video as a full address, and stops asking when nothing is unfinished', async () => {
      const { api, port } = adapter();
      api.store = [server('a', { state: 'done', progress: 100, video: '/api/projects/a/artifacts/out/a.mp4' })];
      const seen: (readonly { id: string; videoUrl?: string }[])[] = [];
      const sub = port.list().subscribe((l) => seen.push(l));
      await wait(15);
      expect(seen.at(-1)).toEqual([expect.objectContaining({ id: 'a', videoUrl: 'http://server:4666/api/projects/a/artifacts/out/a.mp4' })]);
      const reads = api.calls.filter((c) => c.path === '/api/generations').length;
      await wait(15);
      expect(api.calls.filter((c) => c.path === '/api/generations')).toHaveLength(reads);
      sub.unsubscribe();
    });

    it('reads the list again while a generation is unfinished and emits the changes', async () => {
      const { api, port } = adapter();
      api.store = [server('a', { state: 'running', progress: 20 })];
      const progress: number[] = [];
      const sub = port.list().subscribe((l) => progress.push(l[0]?.progress ?? -1));
      await wait(8);
      api.store = [server('a', { state: 'running', progress: 60 })];
      await wait(10);
      api.store = [server('a', { state: 'done', progress: 100, video: '/v.mp4' })];
      await wait(10);
      sub.unsubscribe();
      expect(progress).toContain(20);
      expect(progress).toContain(60);
      expect(progress.at(-1)).toBe(100);
    });
  });

  describe('repeat and remove', () => {
    it('repeats with the settings of what this page made, start image included', async () => {
      const { api, port } = adapter();
      const image = { name: 'p.png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' };
      const first = await firstValueFrom(port.create(settings({ startImage: image })));
      const again = await firstValueFrom(port.repeat(first.id));
      expect(again.id).not.toBe(first.id);
      expect(api.calls.filter((c) => c.method === 'postForm')).toHaveLength(2);
    });

    it('repeats one it only knows from the server with its settings and no image', async () => {
      const { api, port } = adapter();
      api.store = [server('old', { state: 'done', progress: 100 })];
      port.list().subscribe();
      await wait(5);
      const again = await firstValueFrom(port.repeat('old'));
      expect(again.settings).toMatchObject({ prompt: 'a cat', model: 'ltx', startImage: null });
    });

    it('fails to repeat what it has never seen', async () => {
      await expect(firstValueFrom(adapter().port.repeat('nope'))).rejects.toThrow(/no generation nope/);
    });

    it('deletes on the server and leaves the list', async () => {
      const { api, port } = adapter();
      const made = await firstValueFrom(port.create(settings()));
      let last: readonly unknown[] = [];
      port.list().subscribe((l) => (last = l));
      await firstValueFrom(port.remove(made.id));
      expect(api.calls.at(-1)).toMatchObject({ method: 'delete', path: '/api/generations/{id}', options: { path: { id: made.id } } });
      expect(last).toEqual([]);
    });
  });

  describe('follow', () => {
    it('emits the progress as it grows, ends on done with the full video address and stops', async () => {
      const { api, port } = adapter();
      const steps = [
        server('a', { state: 'queued' }),
        server('a', { state: 'running', progress: 30 }),
        server('a', { state: 'running', progress: 30 }),
        server('a', { state: 'running', progress: 70 }),
        server('a', { state: 'done', progress: 100, video: '/api/projects/a/artifacts/out/a.mp4' }),
      ];
      let i = 0;
      api.onGet = () => steps[Math.min(i++, steps.length - 1)];
      const got = await firstValueFrom(port.follow('a').pipe(toArray()));
      expect(got.map((g) => [g.state, g.progress])).toEqual([['queued', 0], ['running', 30], ['running', 70], ['done', 100]]);
      expect(got.at(-1)!.videoUrl).toBe('http://server:4666/api/projects/a/artifacts/out/a.mp4');
    });

    it('ends on failed with the message', async () => {
      const { api, port } = adapter();
      api.onGet = () => server('a', { state: 'failed', progress: 40, error: 'out of memory' });
      const got = await firstValueFrom(port.follow('a').pipe(toArray()));
      expect(got).toHaveLength(1);
      expect(got[0]).toMatchObject({ state: 'failed', error: 'out of memory' });
    });

    it('ends without a further emission when the server no longer has it', async () => {
      const { api, port } = adapter();
      let n = 0;
      api.onGet = () => (n++ === 0 ? server('a', { state: 'running', progress: 10 }) : null);
      const got = await firstValueFrom(port.follow('a').pipe(toArray()));
      expect(got.map((g) => g.progress)).toEqual([10]);
    });

    it('passes on any other error', async () => {
      const { api, port } = adapter();
      api.get = (() => throwError(() => new ApiError(0, 'unknown', 'No answer from the server'))) as never;
      await expect(firstValueFrom(port.follow('a'))).rejects.toThrow('No answer');
    });
  });
});
