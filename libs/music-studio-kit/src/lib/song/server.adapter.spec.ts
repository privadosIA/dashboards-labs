import { ApiError } from '@lab/api-client';
import { load } from 'js-yaml';
import { type Observable, firstValueFrom, of, throwError } from 'rxjs';

import { ServerSongs, type SongsApi } from './server.adapter';
import type { Song, SongRequest } from './model';
import { DEFAULT_LISTEN } from './listen';
import { AssistFailed, EngineFailed, ListenFailed, SongRefused } from './port';

type Json = Record<string, unknown>;
type Handler = (call: { path?: Json; query?: Json; body?: Json }) => unknown;

const REQUEST: SongRequest = { title: 'Night drive', lyrics: '[verse]\nla', style: 'lo-fi, chill', generator: 'heartmula', instrumental: false };

/** A fake of the API client: each "METHOD /path" answers with what its handler returns (or throws). */
function fake(routes: Record<string, Handler>) {
  const calls: { key: string; args: { path?: Json; query?: Json; body?: Json } }[] = [];
  const call = (method: string) => (path: string, args: { path?: Json; query?: Json; body?: Json } = {}): Observable<never> => {
    const key = `${method} ${path}`;
    calls.push({ key, args });
    const handler = routes[key];
    if (!handler) return throwError(() => new Error(`no route for ${key}`));
    try {
      const answer = handler(args);
      return answer instanceof Error ? throwError(() => answer) : (of(answer) as Observable<never>);
    } catch (e) {
      return throwError(() => e);
    }
  };
  const api = {
    get: call('GET'),
    post: call('POST'),
    put: call('PUT'),
    delete: call('DELETE'),
    getBlobAt: (address: string) => of({ body: new Blob([JSON.stringify(manifest)]), contentType: 'application/json' }).pipe((o) => { calls.push({ key: `BLOB ${address}`, args: {} }); return o; }),
    urlOf: (address: string) => `http://server${address}`,
  } as unknown as SongsApi;
  return { api, calls };
}

let manifest: Json = { tracks: [{ file: 'out/ms-1/pista_1.mp3', audio_seconds: 131.4 }] };

const run = (over: Json = {}) => ({ id: 'run-1', project: 'ms-1', state: 'queued', client: 'music-studio', created_at: '2026-11-04T12:00:00Z', ...over });
const config = (over: Json = {}) => ({ parsed: { tracks: [{ title: 'Night drive', tags: 'lo-fi, chill' }], defaults: { music: { generator: 'heartmula' } }, ...over } });

describe('ServerSongs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    manifest = { tracks: [{ file: 'out/ms-1/pista_1.mp3', audio_seconds: 131.4 }] };
  });
  afterEach(() => vi.useRealTimers());

  describe('engines', () => {
    const routes = (engines: Json, music: Json[] = []): Record<string, Handler> => ({ 'GET /api/music/engines': () => ({ engines }), 'GET /api/environment': () => ({ music }) });

    it('reads HeartMuLa and DiffRhythm2 from the server, and ACE-Step from the models installed', async () => {
      const { api } = fake(routes({ heartmula: { available: true }, diffrhythm2: { available: false, reason: 'no_gpu', detail: 'x' } }, [{ name: 'acestep-v15-turbo-Q8_0.gguf' }]));
      const list = await firstValueFrom(new ServerSongs(api).engines());
      expect(list).toEqual([
        { generator: 'heartmula', available: true },
        { generator: 'ace-step', available: true },
        { generator: 'diffrhythm2', available: false, reason: 'no_gpu', detail: 'x' },
      ]);
    });

    it('says ACE-Step lacks its weights when none is installed, and an engine the server does not mention is unreachable', async () => {
      const { api } = fake(routes({}));
      const list = await firstValueFrom(new ServerSongs(api).engines());
      expect(list.find((e) => e.generator === 'ace-step')).toMatchObject({ available: false, reason: 'no_weights' });
      expect(list.find((e) => e.generator === 'heartmula')).toMatchObject({ available: false, reason: 'unreachable' });
    });
  });

  it('starts the container of a generator, and has nothing to start for ACE-Step', async () => {
    const { api, calls } = fake({ 'POST /api/music/engines/{engine}/start': () => ({}) });
    const s = new ServerSongs(api);
    await firstValueFrom(s.start('heartmula'));
    await firstValueFrom(s.start('ace-step'));
    expect(calls.map((c) => [c.key, c.args.path])).toEqual([['POST /api/music/engines/{engine}/start', { engine: 'heartmula' }]]);
  });

  describe('the containers of the engines', () => {
    const stop = 'POST /api/music/engines/{engine}/stop';
    const start = 'POST /api/music/engines/{engine}/start';

    it('reads HeartMuLa, DiffRhythm2 and LAION-CLAP with the state of their container', async () => {
      const { api, calls } = fake({
        'GET /api/music/engines': () => ({ engines: { heartmula: { available: true, container: { state: 'running' } }, diffrhythm2: { available: false, reason: 'not_running', container: { state: 'stopped' } }, clap: { available: false, reason: 'no_weights', detail: 'x' } } }),
      });
      const list = await firstValueFrom(new ServerSongs(api).containers());
      expect(list).toEqual([
        { engine: 'heartmula', available: true, container: 'running' },
        { engine: 'diffrhythm2', available: false, reason: 'not_running', container: 'stopped' },
        { engine: 'clap', available: false, reason: 'no_weights', detail: 'x' },
      ]);
      expect(calls.map((c) => c.key)).toEqual(['GET /api/music/engines']);
    });

    it('says an engine the server does not mention is unreachable', async () => {
      const { api } = fake({ 'GET /api/music/engines': () => ({ engines: {} }) });
      expect(await firstValueFrom(new ServerSongs(api).containers())).toEqual([
        { engine: 'heartmula', available: false, reason: 'unreachable' },
        { engine: 'diffrhythm2', available: false, reason: 'unreachable' },
        { engine: 'clap', available: false, reason: 'unreachable' },
      ]);
    });

    it('starts and stops LAION-CLAP like a generator', async () => {
      const { api, calls } = fake({ [start]: () => ({ container: 'starting' }), [stop]: () => ({ container: 'stopped' }) });
      const s = new ServerSongs(api);
      await firstValueFrom(s.start('clap'));
      await firstValueFrom(s.stopEngine('clap'));
      expect(calls.map((c) => [c.key, c.args.path])).toEqual([[start, { engine: 'clap' }], [stop, { engine: 'clap' }]]);
    });

    it('says a stop is refused because a run uses the engine (409), and a start because it cannot run (422) with the reason', async () => {
      const { api } = fake({
        [stop]: () => new ApiError(409, 'conflict', 'a run uses it'),
        [start]: () => new ApiError(422, 'validation_failed', 'cannot start', 'no_gpu'),
      });
      const s = new ServerSongs(api);
      await expect(firstValueFrom(s.stopEngine('heartmula'))).rejects.toMatchObject({ name: 'EngineFailed', kind: 'busy' });
      await expect(firstValueFrom(s.start('diffrhythm2'))).rejects.toMatchObject({ name: 'EngineFailed', kind: 'refused', reason: 'no_gpu' });
      await expect(firstValueFrom(s.start('diffrhythm2'))).rejects.toBeInstanceOf(EngineFailed);
    });
  });

  it('reads the vocabulary of style tags', async () => {
    const { api } = fake({ 'GET /api/assist/music-tags': () => ({ categories: [{ id: 'genre', tags: ['pop'] }], combos: [{ id: 'c', name: 'C', tags: ['pop', 'happy'] }] }) });
    expect(await firstValueFrom(new ServerSongs(api).vocabulary())).toEqual({ categories: [{ id: 'genre', tags: ['pop'] }], combos: [{ id: 'c', name: 'C', tags: ['pop', 'happy'] }] });
  });

  describe('the assistant', () => {
    const write = (handler: Handler, generator: SongRequest['generator'] = 'heartmula') => {
      const { api, calls } = fake({ 'POST /api/assist': handler });
      return { result: firstValueFrom(new ServerSongs(api).write({ text: 'a piano melody', generator, instrumental: false })), calls };
    };

    it('asks for a song of the chosen generator and takes the lyrics and the tags', async () => {
      const { result, calls } = write(() => ({ caption: 'A calm piano piece', lyrics: '[verse]\nla', tags: 'piano, calm' }));
      expect(await result).toEqual({ title: '', lyrics: '[verse]\nla', style: 'piano, calm' });
      expect(calls[0].args.body).toEqual({ task: 'music', text: 'a piano melody', generator: 'heartmula', instrumental: false });
    });

    it('asks the provider and the model it was given, for this call only', async () => {
      const { api, calls } = fake({ 'POST /api/assist': () => ({ caption: 'c', lyrics: 'l', tags: 't' }) });
      await firstValueFrom(new ServerSongs(api).write({ text: 'x', generator: 'heartmula', instrumental: false, provider: 'router', model: 'qwen3:8b' }));
      expect(calls[0].args.body).toEqual({ task: 'music', text: 'x', generator: 'heartmula', instrumental: false, provider: 'router', model: 'qwen3:8b' });
    });

    it('takes the caption as the style of ACE-Step', async () => {
      const { result } = write(() => ({ caption: 'A calm piano piece', lyrics: '', tags: 'ignored' }), 'ace-step');
      expect((await result).style).toBe('A calm piano piece');
    });

    it('says why it failed: busy, not there, or the model declined', async () => {
      for (const [status, kind] of [[409, 'busy'], [503, 'unavailable'], [422, 'refused']] as const) {
        const { result } = write(() => new ApiError(status, 'unknown', 'no'));
        await expect(result).rejects.toBeInstanceOf(AssistFailed);
        await expect(result).rejects.toMatchObject({ kind });
      }
    });

    it('lets any other failure through as it came', async () => {
      const { result } = write(() => new ApiError(0, 'unknown', 'No answer from the server'));
      await expect(result).rejects.toMatchObject({ status: 0 });
    });
  });

  it('lists the ways to recognise a song with their availability', async () => {
    const { api } = fake({ 'GET /api/music/recognizers': () => ({ recognizers: [{ id: 'whisper', available: true }, { id: 'clap', available: false, reason: 'not_running', detail: 'x' }, { id: 'muq', available: false, reason: 'no_weights' }] }) });
    expect(await firstValueFrom(new ServerSongs(api).recognizers())).toEqual([
      { id: 'whisper', available: true },
      { id: 'clap', available: false, reason: 'not_running', detail: 'x' },
      { id: 'muq', available: false, reason: 'no_weights' },
    ]);
  });

  describe('listening to a file', () => {
    const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
    const listen = (handler: Handler, options = DEFAULT_LISTEN) => {
      const { api, calls } = fake({ 'POST /api/assist/listen': handler });
      const prepared = new Blob(['wav'], { type: 'audio/wav' });
      return { result: firstValueFrom(new ServerSongs(api, { prepare: async () => prepared }).listen(file, options)), calls, prepared };
    };

    it('sends the 30 second piece the browser made and gives back what was heard', async () => {
      const { result, calls, prepared } = listen(() => ({ seconds: 30, style: 'Lo-fi hip-hop with piano', bpm: 92.4, keyscale: 'D minor', theme: 'rain', sound: ['warm', 'soft'], no_words: true, genre_unknown: false, request: 'ignored' }));
      expect(await result).toEqual({ style: 'Lo-fi hip-hop with piano', bpm: 92, keyscale: 'D minor', theme: 'rain', sound: ['warm', 'soft'], genreUnknown: false, noWords: true });
      expect(calls[0].args.body).toBe(prepared);
    });

    it('asks the way the user chose, and in the language the user said', async () => {
      const { result, calls } = listen(() => ({ style: 'x' }), { method: 'clap', language: 'es', hint: '' });
      await result;
      expect(calls[0].args.query).toEqual({ method: 'clap', language: 'es' });
      const plain = listen(() => ({ style: 'x' }));
      await plain.result;
      expect(plain.calls[0].args.query).toEqual({ method: 'whisper' });
    });

    it('says why it could not: busy, too long, not readable, not there, too slow', async () => {
      for (const [status, kind] of [[409, 'busy'], [413, 'tooLong'], [422, 'unreadable'], [503, 'unavailable'], [504, 'timeout']] as const) {
        const { result } = listen(() => new ApiError(status, 'unknown', 'no'));
        await expect(result).rejects.toBeInstanceOf(ListenFailed);
        await expect(result).rejects.toMatchObject({ kind });
      }
    });

    it('lets any other failure through as it came', async () => {
      const { result } = listen(() => new ApiError(0, 'unknown', 'No answer from the server'));
      await expect(result).rejects.toMatchObject({ status: 0 });
    });
  });

  describe('listening to a YouTube address', () => {
    const URL = 'https://youtu.be/abc123';
    const WORDS = { method: 'whisper', language: '', hint: '' } as const;
    const SOUND = { method: 'clap', language: '', hint: '' } as const;
    const routes = (over: Record<string, Handler> = {}): Record<string, Handler> => ({
      'POST /api/projects': () => ({ id: 'ms-tmp-x' }),
      'POST /api/projects/{id}/sources/from-url': () => ({ name: 'clip.mp3' }),
      'POST /api/projects/{id}/measure': () => ({ bpm: 91.6, keyscale: 'A minor' }),
      'POST /api/projects/{id}/recognize': () => ({ tags: ['lo-fi', 'chill', 'piano'] }),
      'POST /api/projects/{id}/transcribe': () => ({ language: 'en', text: 'la la la' }),
      'POST /api/assist': () => ({ caption: 'Chill lo-fi with piano', tags: 'lo-fi, chill, piano, slow' }),
      'DELETE /api/projects/{id}': () => ({}),
      ...over,
    });
    const keys = (calls: { key: string }[]) => calls.map((c) => c.key.replace('POST /api/projects/{id}/', '').replace('POST /api/', ''));

    it('with the words: fetches the audio into a temporary project, measures it, reads the words, has the assistant describe it, and deletes the project', async () => {
      const { api, calls } = fake(routes());
      const heard = await firstValueFrom(new ServerSongs(api, { now: () => 1000 }).listenUrl(URL, 'heartmula', { ...WORDS, language: 'es', hint: 'warm' }));
      expect(keys(calls)).toEqual(['projects', 'sources/from-url', 'measure', 'transcribe', 'assist', 'DELETE /api/projects/{id}']);
      expect(calls[0].args.body).toEqual({ id: 'ms-tmp-rs' });
      expect(calls[1].args.body).toEqual({ url: URL });
      expect(calls[3].args.body).toEqual({ source: 'clip.mp3', language: 'es' });
      expect(calls[4].args.body).toEqual({ task: 'lyrics-from-transcript', text: 'la la la', generator: 'heartmula', language: 'es', hint: 'warm', bpm: 91.6, keyscale: 'A minor' });
      expect(heard).toMatchObject({ style: 'Chill lo-fi with piano', tags: ['lo-fi', 'chill', 'piano', 'slow'], bpm: 92, keyscale: 'A minor', genreUnknown: false, noWords: false });
    });

    it('with the sound: hears it with LAION-CLAP instead of reading the words, and passes what it heard as a hint with the user\'s', async () => {
      const { api, calls } = fake(routes());
      await firstValueFrom(new ServerSongs(api).listenUrl(URL, 'heartmula', { ...SOUND, hint: 'warm' }));
      expect(keys(calls)).toEqual(['projects', 'sources/from-url', 'measure', 'recognize', 'assist', 'DELETE /api/projects/{id}']);
      expect(calls[3].args.body).toEqual({ source: 'clip.mp3', method: 'clap' });
      expect(calls[4].args.body).toMatchObject({ text: '', hint: 'warm. lo-fi, chill, piano' });
    });

    it('goes on without the measures or CLAP, which are only hints, and says the genre is unknown when nothing came back', async () => {
      const { api } = fake(routes({ 'POST /api/projects/{id}/recognize': () => new ApiError(503, 'unknown', 'no clap'), 'POST /api/projects/{id}/measure': () => new ApiError(503, 'unknown', 'no ffmpeg'), 'POST /api/assist': () => ({ caption: '' }) }));
      expect(await firstValueFrom(new ServerSongs(api).listenUrl(URL, 'ace-step', SOUND))).toMatchObject({ style: '', tags: [], genreUnknown: true });
    });

    it('fails when the words cannot be read and the user asked for them', async () => {
      const { api, calls } = fake(routes({ 'POST /api/projects/{id}/transcribe': () => new ApiError(503, 'unknown', 'no whisper') }));
      await expect(firstValueFrom(new ServerSongs(api).listenUrl(URL, 'heartmula', WORDS))).rejects.toMatchObject({ kind: 'unavailable' });
      expect(calls.at(-1)?.key).toBe('DELETE /api/projects/{id}');
    });

    it('refuses an address that is not YouTube without calling the server', async () => {
      const { api, calls } = fake(routes());
      await expect(firstValueFrom(new ServerSongs(api).listenUrl('https://vimeo.com/1', 'heartmula', WORDS))).rejects.toMatchObject({ kind: 'badUrl' });
      expect(calls).toEqual([]);
    });

    it('says why it could not, and deletes the temporary project all the same', async () => {
      for (const [status, kind] of [[409, 'busy'], [422, 'unreadable'], [503, 'unavailable'], [504, 'timeout']] as const) {
        const { api, calls } = fake(routes({ 'POST /api/projects/{id}/sources/from-url': () => new ApiError(status, 'unknown', 'no') }));
        await expect(firstValueFrom(new ServerSongs(api).listenUrl(URL, 'heartmula', WORDS))).rejects.toMatchObject({ kind });
        expect(calls.at(-1)?.key).toBe('DELETE /api/projects/{id}');
      }
    });

    it('lets any other failure through as it came', async () => {
      const { api } = fake(routes({ 'POST /api/projects/{id}/sources/from-url': () => new ApiError(0, 'unknown', 'No answer from the server') }));
      await expect(firstValueFrom(new ServerSongs(api).listenUrl(URL, 'heartmula', WORDS))).rejects.toMatchObject({ status: 0 });
    });
  });

  describe('generating', () => {
    const routes = (over: Record<string, Handler> = {}): Record<string, Handler> => ({
      'POST /api/projects': () => ({ id: 'ms-1' }),
      'GET /api/projects/{id}/config': () => ({ parsed: { project: 'ms-1', output: { mode: 'video' }, defaults: { model: 'm', fps: 24 }, scenes: [{ id: 'a' }] } }),
      'PUT /api/projects/{id}/config': () => ({}),
      'POST /api/projects/{id}/runs': () => ({ run: { id: 'run-1' }, queue_position: 2 }),
      'GET /api/runs': () => [],
      ...over,
    });

    it('creates the project, saves one music track with this dashboard as client, and starts the run', async () => {
      const { api, calls } = fake(routes());
      const song = await firstValueFrom(new ServerSongs(api, { now: () => 1000 }).generate(REQUEST));
      expect(calls.map((c) => c.key)).toEqual(['POST /api/projects', 'GET /api/projects/{id}/config', 'PUT /api/projects/{id}/config', 'POST /api/projects/{id}/runs']);
      const saved = load(String(calls[2].args.body?.['yaml'])) as Json;
      expect(saved).toMatchObject({ client: 'music-studio', output: { mode: 'music' }, defaults: { music: { generator: 'heartmula' } } });
      expect(saved['tracks']).toMatchObject([{ title: 'Night drive', tags: 'lo-fi, chill', lyrics: '[verse]\nla' }]);
      expect(saved).not.toHaveProperty('scenes');
      expect(calls[3].args).toEqual({ path: { id: 'ms-rs' }, body: { mode: 'music' } });
      expect(song).toMatchObject({ id: 'ms-rs', title: 'Night drive', style: 'lo-fi, chill', generator: 'heartmula', state: { phase: 'queued', position: 2 } });
    });

    it('makes the track as long as the request says, within the bounds, and two minutes otherwise', async () => {
      for (const [seconds, expected] of [[45, 45], [undefined, 120], [0, 120], [5, 120], [601, 120], [90.5, 120]] as const) {
        const { api, calls } = fake(routes());
        await firstValueFrom(new ServerSongs(api, { now: () => 1000 }).generate({ ...REQUEST, ...(seconds !== undefined ? { seconds } : {}) }));
        const saved = load(String(calls[2].args.body?.['yaml'])) as Json;
        expect((saved['tracks'] as { duration_seconds: number }[])[0].duration_seconds, String(seconds)).toBe(expected);
      }
    });

    it('labels the song with the client the host gave, not with the studio\'s own', async () => {
      const { api, calls } = fake(routes());
      await firstValueFrom(new ServerSongs(api, { now: () => 1000, client: 'dashboard-full' }).generate(REQUEST));
      expect(load(String(calls[2].args.body?.['yaml']))).toMatchObject({ client: 'dashboard-full' });
    });

    it('refuses a request that is not valid without calling the server', async () => {
      const { api, calls } = fake(routes());
      await expect(firstValueFrom(new ServerSongs(api).generate({ ...REQUEST, title: '' }))).rejects.toMatchObject({ problems: ['title.required'] });
      expect(calls).toEqual([]);
    });

    it('says the server refused the song when it answers 422', async () => {
      const { api } = fake(routes({ 'PUT /api/projects/{id}/config': () => new ApiError(422, 'unknown', 'the model is missing') }));
      const failure = firstValueFrom(new ServerSongs(api).generate(REQUEST));
      await expect(failure).rejects.toBeInstanceOf(SongRefused);
      await expect(failure).rejects.toMatchObject({ message: 'the model is missing' });
    });
  });

  describe('the history', () => {
    const history = (runs: Json[], extra: Record<string, Handler> = {}) =>
      fake({ 'GET /api/runs': () => runs, 'GET /api/projects/{id}/config': () => config(), ...extra });

    async function songs(s: ServerSongs): Promise<readonly Song[]> {
      const seen: (readonly Song[])[] = [];
      s.songs().subscribe((l) => seen.push(l));
      await vi.advanceTimersByTimeAsync(0);
      return seen.at(-1)!;
    }

    it('lists only the runs of this dashboard, newest first, with the title and style of their projects', async () => {
      const { api } = history([run({ id: 'r2', project: 'ms-2', created_at: '2026-11-04T13:00:00Z', state: 'running' }), run({ id: 'r0', project: 'other', client: 'video-studio' }), run({ id: 'r3', project: 'ms-3', client: '' }), run({ project: 'ms-1', state: 'cancelled' })]);
      const list = await songs(new ServerSongs(api));
      expect(list.map((s) => [s.id, s.state.phase])).toEqual([['ms-2', 'running'], ['ms-1', 'cancelled']]);
      expect(list[0]).toMatchObject({ title: 'Night drive', style: 'lo-fi, chill', generator: 'heartmula' });
    });

    it('lists the runs of the client the host gave and none of the studio\'s own', async () => {
      const { api } = history([run({ id: 'r1', project: 'ms-1', client: 'dashboard-full' }), run({ id: 'r2', project: 'ms-2', client: 'music-studio' })]);
      const list = await songs(new ServerSongs(api, { client: 'dashboard-full' }));
      expect(list.map((s) => s.id)).toEqual(['ms-1']);
    });

    it('gives a finished song its address and its length from the manifest', async () => {
      const { api } = history([run({ state: 'succeeded' })]);
      const [song] = await songs(new ServerSongs(api));
      expect(song.state).toEqual({ phase: 'done', url: 'http://server/api/projects/ms-1/artifacts/out/ms-1/pista_1.mp3', seconds: 131 });
    });

    it('shows a succeeded run whose file is gone as failed', async () => {
      manifest = { tracks: [] };
      const { api } = history([run({ state: 'succeeded' })]);
      expect((await songs(new ServerSongs(api)))[0].state.phase).toBe('failed');
    });

    it('gives a failed run the reason the server gave, and an interrupted one a reason of its own', async () => {
      const { api } = history([run({ project: 'ms-1', state: 'failed', error: 'out of memory' }), run({ id: 'r9', project: 'ms-9', state: 'interrupted', created_at: '2026-11-04T11:00:00Z' })]);
      const list = await songs(new ServerSongs(api));
      expect(list[0].state).toEqual({ phase: 'failed', reason: 'out of memory' });
      expect(list[1].state).toEqual({ phase: 'failed', reason: 'Interrupted' });
    });

    it('reads again while a song is unfinished, and stops when it is done', async () => {
      let state = 'queued';
      const { api, calls } = history([], { 'GET /api/runs': () => [run({ state })] });
      const s = new ServerSongs(api, { pollMs: 100 });
      const seen: Song[] = [];
      s.follow('ms-1').subscribe((x) => seen.push(x));
      await vi.advanceTimersByTimeAsync(0);
      state = 'running';
      await vi.advanceTimersByTimeAsync(100);
      state = 'succeeded';
      await vi.advanceTimersByTimeAsync(100);
      expect(seen.map((x) => x.state.phase)).toEqual(['queued', 'running', 'done']);
      const reads = calls.filter((c) => c.key === 'GET /api/runs').length;
      await vi.advanceTimersByTimeAsync(1000);
      expect(calls.filter((c) => c.key === 'GET /api/runs')).toHaveLength(reads);
    });
  });

  describe('cancelling and removing', () => {
    it('cancels the run of the song', async () => {
      const { api, calls } = fake({ 'GET /api/runs': () => [run()], 'GET /api/projects/{id}/config': () => config(), 'POST /api/runs/{id}/cancel': () => ({}) });
      const s = new ServerSongs(api);
      s.songs().subscribe();
      await vi.advanceTimersByTimeAsync(0);
      await firstValueFrom(s.cancel('ms-1'));
      expect(calls.find((c) => c.key === 'POST /api/runs/{id}/cancel')?.args.path).toEqual({ id: 'run-1' });
    });

    it('removes the project of the song and takes it out of the list', async () => {
      const { api, calls } = fake({ 'GET /api/runs': () => [run({ state: 'failed' })], 'GET /api/projects/{id}/config': () => config(), 'DELETE /api/projects/{id}': () => ({}) });
      const s = new ServerSongs(api);
      const seen: (readonly Song[])[] = [];
      s.songs().subscribe((l) => seen.push(l));
      await vi.advanceTimersByTimeAsync(0);
      await firstValueFrom(s.remove('ms-1'));
      expect(calls.find((c) => c.key === 'DELETE /api/projects/{id}')?.args.path).toEqual({ id: 'ms-1' });
      expect(seen.at(-1)).toEqual([]);
    });
  });
});
