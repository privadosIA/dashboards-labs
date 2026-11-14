import { firstValueFrom, of, throwError } from 'rxjs';

import { InMemoryEngines } from './in-memory';
import { preselected } from './model';
import { ServerEngines, musicState } from './server.adapter';

type Call = { method: 'get' | 'post'; path: string; options?: unknown };
const fake = (answers: Record<string, unknown>) => {
  const calls: Call[] = [];
  const answer = (key: string) => {
    const a = answers[key];
    return a instanceof Error ? throwError(() => a) : of(a);
  };
  const api = {
    get: (path: string, options?: unknown) => (calls.push({ method: 'get', path, options }), answer(`GET ${path}`)),
    post: (path: string, options?: unknown) => (calls.push({ method: 'post', path, options }), answer(`POST ${path}`)),
  };
  return { api, calls };
};
const catalog = { parts: [{}, {}, {}], styles: ['minimal', 'kinetic'], levels: ['low', 'high'], frameRates: [24, 30], features: ['plan'] };
const animation = { catalog: () => of(catalog) } as never;

describe('musicState', () => {
  it('is ready when available, startable when stopped, and unavailable with its reason otherwise', () => {
    expect(musicState({ available: true })).toEqual({ state: 'ready' });
    expect(musicState({ available: false, reason: 'not_running', container: { state: 'stopped' } })).toEqual({ state: 'stopped', reason: 'not_running' });
    expect(musicState({ available: false, reason: 'no_gpu' })).toEqual({ state: 'unavailable', reason: 'no_gpu' });
    expect(musicState({ available: false, container: { state: 'starting' } })).toEqual({ state: 'starting' });
  });
});

describe('ServerEngines', () => {
  it('reads the music generators: ACE-Step always, the optional services with their state and reason', async () => {
    const { api } = fake({ 'GET /api/music/engines': { engines: { heartmula: { available: false, reason: 'not_running', container: { state: 'stopped' } }, diffrhythm2: { available: false, reason: 'no_gpu' }, clap: { available: true } } } });
    const view = await firstValueFrom(new ServerEngines(api as never, animation).load('music-engines'));
    expect(view.kind === 'music' && view.cards.map((c) => [c.id, c.state, c.reason])).toEqual([
      ['ace-step', 'ready', undefined],
      ['heartmula', 'stopped', 'not_running'],
      ['diffrhythm2', 'unavailable', 'no_gpu'],
    ]);
  });

  it('starts a stopped service through the contract', async () => {
    const { api, calls } = fake({ 'POST /api/music/engines/{engine}/start': {} });
    await firstValueFrom(new ServerEngines(api as never, animation).startMusic('heartmula'));
    expect(calls[0]).toMatchObject({ method: 'post', path: '/api/music/engines/{engine}/start', options: { path: { engine: 'heartmula' } } });
  });

  it('reads the video options with availability, reason, sound, clip length and estimate, and preselects the first available default', async () => {
    const { api } = fake({
      'GET /api/generation/options': {
        video: [
          { id: 'h3-full', name: 'H3', available: false, reason: 'no vram', audio: true, clip_seconds: 6, estimate: 400, default: false },
          { id: 'ltx', name: 'LTX', available: true, audio: true, clip_seconds: 5, estimate: 180, default: true },
        ],
      },
    });
    const view = await firstValueFrom(new ServerEngines(api as never, animation).load('generation-options'));
    if (view.kind !== 'video') throw new Error('video');
    expect(view.cards[0]).toMatchObject({ id: 'h3-full', state: 'unavailable', reason: 'no vram', audio: true, seconds: 400, source: 'server' });
    expect(view.cards[1]).toMatchObject({ id: 'ltx', state: 'ready', clipSeconds: 5, seconds: 180 });
    expect(preselected(view.cards)).toBe('ltx');
  });

  it('preselects the first usable card when none is the default', () => {
    expect(preselected([{ id: 'a', name: 'a', state: 'unavailable', source: 'none' }, { id: 'b', name: 'b', state: 'ready', source: 'none' }])).toBe('b');
    expect(preselected([])).toBe('');
  });

  it('lists the installed catalog models of a project, without retouch editors, support files or what is not installed, with the history\'s time and else the catalog\'s table', async () => {
    const { api, calls } = fake({
      'GET /api/assets/catalog': {
        entries: [
          { kind: 'model', installed: true, name: 'Modelo A', name_en: 'Model A', description: 'Fotorrealista', description_en: 'Photorealistic', files: [{ name: 'a.gguf', role: 'model' }, { name: 'enc.gguf', role: 'text_encoder' }], preset: { resolution: '1024x576' }, timing: { seconds: 18, resolution: '1024x576', measured: true }, styles: ['photo'], style_rank: 2 },
          { kind: 'model', installed: true, name: 'B', files: [{ name: 'b.safetensors' }], timing: { seconds: 4, resolution: '512x512', measured: false }, styles: ['general'] },
          { kind: 'model', installed: true, name: 'Editor', edit: true, files: [{ name: 'edit.gguf', role: 'model' }] },
          { kind: 'model', installed: false, name: 'Not installed', files: [{ name: 'n.gguf', role: 'model' }] },
          { kind: 'voice', installed: true, name: 'A voice', files: [{ name: 'v.onnx' }] },
        ],
      },
      'GET /api/environment': { gpus: [{ name: 'RTX 4070' }] },
    });
    const withHistory = {
      get: (path: string, options?: { query?: { model?: string } }) => {
        if (path === '/api/stats/phase-duration') return of(options?.query?.model === 'a.gguf' ? { enough: true, median_seconds: 7.5 } : { enough: false });
        return api.get(path);
      },
    };
    const view = await firstValueFrom(new ServerEngines(withHistory as never, animation, 'en').load('image-models'));
    if (view.kind !== 'images') throw new Error('images');
    expect(view.cards).toMatchObject([
      { id: 'a.gguf', name: 'Model A', description: 'Photorealistic', seconds: 7.5, source: 'history', styles: ['photo'], rank: 2 },
      { id: 'b.safetensors', name: 'B', seconds: 4, source: 'catalog', sourceNote: '512x512', measured: false },
    ]);
    expect(calls.map((c) => c.path)).toEqual(['/api/assets/catalog', '/api/environment']);
    const es = await firstValueFrom(new ServerEngines(withHistory as never, animation, 'es').load('image-models'));
    expect(es.kind === 'images' && es.cards[0].name).toBe('Modelo A');
  });

  it('says a model has no time at all when neither the history nor the catalog has one', async () => {
    const { api } = fake({ 'GET /api/assets/catalog': { entries: [{ kind: 'model', installed: true, name: 'C', files: [{ name: 'c.safetensors' }] }] }, 'GET /api/environment': {} });
    const view = await firstValueFrom(new ServerEngines(api as never, animation).load('image-models'));
    expect(view.kind === 'images' && view.cards[0]).toMatchObject({ id: 'c.safetensors', source: 'none' });
  });

  it('answers no image models when none is installed', async () => {
    const { api } = fake({ 'GET /api/assets/catalog': { entries: [] }, 'GET /api/environment': {} });
    expect(await firstValueFrom(new ServerEngines(api as never, animation).load('image-models'))).toEqual({ kind: 'images', cards: [] });
  });

  it('reads whether Chrome is there and how many parts the catalog has, for graphics', async () => {
    const { api } = fake({ 'GET /api/environment': { binaries: [{ name: 'ffmpeg', present: true }, { name: 'chrome', present: true }] } });
    expect(await firstValueFrom(new ServerEngines(api as never, animation).load('graphics'))).toEqual({ kind: 'graphics', chrome: true, parts: 3 });
    const none = fake({ 'GET /api/environment': { binaries: [{ name: 'chrome', present: false }] } });
    expect(await firstValueFrom(new ServerEngines(none.api as never, animation).load('graphics'))).toMatchObject({ chrome: false });
  });

  it('reads the catalog\'s styles, levels, frame rates and features for the animated piece', async () => {
    expect(await firstValueFrom(new ServerEngines(fake({}).api as never, animation).load('piece-catalog'))).toEqual({ kind: 'piece', styles: ['minimal', 'kinetic'], levels: ['low', 'high'], frameRates: [24, 30], features: ['plan'] });
  });
});

describe('InMemoryEngines', () => {
  it('fills every panel with fixed values and lets a stopped service start', async () => {
    const m = new InMemoryEngines();
    const before = await firstValueFrom(m.load('music-engines'));
    expect(before.kind === 'music' && before.cards.find((c) => c.id === 'heartmula')?.state).toBe('stopped');
    await firstValueFrom(m.startMusic('heartmula'));
    const after = await firstValueFrom(m.load('music-engines'));
    expect(after.kind === 'music' && after.cards.find((c) => c.id === 'heartmula')?.state).toBe('ready');
    const video = await firstValueFrom(m.load('generation-options'));
    expect(video.kind === 'video' && video.cards.some((c) => c.state === 'unavailable' && c.reason)).toBe(true);
    for (const q of ['image-models', 'graphics', 'piece-catalog'] as const) expect((await firstValueFrom(m.load(q))).kind).toBeTruthy();
  });
});
