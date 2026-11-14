import type { components } from '@lab/api-client';
import { firstValueFrom, of } from 'rxjs';

import { DEFAULT_SETTINGS, NO_REFERENCES, type GenerationSettings } from './model';
import { generationForm, ServerVideoGeneration, type VideoApi } from './server.adapter';
import { toGeneration, toModelInputs, toRequest } from './server-mapping';
import { GenerationRefused } from './validate';

type ServerGeneration = components['schemas']['Generation'];
type Option = components['schemas']['VideoOption'];

const img = { name: 'a.png', dataUrl: 'data:image/png;base64,AA==' };
const file = (name: string) => ({ name, blob: new Blob(['x']) });
const base = (over: Partial<GenerationSettings> = {}): GenerationSettings => ({ ...DEFAULT_SETTINGS, prompt: 'a fox', model: 'h3-full', ...over });
const option = (id: string, inputs: Option['inputs']): Option => ({ id, name: id, description: 'd', engine: 'minimax-h3', available: true, clip_seconds: 4, duration: { min: 2, max: 30, default: 5 }, audio: true, default: id === 'h3-full', ...(inputs ? { inputs } : {}) });
const OPTIONS = {
  video: [
    option('h3-full', { start_image: true, end_image: true }),
    option('h3-ref', { start_image: false, end_image: false, reference_images: { min: 1, max: 2 }, reference_videos: { max: 1, max_seconds: 2 }, reference_audios: { max: 0 } }),
    option('wan', undefined),
  ],
  image_models: [],
  aspect_ratios: ['16:9'],
  qualities: ['draft', 'normal', 'high'],
};
const generation = (id: string, over: Partial<ServerGeneration> = {}): ServerGeneration => ({
  id,
  state: 'queued',
  progress: 0,
  request: { prompt: 'a fox', option: 'h3-full', duration: 5, aspect_ratio: '16:9', quality: 'high' },
  client: 'video-studio',
  run_id: 'r',
  clip_seconds: 2,
  created_at: '2026-11-07T10:00:00Z',
  size_bytes: 0,
  inputs: [],
  ...over,
});

class Api {
  posted: { path: string; form?: FormData; body?: { reuse_inputs_of?: string } }[] = [];
  store: ServerGeneration[] = [];
  get = ((path: string) => of(path === '/api/generation/options' ? OPTIONS : this.store)) as unknown as VideoApi['get'];
  post = ((path: string, o: { body: { reuse_inputs_of?: string } }) => {
    this.posted.push({ path, body: o.body });
    return of(generation('g-new', { request: o.body as ServerGeneration['request'] }));
  }) as unknown as VideoApi['post'];
  postForm = ((path: string, form: FormData) => {
    this.posted.push({ path, form });
    return of(generation('g-new', { inputs: [] }));
  }) as unknown as VideoApi['postForm'];
  delete = (() => of(undefined)) as unknown as VideoApi['delete'];
  urlOf = (a: string) => `http://server${a}`;
}
const adapter = () => {
  const api = new Api();
  return { api, port: new ServerVideoGeneration(api as unknown as VideoApi, { pollMs: 1000 }) };
};

describe('the inputs through the server', () => {
  it('reads what each option accepts, and an option that says nothing takes a start image only', () => {
    expect(toModelInputs(OPTIONS.video[1].inputs)).toEqual({ startImage: false, endImage: false, referenceImages: { min: 1, max: 2 }, referenceVideos: { max: 1, maxSeconds: 2 } });
    expect(toModelInputs(undefined)).toEqual({ startImage: true, endImage: false });
  });

  it('lists the models with their inputs', async () => {
    const { port } = adapter();
    const models = await firstValueFrom(port.models());
    expect(models.map((m) => m.inputs?.endImage)).toEqual([true, false, false]);
  });

  it('sends the end image and the references as their own parts, in order', () => {
    const form = generationForm(toRequest(base()), { startImage: null, endImage: null, references: { images: [file('1.png'), file('2.png')], videos: [file('v.mp4')], audios: [] } });
    expect(form.getAll('reference_images').map((f) => (f as File).name)).toEqual(['1.png', '2.png']);
    expect(form.getAll('reference_videos')).toHaveLength(1);
    expect(form.has('image')).toBe(false);
    const frames = generationForm(toRequest(base()), { startImage: img, endImage: img, references: NO_REFERENCES });
    expect(frames.has('image')).toBe(true);
    expect(frames.has('end_image')).toBe(true);
  });

  it('creates with files as a form, and with nothing as JSON', async () => {
    const { api, port } = adapter();
    await firstValueFrom(port.models());
    await firstValueFrom(port.create(base({ startImage: img, endImage: img })));
    await firstValueFrom(port.create(base()));
    expect(api.posted[0].form?.has('end_image')).toBe(true);
    expect(api.posted[1].form).toBeUndefined();
  });

  it('refuses before sending when the model does not take an input, creating nothing', async () => {
    const { api, port } = adapter();
    await firstValueFrom(port.models());
    await expect(firstValueFrom(port.create(base({ model: 'wan', startImage: img, endImage: img })))).rejects.toBeInstanceOf(GenerationRefused);
    await expect(firstValueFrom(port.create(base({ model: 'h3-ref', startImage: img })))).rejects.toBeInstanceOf(GenerationRefused);
    expect(api.posted).toEqual([]);
  });

  it('reports the inputs of a generation, start image first, with readable addresses', () => {
    const g = toGeneration(generation('g1', { inputs: [{ kind: 'start_image', name: 's.png', address: '/a/s.png' }, { kind: 'end_image', name: 'e.png', address: '/a/e.png' }] }), (a) => `http://server${a}`);
    expect(g.inputs).toEqual([{ kind: 'start_image', name: 's.png', url: 'http://server/a/s.png' }, { kind: 'end_image', name: 'e.png', url: 'http://server/a/e.png' }]);
    expect(g.settings.reuse?.of).toBe('g1');
  });

  it('keeps the files the page holds and still lets a repeat reuse the server\'s copies', () => {
    const own = base({ startImage: img });
    const g = toGeneration(generation('g1', { inputs: [{ kind: 'start_image', name: 'a.png', address: '/a/a.png' }] }), (a) => a, own);
    expect(g.settings.startImage).toBe(img);
    expect(g.settings.reuse?.of).toBe('g1');
  });

  it('repeats a generation asking the server to reuse its files and sending none', async () => {
    const { api, port } = adapter();
    await firstValueFrom(port.models());
    api.store = [generation('g1', { inputs: [{ kind: 'start_image', name: 's.png', address: '/a/s.png' }] })];
    await firstValueFrom(port.list());
    await firstValueFrom(port.repeat('g1'));
    expect(api.posted[0].form).toBeUndefined();
    expect(api.posted[0].body?.reuse_inputs_of).toBe('g1');
  });
});
