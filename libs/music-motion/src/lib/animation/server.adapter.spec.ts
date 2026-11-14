import { ApiError } from '@lab/api-client';
import { Observable, delay, firstValueFrom, of, throwError, toArray } from 'rxjs';

import { AnimationFailure, type Song } from '@lab/animation-core';
import { defaultChoices } from './validate';
import { serverCatalog, serverDesign, serverDetail, serverDraft, serverLearning, serverPiece, serverPreset, serverReference } from './server.fixture';
import { ServerAnimation, type AnimationApi } from './server.adapter';
import { fromPlanInput, toAssistedPlan, fromPropose, toDetail, toDraft, type ServerDraft, type ServerLearning, type ServerPiece, type ServerPreset, type ServerReference } from './server-mapping';

const SONG: Song = { key: 'demo-musica/track-1/7', project: 'demo-musica', trackId: 'track-1', variant: 0, title: 'Quiet Town', seconds: 48, instrumental: false };

/** A server in a few lines: what the adapter asks is answered from `store` and every call is recorded. */
class FakeApi {
  store: ServerPiece[] = [];
  songs: object[] = [{ key: 'a/b/1', project: 'a', track_id: 'b', variant: 0, title: 'A song', audio_seconds: 10, file: 'out/a/b.mp3' }];
  calls: { method: string; path: string; options?: { path?: { id: string }; body?: unknown; query?: { reference_id?: string } } }[] = [];
  refs: ServerReference[] = [];
  drafts: ServerDraft[] = [];
  /** The parts of the user's the server can read back, by name. */
  userParts: Record<string, { manifest: object; fragment: string }> = {};
  presets: ServerPreset[] = [];
  learnings: ServerLearning[] = [];
  /** The status the server gives to a `learn`: 202 starts one, 200 says one was already running (the same body). */
  catalogNow = serverCatalog;
  fail?: ApiError;
  /** What the server answers to `POST /api/assist/svg`, or the failure it gives. */
  svg: object | ApiError = { svg: '<svg viewBox="0 0 1 1"/>', model: 'qwen3:8b' };
  /** What the server answers to `POST /api/assist/plan`, or the failure it gives. */
  planAnswer: object | ApiError = {};
  models?: object = { default: 'qwen3:8b', models: [{ name: 'qwen3:8b', size_bytes: 5200000000, fits: true }, { name: 'gemma4:26b', size_bytes: 17000000000, fits: false }] };
  /** What the server answers to the scenes and the review of a piece. */
  batch: object = { state: 'writing', done: 0, total: 2, drafts: [{ script_piece: 'p1', state: 'pending' }, { script_piece: 'p2', state: 'pending' }], brief_mode: 'metaphor', started_at: '2026-11-13T10:00:00Z' };
  review: object = { state: 'running', started_at: '2026-11-13T10:00:00Z', scenes: [] };
  onGet?: (id: string) => ServerPiece | null;
  /** How long the server takes to answer a read, to see what a list shows before it has answered. */
  delayMs = 0;

  get = ((path: string, options?: { path?: { id: string }; query?: { reference_id?: string } }) => {
    const answer = this.read(path, options) as Observable<unknown>;
    return this.delayMs > 0 ? answer.pipe(delay(this.delayMs)) : answer;
  }) as unknown as AnimationApi['get'];

  private read = ((path: string, options?: { path?: { id: string }; query?: { reference_id?: string } }) => {
    this.calls.push({ method: 'get', path, options });
    if (path === '/api/library') return of({ songs: this.songs });
    if (path === '/api/assist/models') return this.models ? of(this.models) : throwError(() => new ApiError(503, 'unavailable', 'no assistant'));
    if (path === '/api/music-motion/pieces') return of(this.store.map((p) => ({ ...p, design: undefined, script: undefined, song_map: undefined })));
    if (path === '/api/music-motion/part-drafts') return of({ drafts: this.drafts.map((d) => ({ ...d, manifest: undefined, fragment: undefined })) });
    if (path === '/api/music-motion/part-drafts/{id}') {
      const d = this.drafts.find((x) => x.id === options!.path!.id);
      return d ? of(d) : throwError(() => new ApiError(404, 'not_found', 'not found'));
    }
    if (path === '/api/music-motion/catalog') return of(options && (options as { query?: { piece?: string } }).query?.piece ? { ...this.catalogNow, parts: [...this.catalogNow.parts, { name: 'scene-x-1', description: 'A scene', levels: ['simple'], cost_ms: 60, source: 'user', verse: 'own', scene: { piece: 'api-mm-1', script_piece: 'p1' }, params: [] }] } : this.catalogNow);
    if (path === '/api/music-motion/references') return of({ references: this.refs });
    if (path === '/api/music-motion/presets') return of({ presets: this.presets });
    if (path === '/api/music-motion/learnings') return of({ learnings: options?.query?.reference_id ? this.learnings.filter((l) => l.reference_id === options.query!.reference_id) : this.learnings });
    if (path === '/api/music-motion/learnings/{id}') {
      const l = this.learnings.find((x) => x.id === options!.path!.id);
      return l ? of(l) : throwError(() => new ApiError(404, 'not_found', 'not found'));
    }
    if (path === '/api/music-motion/references/{id}') {
      const r = this.refs.find((x) => x.id === options!.path!.id);
      return r ? of(r) : throwError(() => new ApiError(404, 'not_found', 'not found'));
    }
    if (path === '/api/music-motion/presets/{id}') {
      const p = this.presets.find((x) => x.id === options!.path!.id);
      return p ? of(p) : throwError(() => new ApiError(404, 'not_found', 'not found'));
    }
    if (path === '/api/music-motion/parts/{name}') {
      const name = (options!.path as unknown as { name: string }).name;
      const p = this.userParts[name];
      return p ? of({ name, source: 'user', ...p }) : throwError(() => new ApiError(404, 'not_found', 'not found'));
    }
    const id = options!.path!.id;
    const found = this.onGet ? this.onGet(id) : (this.store.find((p) => p.id === id) ?? null);
    return found ? of(found) : throwError(() => new ApiError(404, 'not_found', 'not found'));
  }) as unknown as (path: string, options?: { path?: { id: string } }) => unknown;

  post = ((path: string, options?: { path?: { id: string }; body?: { what?: string } }) => {
    this.calls.push({ method: 'post', path, options });
    if (this.fail) return throwError(() => this.fail);
    if (path === '/api/music-motion/pieces/{id}/scenes') return of(this.batch);
    if (path === '/api/music-motion/pieces/{id}/scenes/approve') return of({ approved: [{ script_piece: 'p1', part: 'scene-x-1', draft_id: 'd1' }], not_approved: [{ script_piece: 'p2', draft_id: 'd2', state: 'failed', error: 'no' }], script: { version: 1, pieces: [{ id: 'p1', start: 0, end: 1, part: 'scene-x-1' }] } });
    if (path === '/api/music-motion/pieces/{id}/review') return of(this.review);
    if (path === '/api/assist/svg') return this.svg instanceof ApiError ? throwError(() => this.svg) : of(this.svg);
    if (path === '/api/assist/plan') return this.planAnswer instanceof ApiError ? throwError(() => this.planAnswer) : of(this.planAnswer);
    if (path === '/api/music-motion/part-drafts' && (options?.body as { manifest?: string; request?: string } | undefined)?.manifest !== undefined && (options?.body as { request?: string }).request === undefined) {
      const text = options!.body as { manifest: string; fragment: string };
      const made = serverDraft({ id: `draft-${this.drafts.length + 1}`, state: 'ready', request: '', name: 'bars', preview: ['01.png'], manifest: text.manifest, fragment: text.fragment });
      this.drafts.unshift(made);
      return of(made);
    }
    if (path === '/api/music-motion/part-drafts') {
      const made = serverDraft({ id: `draft-${this.drafts.length + 1}`, state: 'writing', name: undefined, preview: [], manifest: undefined, fragment: undefined });
      this.drafts.unshift(made);
      return of(made);
    }
    if (path.endsWith('/retry')) return of(serverDraft({ state: 'writing', name: undefined, preview: [] }));
    if (path.endsWith('/approve')) return of({ name: 'ticking-clock', description: 'A clock', levels: ['simple'], cost_ms: 60, source: 'user', params: [] });
    if (path === '/api/music-motion/references') {
      const made = serverReference({ id: `ref-${this.refs.length + 1}`, state: 'analysing', analysis: undefined });
      this.refs.unshift(made);
      return of(made);
    }
    if (path === '/api/music-motion/presets') return of(serverPreset({ reference_id: (options!.body as { reference_id: string }).reference_id }));
    if (path === '/api/music-motion/references/{id}/learn') {
      const made = serverLearning({ id: `learn-${this.learnings.length + 1}`, reference_id: options!.path!.id, state: 'running', styles: [], part_drafts: [], discarded: [], skipped: [], strictness: ((options as { body?: { strictness?: string } }).body?.strictness ?? 'normal') as ServerLearning['strictness'] });
      this.learnings.unshift(made);
      return of(made);
    }
    if (path === '/api/music-motion/pieces') {
      const made = serverDetail({ id: `api-mm-${this.store.length + 1}` });
      this.store.unshift(made);
      return of(made);
    }
    if (path.endsWith('/transcribe')) return of(serverDetail({ id: options!.path!.id, words_note: undefined, script_warning: '2 pieces', song_map: { ...serverDetail().song_map!, words_estimated: false } }));
    if (path.endsWith('/propose')) {
      const body = options!.body as { what?: string; async?: boolean; model?: string; provider?: string };
      if (body.what === 'all' || body.async) return of({ state: 'waiting', what: body.what, started_at: '2026-11-09T10:00:00Z', ...(body.model ? { model: body.model } : {}) });
      return of({ what: body.what, source: 'fallback', fallback_reason: 'a run holds the memory', model: body.model ?? 'qwen3:8b', ...(body.provider ? { provider: body.provider } : {}), replacements: [{ piece: 'p1', from: 'wire-sphere', to: 'toggle' }] });
    }
    return of({ run_id: 'run-1', estimate: { seconds: 12, estimate: true, frames: 300, corrected: false, factor: 1 } });
  }) as unknown as AnimationApi['post'];

  patch = ((path: string, options: { path: { id: string }; body: { title?: string } }) => {
    this.calls.push({ method: 'patch', path, options });
    if (this.fail) return throwError(() => this.fail);
    const r = this.refs.find((x) => x.id === options.path.id)!;
    return of({ ...r, ...options.body });
  }) as unknown as AnimationApi['patch'];

  postForm = ((path: string, form: FormData) => {
    this.calls.push({ method: 'postForm', path, options: { body: form } });
    if (this.fail) return throwError(() => this.fail);
    if (path === '/api/music-motion/part-drafts') {
      const made = serverDraft({ id: `draft-${this.drafts.length + 1}`, state: 'writing', name: undefined, preview: [], manifest: undefined, fragment: undefined });
      this.drafts.unshift(made);
      return of(made);
    }
    const made = serverReference({ id: `ref-${this.refs.length + 1}`, state: 'analysing', analysis: undefined });
    this.refs.unshift(made);
    return of(made);
  }) as unknown as AnimationApi['postForm'];

  put = ((path: string, options: { path: { id: string }; body: unknown }) => {
    this.calls.push({ method: 'put', path, options });
    if (path === '/api/music-motion/part-drafts/{id}') return this.fail ? throwError(() => this.fail) : of(serverDraft({ ...(options.body as object) } as Partial<ServerDraft>));
    if (path === '/api/music-motion/presets/{id}') return this.fail ? throwError(() => this.fail) : of(serverPreset({ ...(options.body as object) } as Partial<ServerPreset>));
    if (path === '/api/music-motion/parts/{name}') return this.fail ? throwError(() => this.fail) : of({ name: 'bars', description: 'Better bars', levels: ['simple'], cost_ms: 60, source: 'user', params: [] });
    return this.fail ? throwError(() => this.fail) : of(options.body);
  }) as unknown as AnimationApi['put'];

  delete = ((path: string, options: { path: { id: string } }) => {
    this.calls.push({ method: 'delete', path, options });
    if (this.fail) return throwError(() => this.fail);
    this.store = this.store.filter((p) => p.id !== options.path.id);
    this.refs = this.refs.filter((p) => p.id !== options.path.id);
    this.drafts = this.drafts.filter((p) => p.id !== options.path.id);
    return of(path === '/api/music-motion/pieces/{id}/scenes' ? { ...this.batch, state: 'cancelled' } : undefined);
  }) as unknown as AnimationApi['delete'];

  urlOf = (a: string) => `http://server${a}`;
  count = (method: string, path: string) => this.calls.filter((c) => c.method === method && c.path === path).length;
}

const setup = (store: ServerPiece[] = []) => {
  const api = new FakeApi();
  api.store = store;
  return { api, port: new ServerAnimation(api as unknown as AnimationApi, { pollMs: 5, client: 'video-anim' }) };
};
const first = <T>(o: Observable<T>) => firstValueFrom(o);
const failure = async (o: Observable<unknown>): Promise<AnimationFailure> => {
  try {
    await first(o);
  } catch (e) {
    expect(e).toBeInstanceOf(AnimationFailure);
    return e as AnimationFailure;
  }
  throw new Error('it did not fail');
};
const until = async (read: () => boolean) => {
  for (let i = 0; i < 200 && !read(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(read()).toBe(true);
};

describe('ServerAnimation', () => {
  it('reads the songs from the library, with their audio as an address of the project', async () => {
    const { port } = setup();
    expect(await first(port.songs())).toEqual([{ key: 'a/b/1', project: 'a', trackId: 'b', variant: 0, title: 'A song', seconds: 10, instrumental: false, audio: 'http://server/api/projects/a/artifacts/out/a/b.mp3' }]);
  });

  it('reads the catalog once, however many times it is asked', async () => {
    const { api, port } = setup();
    await first(port.catalog());
    expect((await first(port.catalog())).parts.map((p) => p.name)).toContain('toggle');
    expect(api.count('get', '/api/music-motion/catalog')).toBe(1);
  });

  it('makes a piece with this dashboard\'s client name and puts it in the list', async () => {
    const { api, port } = setup();
    const made = await first(port.create(SONG, defaultChoices()));
    expect(made.design.design.accent).toBe(serverDesign.accent);
    const call = api.calls.find((c) => c.method === 'post' && c.path === '/api/music-motion/pieces')!;
    expect(call.options!.body).toMatchObject({ project: 'demo-musica', track_id: 'track-1', variant: 0, style: 'typographic', level: 'simple', fps: 30, client: 'video-anim' });
    const list = await first(port.pieces());
    expect(list.map((p) => p.id)).toContain(made.id);
  });

  it('refuses bad choices before asking the server', async () => {
    const { api, port } = setup();
    const bad = await failure(port.create(SONG, { ...defaultChoices(), fps: 25 }));
    expect(bad.kind).toBe('refused');
    expect(api.count('post', '/api/music-motion/pieces')).toBe(0);
  });

  it('turns the server\'s refusals into failures with its words and changes nothing in the list', async () => {
    const { api, port } = setup();
    api.fail = new ApiError(422, 'validation_failed', 'the song is unknown');
    const refused = await failure(port.create(SONG, defaultChoices()));
    expect(refused).toMatchObject({ kind: 'refused', reason: 'the song is unknown' });
    expect(await first(port.pieces())).toEqual([]);
    api.fail = new ApiError(409, 'conflict', 'being drawn');
    expect((await failure(port.saveDesign('api-mm-1', { ...defaultDesign() }))).kind).toBe('busy');
    api.fail = new ApiError(503, 'unavailable', 'no browser');
    expect((await failure(port.render('api-mm-1'))).kind).toBe('unavailable');
  });

  it('lets a 401 through untouched', async () => {
    const { api, port } = setup();
    api.fail = new ApiError(401, 'unauthorized', 'token');
    try {
      await first(port.create(SONG, defaultChoices()));
      throw new Error('it did not fail');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
    }
  });

  it('saves the design and the script with the server\'s names and answers the piece as the server holds it', async () => {
    const { api, port } = setup([serverDetail()]);
    const design = { dark: '#000000', light: '#ffffff', accent: '#ff0000', display: 'Inter', body: 'Inter', defaultMode: 'light' as const, modes: { verse: 'dark' as const }, concept: 'c' };
    await first(port.saveDesign('api-mm-1', design));
    expect(api.calls.find((c) => c.method === 'put' && c.path.endsWith('/design'))!.options!.body).toEqual({ dark: '#000000', light: '#ffffff', accent: '#ff0000', display: 'Inter', body: 'Inter', default_mode: 'light', modes: { verse: 'dark' }, concept: 'c' });
    const piece = await first(port.saveScript('api-mm-1', { version: 1, pieces: [{ id: 'p1', start: 0, end: 20, part: 'counter' }] }));
    expect(api.calls.find((c) => c.method === 'put' && c.path.endsWith('/script'))!.options!.body).toEqual({ version: 1, pieces: [{ id: 'p1', start: 0, end: 20, part: 'counter' }] });
    expect(piece.id).toBe('api-mm-1');
  });

  it('proposes, answers its source and the replacements, and the piece as it is after', async () => {
    const { port } = setup([serverDetail()]);
    const proposal = await first(port.propose('api-mm-1', { what: 'script' }));
    expect(proposal).toMatchObject({ what: 'script', source: 'fallback', replacements: [{ piece: 'p1', from: 'wire-sphere', to: 'toggle' }] });
    expect(proposal.piece.id).toBe('api-mm-1');
  });

  describe('planning from one sentence', () => {
    const answer = { song: { title: 'Night Drive', caption: 'c', lyrics: '', tags: 'a, b', instrumental: true, seconds: 90 }, animation: { style: 'illustrated', level: 'medium', fps: 30, mode: 'dark', concept: 'night', prompt: 'the sentence' }, parts: [{ name: 'counter', exists: true }, { name: 'year-ticker', exists: false, request: 'a ticker of years' }], warnings: ['no level'] };

    it('sends the sentence and, only when given, the generator, the language, the provider and the model; and maps the answer', async () => {
      const { api, port } = setup();
      api.planAnswer = answer;
      const plan = await first(port.plan({ text: ' a night drive ', generator: 'ace-step', language: 'es', provider: 'router', model: 'gpt' }));
      expect(api.calls.at(-1)).toMatchObject({ method: 'post', path: '/api/assist/plan', options: { body: { text: 'a night drive', generator: 'ace-step', language: 'es', model: 'gpt', provider: 'router' } } });
      expect(plan).toEqual({ ...answer, parts: [{ name: 'counter', exists: true }, { name: 'year-ticker', exists: false, request: 'a ticker of years' }] });
      await first(port.plan({ text: 'x' }));
      expect(api.calls.at(-1)!.options!.body).toEqual({ text: 'x' });
      expect(fromPlanInput({ text: 'x', provider: '' })).toEqual({ text: 'x' });
    });

    it('fills what the server left out: empty text, zero numbers, no parts', () => {
      expect(toAssistedPlan({})).toEqual({ song: { title: '', caption: '', lyrics: '', tags: '', instrumental: false, seconds: 0 }, animation: { style: '', level: '', fps: 0, mode: '', concept: '', prompt: '' }, parts: [], warnings: [] });
    });

    it('fails by what the server says: busy, refused, not consented, no assistant', async () => {
      for (const [status, kind] of [[409, 'busy'], [422, 'refused'], [400, 'refused'], [503, 'unavailable']] as const) {
        const { api, port } = setup();
        api.planAnswer = new ApiError(status, 'unknown', 'the server says no');
        const failed = await failure(port.plan({ text: 'x' }));
        expect(failed).toMatchObject({ kind, reason: expect.stringContaining('the server says no') });
      }
    });

    it('refuses an empty or too long sentence before asking', async () => {
      const { api, port } = setup();
      expect((await failure(port.plan({ text: '  ' }))).kind).toBe('refused');
      expect((await failure(port.plan({ text: 'x'.repeat(2001) }))).kind).toBe('refused');
      expect(api.calls.some((c) => c.path === '/api/assist/plan')).toBe(false);
    });
  });

  it('sends the provider of a proposal for this call only, and reads it back from the answer', async () => {
    const { api, port } = setup([serverDetail()]);
    await first(port.propose('api-mm-1', { what: 'script', prompt: 'x', model: 'gpt', provider: 'router' }));
    expect(api.calls.find((c) => c.path.endsWith('/propose'))!.options!.body).toEqual({ what: 'script', prompt: 'x', model: 'gpt', provider: 'router' });
    expect((await first(port.propose('api-mm-1', { what: 'design', provider: 'router' }))).provider).toBe('router');
    expect((await first(port.propose('api-mm-1', { what: 'design' }))).provider).toBeUndefined();
    expect(fromPropose({ what: 'design' })).toEqual({ what: 'design' });
    expect(fromPropose({ what: 'all', provider: 'router' }, true)).toEqual({ what: 'all', provider: 'router', async: true });
  });

  it('sends the prompt and the model of a proposal, and answers the model and why the fixed rule wrote it', async () => {
    const { api, port } = setup([serverDetail()]);
    const proposal = await first(port.propose('api-mm-1', { what: 'design', prompt: 'a calm night', model: 'gemma4:26b' }));
    expect(api.calls.find((c) => c.path.endsWith('/propose'))!.options!.body).toEqual({ what: 'design', prompt: 'a calm night', model: 'gemma4:26b' });
    expect(proposal).toMatchObject({ source: 'fallback', model: 'gemma4:26b', fallbackReason: 'a run holds the memory' });
  });

  it('sends the prompt with the piece it makes, and reads it back', async () => {
    const { api, port } = setup();
    await first(port.create(SONG, { ...defaultChoices(), prompt: 'a long night' }));
    expect(api.calls.find((c) => c.method === 'post' && c.path === '/api/music-motion/pieces')!.options!.body).toMatchObject({ prompt: 'a long night' });
    expect(toDetail(serverDetail({ prompt: 'a long night' })).prompt).toBe('a long night');
  });

  it('asks for both in the background and answers the piece, whose proposal is waiting', async () => {
    const { api, port } = setup([serverDetail({ proposal: { state: 'waiting', what: 'all', started_at: '2026-11-09T10:00:00Z', model: 'qwen3:8b' } })]);
    const piece = await first(port.proposeAll('api-mm-1', { prompt: 'a calm night', model: 'qwen3:8b' }));
    expect(api.calls.find((c) => c.path.endsWith('/propose'))!.options!.body).toEqual({ what: 'all', prompt: 'a calm night', model: 'qwen3:8b', async: true });
    expect(piece.proposal).toMatchObject({ state: 'waiting', what: 'all', model: 'qwen3:8b' });
  });

  it('follows the proposal of a piece until it is done, saying who wrote each part and why', async () => {
    const { api, port } = setup([serverDetail({ proposal: { state: 'waiting', what: 'all', started_at: '2026-11-09T10:00:00Z' } })]);
    const states = ['waiting', 'writing', 'writing', 'done'] as const;
    let at = 0;
    api.onGet = () => {
      const state = states[Math.min(at++, states.length - 1)];
      return serverDetail({
        proposal: { state, what: 'all', started_at: '2026-11-09T10:00:00Z', model: 'qwen3:8b', ...(state === 'done' ? { finished_at: '2026-11-09T10:01:00Z', design_source: 'assistant', script_source: 'fallback', script_fallback_reason: 'the assistant failed. The fixed rule does not read the prompt.' } : {}) },
      });
    };
    const seen = await first(port.followProposal('api-mm-1').pipe(toArray()));
    expect(seen.map((p) => p.proposal?.state)).toEqual(['waiting', 'writing', 'done']);
    expect(seen.at(-1)!.proposal).toMatchObject({ design: { source: 'assistant' }, script: { source: 'fallback', reason: 'the assistant failed. The fixed rule does not read the prompt.' }, finishedAt: Date.parse('2026-11-09T10:01:00Z') });
  });

  it('does not follow a piece with no proposal: it answers once', async () => {
    const { port } = setup([serverDetail()]);
    expect(await first(port.followProposal('api-mm-1').pipe(toArray()))).toHaveLength(1);
  });

  describe('scenes, review and the pieces that carry them', () => {
    it('starts a batch with what the person chose and answers the batch', async () => {
      const { api, port } = setup([serverDetail()]);
      const batch = await first(port.writeScenes('api-mm-1', { scriptPieces: ['p1'], briefMode: 'literal', model: 'qwen3:8b', provider: 'p', review: { min: 7, attempts: 2 } }));
      expect(api.calls.at(-1)).toMatchObject({ method: 'post', path: '/api/music-motion/pieces/{id}/scenes', options: { path: { id: 'api-mm-1' }, body: { script_pieces: ['p1'], brief_mode: 'literal', model: 'qwen3:8b', provider: 'p', review: { min: 7, attempts: 2 } } } });
      expect(batch).toMatchObject({ state: 'writing', done: 0, total: 2, briefMode: 'metaphor' });
      expect(batch.drafts.map((d) => [d.scriptPiece, d.state])).toEqual([['p1', 'pending'], ['p2', 'pending']]);
    });

    it('sends an empty body for every piece, and says why when the server refuses', async () => {
      const { api, port } = setup([serverDetail()]);
      await first(port.writeScenes('api-mm-1'));
      expect(api.calls.at(-1)!.options!.body).toEqual({});
      api.fail = new ApiError(409, 'conflict', 'piece is writing a batch of scenes');
      const f = await failure(port.writeScenes('api-mm-1'));
      expect(f.kind).toBe('busy');
    });

    it('follows the batch as the piece shows it, until it is over', async () => {
      const { api, port } = setup([serverDetail()]);
      let reads = 0;
      api.onGet = () => {
        reads += 1;
        return serverDetail({ scenes: { state: reads < 3 ? 'writing' : 'done', done: Math.min(reads, 2), total: 2, brief_mode: 'metaphor', started_at: '2026-11-13T10:00:00Z', drafts: [{ script_piece: 'p1', state: 'ready', draft_id: 'd1' }, { script_piece: 'p2', state: reads < 3 ? 'writing' : 'ready', draft_id: 'd2' }] } });
      };
      const seen = await first(port.followScenes('api-mm-1').pipe(toArray()));
      expect(seen.at(-1)).toMatchObject({ state: 'done', done: 2 });
      expect(seen.length).toBeGreaterThan(1);
    });

    it('stops the batch with DELETE', async () => {
      const { api, port } = setup([serverDetail()]);
      await first(port.cancelScenes('api-mm-1'));
      expect(api.calls.at(-1)).toMatchObject({ method: 'delete', path: '/api/music-motion/pieces/{id}/scenes', options: { path: { id: 'api-mm-1' } } });
    });

    it('approves the batch and answers what became of each scene with the script the server saved', async () => {
      const { api, port } = setup([serverDetail()]);
      const answer = await first(port.approveScenes('api-mm-1'));
      expect(answer.approved).toEqual([{ scriptPiece: 'p1', part: 'scene-x-1', draftId: 'd1' }]);
      expect(answer.notApproved).toEqual([{ scriptPiece: 'p2', draftId: 'd2', state: 'failed', error: 'no' }]);
      expect(answer.script.pieces[0].part).toBe('scene-x-1');
      expect(api.count('get', '/api/music-motion/pieces/{id}')).toBeGreaterThan(0);
    });

    it('starts the review of the piece and follows it until it is done', async () => {
      const { api, port } = setup([serverDetail()]);
      expect((await first(port.reviewPiece('api-mm-1'))).state).toBe('running');
      let reads = 0;
      api.onGet = () => serverDetail({ review: { state: ++reads < 3 ? 'running' : 'done', started_at: '2026-11-13T10:00:00Z', scenes: reads < 3 ? [] : [{ script_piece: 'p1', score: 8, verdict: 'pass', notes: [] }], ...(reads < 3 ? {} : { overall: { score: 7, notes: ['ok'], repeated: [['p1', 'p2']] } }) } });
      const seen = await first(port.followReview('api-mm-1').pipe(toArray()));
      expect(seen.at(-1)).toMatchObject({ state: 'done', scenes: [{ scriptPiece: 'p1', score: 8, verdict: 'pass' }], overall: { score: 7, repeated: [['p1', 'p2']] } });
    });

    it('reads the catalog again with the piece, adding its scene parts for that read only', async () => {
      const { port } = setup();
      expect((await first(port.catalog('api-mm-1'))).parts.find((p) => p.name === 'scene-x-1')).toMatchObject({ verse: 'own', scene: { piece: 'api-mm-1', scriptPiece: 'p1' } });
      expect((await first(port.catalog())).parts.some((p) => p.name === 'scene-x-1')).toBe(false);
    });

    it('asks for a scene without a request, and refuses it with a picture or past the brief limit before the server', async () => {
      const { api, port } = setup();
      await first(port.askDraft({ request: '', scene: { piece: 'api-mm-1', scriptPiece: 'p1', brief: 'a door' }, review: true }));
      expect(api.calls.at(-1)!.options!.body).toEqual({ scene: { piece: 'api-mm-1', script_piece: 'p1', brief: 'a door' }, review: true });
      const before = api.calls.length;
      expect((await failure(port.askDraft({ request: '', scene: { piece: 'a', scriptPiece: 'p', brief: 'x'.repeat(501) } }))).kind).toBe('refused');
      expect((await failure(port.askDraft({ request: '', frame: 'f', referenceId: 'r', scene: { piece: 'a', scriptPiece: 'p' } }))).kind).toBe('refused');
      expect(api.calls.length).toBe(before);
    });
  });

  it('lists the installed models, and fails like any call when there is no assistant', async () => {
    const { api, port } = setup();
    expect(await first(port.assistModels())).toEqual({ default: 'qwen3:8b', models: [{ name: 'qwen3:8b', sizeBytes: 5200000000, fits: true }, { name: 'gemma4:26b', sizeBytes: 17000000000, fits: false }] });
    api.models = undefined;
    expect((await failure(port.assistModels())).kind).toBe('unavailable');
  });

  it('writes an SVG through the typed client with the text and the model, and answers the document', async () => {
    const { api, port } = setup();
    expect(await first(port.writeSvg({ text: '  a circle  ', model: 'qwen3:8b' }))).toBe('<svg viewBox="0 0 1 1"/>');
    expect(api.calls.at(-1)).toMatchObject({ method: 'post', path: '/api/assist/svg', options: { body: { text: 'a circle', model: 'qwen3:8b' } } });
    await first(port.writeSvg({ text: 'a circle' }));
    expect(api.calls.at(-1)!.options!.body).toEqual({ text: 'a circle' });
  });

  it('does not call the server for an empty text or one over 2000 characters', async () => {
    const { api, port } = setup();
    const before = api.calls.length;
    expect((await failure(port.writeSvg({ text: '  ' }))).kind).toBe('refused');
    expect((await failure(port.writeSvg({ text: 'x'.repeat(2001) }))).reason).toMatch(/2000/);
    expect(api.calls.length).toBe(before);
  });

  it('maps what the server refuses: 400 and 422 refused, 409 busy, 503 unavailable, with its words', async () => {
    const { api, port } = setup();
    for (const [status, code, kind] of [[400, 'invalid_request', 'refused'], [422, 'validation_failed', 'refused'], [422, 'assist_refused', 'refused'], [409, 'conflict', 'busy'], [503, 'unavailable', 'unavailable']] as const) {
      api.svg = new ApiError(status, code, `words of ${status}`);
      const f = await failure(port.writeSvg({ text: 'a circle' }));
      expect([f.kind, f.reason]).toEqual([kind, `words of ${status}`]);
    }
  });

  it('starts a render and answers the forecast', async () => {
    const { port } = setup([serverDetail()]);
    expect(await first(port.render('api-mm-1'))).toEqual({ seconds: 12, frames: 300 });
  });

  it('removes a piece from the server and from the list', async () => {
    const { api, port } = setup([serverDetail()]);
    await first(port.pieces());
    await until(() => api.count('get', '/api/music-motion/pieces') > 0);
    await first(port.remove('api-mm-1'));
    expect(api.store).toEqual([]);
    expect(await first(port.pieces())).toEqual([]);
  });

  it('refreshes the list by itself while a piece is unfinished and leaves it alone after', async () => {
    const { api, port } = setup([serverPiece({ state: 'running', progress: 10 })]);
    const seen: string[] = [];
    const sub = port.pieces().subscribe((l) => seen.push(l[0]?.state ?? 'none'));
    await until(() => seen.includes('running'));
    api.store = [serverPiece({ state: 'done', progress: 100, video: '/v.mp4' })];
    await until(() => seen.includes('done'));
    const reads = api.count('get', '/api/music-motion/pieces');
    await new Promise((r) => setTimeout(r, 40));
    expect(api.count('get', '/api/music-motion/pieces')).toBe(reads);
    sub.unsubscribe();
  });

  it('follows a piece until it is done, one emission per change, then stops', async () => {
    const { api, port } = setup([serverPiece({ state: 'queued' })]);
    const steps = [serverPiece({ state: 'queued' }), serverPiece({ state: 'running', progress: 30 }), serverPiece({ state: 'running', progress: 30 }), serverPiece({ state: 'done', progress: 100, video: '/v.mp4' })];
    let i = 0;
    api.onGet = () => steps[Math.min(i++, steps.length - 1)];
    const seen = await first(port.follow('api-mm-1').pipe(toArray()));
    expect(seen.map((p) => `${p.state}:${p.progress}`)).toEqual(['queued:0', 'running:30', 'done:100']);
    expect(seen.at(-1)!.video).toBe('http://server/v.mp4');
  });

  it('ends following without a word when the piece is removed meanwhile, and fails on other errors', async () => {
    const { api, port } = setup();
    expect(await first(port.follow('gone').pipe(toArray()))).toEqual([]);
    api.onGet = () => {
      throw new ApiError(500, 'unknown', 'boom');
    };
    expect((await failure(port.follow('x'))).kind).toBe('other');
  });

  it('hears the words: asks the route, answers the piece with its warning and keeps the list up to date', async () => {
    const { api, port } = setup([serverDetail()]);
    const piece = await first(port.transcribe('api-mm-1'));
    expect(api.count('post', '/api/music-motion/pieces/{id}/transcribe')).toBe(1);
    expect(piece.songMap.wordsEstimated).toBe(false);
    expect(piece.scriptWarning).toBe('2 pieces');
  });

  it('turns a refused hearing into the failure the screen can say: busy, unavailable, missing, other', async () => {
    for (const [status, kind] of [[409, 'busy'], [503, 'unavailable'], [404, 'missing'], [502, 'other']] as const) {
      const { api, port } = setup([serverDetail()]);
      api.fail = new ApiError(status, 'unknown', 'the reason');
      const f = await failure(port.transcribe('api-mm-1'));
      expect([f.kind, f.reason]).toEqual([kind, 'the reason']);
    }
  });

  it('saves a script with extra parts, a design of a piece and a field it does not know just as it has it', async () => {
    const { api, port } = setup([serverDetail()]);
    const script = { version: 1, pieces: [{ id: 'p1', start: 0, end: 20, part: 'toggle', with: [{ part: 'counter', params: { to: 5 } }], design: { accent: '#00ff00', verse_style: 'glow' }, future: true }] } as never;
    await first(port.saveScript('api-mm-1', script));
    const sent = api.calls.find((c) => c.method === 'put' && c.path.endsWith('/script'))!.options!.body;
    expect(sent).toEqual(script);
  });

  describe('the first thing a list says', () => {
    it('is the list as the server has it, not the empty one before it answers, for the pieces, the references and the drafts', async () => {
      const { api, port } = setup([serverPiece()]);
      api.delayMs = 20;
      api.refs = [serverReference()];
      api.drafts = [serverDraft({ id: 'd-1' })];
      expect((await first(port.pieces())).map((p) => p.id)).toEqual(['api-mm-1']);
      expect((await first(port.references())).map((r) => r.id)).toEqual(['ref-1']);
      expect((await first(port.drafts())).map((d) => d.id)).toEqual(['d-1']);
    });

    it('is shared when two ask at once: one read of the server, the same list for both', async () => {
      const { api, port } = setup([serverPiece()]);
      api.delayMs = 20;
      const both = await Promise.all([first(port.pieces()), first(port.pieces())]);
      expect(both.map((l) => l.length)).toEqual([1, 1]);
      expect(api.count('get', '/api/music-motion/pieces')).toBe(1);
    });

    it('is an empty list, and not a hang, when the server cannot answer', async () => {
      const { api, port } = setup([serverPiece()]);
      api.get = (() => throwError(() => new ApiError(503, 'unavailable', 'down'))) as unknown as AnimationApi['get'];
      expect(await first(port.pieces())).toEqual([]);
    });
  });

  describe('references', () => {
    it('lists them with the key frames as addresses of the server', async () => {
      const { api, port } = setup();
      api.refs = [serverReference()];
      const list = await first(port.references());
      expect(list.map((r) => r.id)).toEqual(['ref-1']);
      expect(list[0].analysis!.frames[0]).toBe('http://server/api/music-motion/references/ref-1/frames/01.jpg');
    });

    it('adds one by address as JSON and by file as a form, and the new one is in the list as analysing', async () => {
      const { api, port } = setup();
      const byAddress = await first(port.addReference({ url: 'https://youtu.be/x', title: 'T', tags: ['a'] }));
      expect(byAddress.state).toBe('analysing');
      expect(api.calls.find((c) => c.method === 'post' && c.path === '/api/music-motion/references')!.options!.body).toEqual({ url: 'https://youtu.be/x', title: 'T', tags: ['a'] });
      await first(port.addReference({ file: new File(['x'], 'v.mp4', { type: 'video/mp4' }) }));
      expect(api.count('postForm', '/api/music-motion/references')).toBe(1);
      expect((await first(port.references())).length).toBe(2);
    });

    it('does not call the server with nothing to add, and says what is wrong', async () => {
      const { api, port } = setup();
      const f = await failure(port.addReference({}));
      expect(f.kind).toBe('refused');
      expect(api.calls.filter((c) => c.path === '/api/music-motion/references' && c.method !== 'get')).toHaveLength(0);
    });

    it('reads the list again while one is analysing, and leaves it alone once none is', async () => {
      const { api, port } = setup();
      api.refs = [serverReference({ state: 'analysing', analysis: undefined })];
      const seen: string[] = [];
      const sub = port.references().subscribe((l) => seen.push(l.map((r) => r.state).join()));
      await until(() => api.count('get', '/api/music-motion/references') >= 2);
      api.refs = [serverReference()];
      await until(() => seen.at(-1) === 'ready');
      const reads = api.count('get', '/api/music-motion/references');
      await new Promise((r) => setTimeout(r, 40));
      expect(api.count('get', '/api/music-motion/references')).toBe(reads);
      sub.unsubscribe();
    });

    it('edits, reads and removes one', async () => {
      const { api, port } = setup();
      api.refs = [serverReference()];
      expect((await first(port.editReference('ref-1', { title: 'New' }))).title).toBe('New');
      expect(api.calls.find((c) => c.method === 'patch')!.options!.body).toEqual({ title: 'New' });
      expect((await first(port.reference('ref-1'))).id).toBe('ref-1');
      await first(port.removeReference('ref-1'));
      expect(api.count('delete', '/api/music-motion/references/{id}')).toBe(1);
      expect((await failure(port.reference('ref-1'))).kind).toBe('missing');
    });

    it('makes a draft from a text with no assistant: it comes back with its text and joins the list', async () => {
      const { api, port } = setup();
      await first(port.drafts());
      const made = await first(port.createDraftFromText({ manifest: '{"name":"bars"}', fragment: '<div></div>' }));
      expect(made).toMatchObject({ state: 'ready', name: 'bars', manifest: '{"name":"bars"}', fragment: '<div></div>' });
      expect(api.calls.find((c) => c.method === 'post' && c.path === '/api/music-motion/part-drafts')!.options!.body).toEqual({ manifest: '{"name":"bars"}', fragment: '<div></div>' });
      expect((await first(port.drafts())).map((d) => d.id)).toContain(made.id);
    });

    it('asks for a change with the base text: the instruction and the two texts go together, and the draft says which part it replaces', async () => {
      const { api, port } = setup();
      const made = await first(port.askDraft({ request: 'make it blue', base: { manifest: '{"name":"bars"}', fragment: '<div></div>' } }));
      expect(api.calls.find((c) => c.method === 'post' && c.path === '/api/music-motion/part-drafts')!.options!.body).toEqual({ request: 'make it blue', manifest: '{"name":"bars"}', fragment: '<div></div>' });
      expect(made.state).toBe('writing');
      expect((await failure(port.askDraft({ request: 'x', base: { manifest: 'm', fragment: 'f' }, frame: '01.jpg', referenceId: 'r' }))).kind).toBe('refused');
    });

    it('replaces an approved part: the catalog the adapter keeps has the part the server answered', async () => {
      const { api, port } = setup();
      api.catalogNow = { ...serverCatalog, parts: [...serverCatalog.parts, { name: 'bars', description: 'Bars', levels: ['simple'], cost_ms: 60, source: 'user', params: [] }] } as typeof serverCatalog;
      await first(port.catalog());
      const part = await first(port.replacePart('bars', { manifest: 'm', fragment: 'f' }));
      expect(part.description).toBe('Better bars');
      expect(api.calls.at(-1)).toMatchObject({ method: 'put', path: '/api/music-motion/parts/{name}', options: { path: { name: 'bars' }, body: { manifest: 'm', fragment: 'f' } } });
      expect((await first(port.catalog())).parts.find((p) => p.name === 'bars')!.description).toBe('Better bars');
      expect(api.count('get', '/api/music-motion/catalog')).toBe(1);
    });

    it('deletes an approved part, with force only when asked, and the catalog it keeps loses it', async () => {
      const { api, port } = setup();
      api.catalogNow = { ...serverCatalog, parts: [...serverCatalog.parts, { name: 'bars', description: 'Bars', levels: ['simple'], cost_ms: 60, source: 'user', params: [] }] } as typeof serverCatalog;
      await first(port.catalog());
      await first(port.removePart('bars'));
      expect(api.calls.at(-1)).toEqual({ method: 'delete', path: '/api/music-motion/parts/{name}', options: { path: { name: 'bars' } } });
      expect((await first(port.catalog())).parts.map((p) => p.name)).not.toContain('bars');
      await first(port.removePart('bars', true));
      expect(api.calls.at(-1)!.options).toEqual({ path: { name: 'bars' }, query: { force: true } });
    });

    it('turns the refusals of a part text and of a part into failures: 409 busy with the reason (what uses it), 422 with the problems, 503, 404', async () => {
      for (const [status, kind] of [[409, 'busy'], [503, 'unavailable'], [422, 'refused'], [404, 'missing']] as const) {
        const { api, port } = setup();
        api.fail = new ApiError(status, 'unknown', 'the reason');
        for (const call of [port.createDraftFromText({ manifest: 'm', fragment: 'f' }), port.replacePart('bars', { manifest: 'm', fragment: 'f' }), port.removePart('bars')]) {
          const f = await failure(call);
          expect([f.kind, f.reason]).toEqual([kind, 'the reason']);
        }
      }
    });

    it('turns the refusals into failures: 422 with its reason, 503 without yt-dlp, 404', async () => {
      for (const [status, kind] of [[422, 'refused'], [503, 'unavailable'], [404, 'missing']] as const) {
        const { api, port } = setup();
        api.fail = new ApiError(status, 'unknown', 'the reason');
        const f = await failure(port.addReference({ url: 'https://youtu.be/x' }));
        expect([f.kind, f.reason]).toEqual([kind, 'the reason']);
      }
    });
  });

  describe('learning', () => {
    it('asks the server to learn from a reference with the strictness, and gives the learning it answers', async () => {
      const { api, port } = setup();
      const started = await first(port.learn('ref-1', 'high'));
      expect(started).toMatchObject({ referenceId: 'ref-1', state: 'running', strictness: 'high', styles: [], partDrafts: [] });
      const call = api.calls.find((c) => c.method === 'post' && c.path === '/api/music-motion/references/{id}/learn')!;
      expect(call.options).toMatchObject({ path: { id: 'ref-1' }, body: { strictness: 'high' } });
      await first(port.learn('ref-1'));
      expect('body' in api.calls.filter((c) => c.path === '/api/music-motion/references/{id}/learn')[1].options!).toBe(false);
    });

    it('reads a learning with everything the server says, in camel case', async () => {
      const { api, port } = setup();
      api.learnings = [serverLearning()];
      const l = await first(port.learning('learn-1'));
      expect(l).toMatchObject({ id: 'learn-1', referenceId: 'ref-1', state: 'ready', strictness: 'normal' });
      expect(l.createdAt).toBe(Date.parse('2026-11-10T10:00:00Z'));
      expect(l.finishedAt).toBe(Date.parse('2026-11-10T10:01:00Z'));
      expect(l.styles[0]).toMatchObject({ id: 'preset-2', name: 'Neon terminal', novel: true, state: 'ready', similarTo: { kind: 'style', id: 'preset-1', name: 'Warm pop', distance: 0.62 } });
      expect(l.partDrafts.map((d) => [d.name, d.state])).toEqual([['scanlines', 'writing'], ['old idea', 'gone']]);
      expect(l.discarded[0]).toMatchObject({ kind: 'part', name: 'counter again', idea: 'a counter', similarTo: { name: 'counter', distance: 0.1 }, reason: 'too similar to the part "counter"' });
      expect(l.skipped).toEqual([{ what: 'part scanlines', reason: 'the vision model is not installed' }]);
    });

    it('lists the learnings, of one reference when it is given', async () => {
      const { api, port } = setup();
      api.learnings = [serverLearning(), serverLearning({ id: 'learn-2', reference_id: 'ref-2' })];
      expect((await first(port.learnings())).map((l) => l.id)).toEqual(['learn-1', 'learn-2']);
      expect((await first(port.learnings('ref-2'))).map((l) => l.id)).toEqual(['learn-2']);
      expect(api.calls.filter((c) => c.path === '/api/music-motion/learnings').pop()!.options).toMatchObject({ query: { reference_id: 'ref-2' } });
    });

    it('turns the server\'s refusals into failures: a missing learning, a reference that is not ready, a bad strictness', async () => {
      const { api, port } = setup();
      expect((await failure(port.learning('nope'))).kind).toBe('missing');
      api.fail = new ApiError(409, 'conflict', 'reference "ref-1" is not ready');
      expect(await failure(port.learn('ref-1'))).toMatchObject({ kind: 'busy', reason: 'reference "ref-1" is not ready' });
      api.fail = new ApiError(422, 'validation_failed', 'strictness must be low, normal or high');
      expect((await failure(port.learn('ref-1', 'extreme' as never))).kind).toBe('refused');
    });
  });

  describe('presets', () => {
    it('lists, reads, makes one from a reference, saves and removes', async () => {
      const { api, port } = setup();
      api.presets = [serverPreset()];
      expect((await first(port.presets())).map((p) => p.name)).toEqual(['Warm pop']);
      expect((await first(port.preset('preset-1'))).rhythm).toBe(6);
      const made = await first(port.makePreset('ref-1', ' Mine '));
      expect(made.referenceId).toBe('ref-1');
      expect(api.calls.find((c) => c.method === 'post' && c.path === '/api/music-motion/presets')!.options!.body).toEqual({ reference_id: 'ref-1', name: 'Mine' });
      const saved = await first(port.savePreset('preset-1', { name: 'X', design: made.design, rhythm: 4, parts: ['toggle'] }));
      expect(saved.rhythm).toBe(4);
      expect(api.calls.find((c) => c.method === 'put' && c.path === '/api/music-motion/presets/{id}')!.options!.body).toMatchObject({ name: 'X', rhythm: 4, parts: ['toggle'] });
      await first(port.removePreset('preset-1'));
      expect(api.count('delete', '/api/music-motion/presets/{id}')).toBe(1);
    });

    it('shows the server\'s reason, which names the field, when it refuses a preset', async () => {
      const { api, port } = setup();
      api.fail = new ApiError(422, 'unknown', 'rhythm 1 is not between 2 and 15 seconds');
      const f = await failure(port.savePreset('preset-1', { name: 'X', design: toDetail(serverDetail()).design.design, rhythm: 1, parts: [] }));
      expect(f).toMatchObject({ kind: 'refused', reason: 'rhythm 1 is not between 2 and 15 seconds' });
    });

    it('makes a piece with a preset when one is chosen', async () => {
      const { api, port } = setup();
      await first(port.create(SONG, { ...defaultChoices(), presetId: 'preset-1' }));
      expect((api.calls.find((c) => c.method === 'post' && c.path === '/api/music-motion/pieces')!.options!.body as { preset?: string }).preset).toBe('preset-1');
    });
  });

  describe('part drafts', () => {
    it('lists them with the preview frames as addresses of the server, and reads one with its text', async () => {
      const { api, port } = setup();
      api.drafts = [serverDraft()];
      const list = await first(port.drafts());
      expect(list.map((d) => d.id)).toEqual(['draft-1']);
      expect('manifest' in list[0]).toBe(false);
      expect(list[0].preview[0]).toBe('http://server/api/music-motion/part-drafts/draft-1/preview/01.png');
      expect((await first(port.draft('draft-1'))).manifest).toBe('{"name":"ticking-clock"}');
    });

    it('asks with a frame of a reference as JSON, with a file as a form and with no picture, and the draft is in the list writing', async () => {
      const { api, port } = setup();
      const byFrame = await first(port.askDraft({ request: 'a clock', referenceId: 'ref-1', frame: '03.jpg' }));
      expect(byFrame.state).toBe('writing');
      expect(api.calls.find((c) => c.method === 'post' && c.path === '/api/music-motion/part-drafts')!.options!.body).toEqual({ request: 'a clock', reference_id: 'ref-1', frame: '03.jpg' });
      await first(port.askDraft({ request: 'a clock', file: new File(['x'], 'p.png', { type: 'image/png' }) }));
      expect(api.count('postForm', '/api/music-motion/part-drafts')).toBe(1);
      await first(port.askDraft({ request: 'only words' }));
      expect(api.calls.filter((c) => c.method === 'post' && c.path === '/api/music-motion/part-drafts').at(-1)!.options!.body).toEqual({ request: 'only words' });
      expect((await first(port.drafts())).length).toBe(3);
    });

    it('sends the provider that writes the part, in the JSON body or in the form, and reads it back from the draft; without one it sends none', async () => {
      const { api, port } = setup();
      await first(port.askDraft({ request: 'a clock', provider: 'router', model: 'gpt' }));
      expect(api.calls.filter((c) => c.method === 'post' && c.path === '/api/music-motion/part-drafts').at(-1)!.options!.body).toEqual({ request: 'a clock', model: 'gpt', provider: 'router' });
      await first(port.askDraft({ request: 'a clock', file: new File(['x'], 'p.png', { type: 'image/png' }), provider: 'router' }));
      const form = api.calls.filter((c) => c.method === 'postForm' && c.path === '/api/music-motion/part-drafts').at(-1)!.options!.body as unknown as FormData;
      expect(form.get('provider')).toBe('router');
      await first(port.askDraft({ request: 'plain' }));
      expect('provider' in (api.calls.filter((c) => c.method === 'post' && c.path === '/api/music-motion/part-drafts').at(-1)!.options!.body as object)).toBe(false);
      expect(toDraft({ ...serverDraft(), provider: 'router' }).provider).toBe('router');
      expect('provider' in toDraft(serverDraft())).toBe(false);
    });

    it('sends the model that writes the part in the JSON body or in the form, and reads it back from the draft', async () => {
      const { api, port } = setup();
      await first(port.askDraft({ request: 'a clock', model: 'gemma4:26b' }));
      expect(api.calls.filter((c) => c.method === 'post' && c.path === '/api/music-motion/part-drafts').at(-1)!.options!.body).toEqual({ request: 'a clock', model: 'gemma4:26b' });
      await first(port.askDraft({ request: 'a clock', file: new File(['x'], 'p.png', { type: 'image/png' }), model: 'gemma4:26b' }));
      const form = api.calls.filter((c) => c.method === 'postForm' && c.path === '/api/music-motion/part-drafts').at(-1)!.options!.body as unknown as FormData;
      expect(form.get('model')).toBe('gemma4:26b');
      expect(form.get('request')).toBe('a clock');
      expect(toDraft({ ...serverDraft(), model: 'gemma4:26b' }).model).toBe('gemma4:26b');
      expect('model' in toDraft(serverDraft())).toBe(false);
    });

    it('does not call the server with a phrase that is empty or too long, and says what is wrong', async () => {
      const { api, port } = setup();
      expect((await failure(port.askDraft({ request: '  ' }))).kind).toBe('refused');
      expect((await failure(port.askDraft({ request: 'a'.repeat(501) }))).kind).toBe('refused');
      expect(api.calls.filter((c) => c.path === '/api/music-motion/part-drafts' && c.method !== 'get')).toHaveLength(0);
    });

    it('reads the list again while one is being written, and leaves it alone once none is', async () => {
      const { api, port } = setup();
      api.drafts = [serverDraft({ state: 'writing', name: undefined, preview: [] })];
      const seen: string[] = [];
      const sub = port.drafts().subscribe((l) => seen.push(l.map((d) => d.state).join()));
      await until(() => api.count('get', '/api/music-motion/part-drafts') >= 2);
      api.drafts = [serverDraft()];
      await until(() => seen.at(-1) === 'ready');
      const reads = api.count('get', '/api/music-motion/part-drafts');
      await new Promise((r) => setTimeout(r, 40));
      expect(api.count('get', '/api/music-motion/part-drafts')).toBe(reads);
      sub.unsubscribe();
    });

    it('saves the text, retries, and removes', async () => {
      const { api, port } = setup();
      api.drafts = [serverDraft()];
      const saved = await first(port.saveDraft('draft-1', { manifest: 'm', fragment: 'f' }));
      expect(saved).toMatchObject({ manifest: 'm', fragment: 'f' });
      expect(api.calls.find((c) => c.method === 'put' && c.path === '/api/music-motion/part-drafts/{id}')!.options!.body).toEqual({ manifest: 'm', fragment: 'f' });
      expect((await first(port.retryDraft('draft-1'))).state).toBe('writing');
      await first(port.removeDraft('draft-1'));
      expect(api.count('delete', '/api/music-motion/part-drafts/{id}')).toBe(1);
      expect((await failure(port.draft('draft-1'))).kind).toBe('missing');
    });

    it('approves a draft: the part comes back, the draft leaves the list and every catalog read after that has the part', async () => {
      const { api, port } = setup();
      api.drafts = [serverDraft()];
      await first(port.drafts());
      expect((await first(port.catalog())).parts.map((p) => p.name)).not.toContain('ticking-clock');
      const part = await first(port.approveDraft('draft-1'));
      expect(part.name).toBe('ticking-clock');
      expect(await first(port.drafts())).toEqual([]);
      expect((await first(port.catalog())).parts.map((p) => p.name)).toContain('ticking-clock');
      expect(api.count('get', '/api/music-motion/catalog')).toBe(1);
    });

    it('reads the text of a part of the user\'s, and a built-in or unknown one is missing', async () => {
      const { api, port } = setup();
      api.userParts['ticking-clock'] = { manifest: { name: 'ticking-clock', version: 1 }, fragment: '<div></div>' };
      expect(await first(port.partText('ticking-clock'))).toEqual({ name: 'ticking-clock', manifest: '{"name":"ticking-clock","version":1}', fragment: '<div></div>' });
      expect(api.calls.at(-1)).toMatchObject({ method: 'get', path: '/api/music-motion/parts/{name}', options: { path: { name: 'ticking-clock' } } });
      expect((await failure(port.partText('toggle'))).kind).toBe('missing');
    });

    it('turns the refusals into failures: 409 busy, 503 unavailable, 422 with the problems, 404', async () => {
      for (const [status, kind] of [[409, 'busy'], [503, 'unavailable'], [422, 'refused'], [404, 'missing']] as const) {
        const { api, port } = setup();
        api.fail = new ApiError(status, 'unknown', 'the reason');
        for (const call of [port.askDraft({ request: 'a clock' }), port.saveDraft('draft-1', { manifest: 'm', fragment: 'f' }), port.retryDraft('draft-1'), port.approveDraft('draft-1')]) {
          const f = await failure(call);
          expect([f.kind, f.reason]).toEqual([kind, 'the reason']);
        }
      }
    });
  });
});

function defaultDesign() {
  return { dark: '#000000', light: '#ffffff', accent: '#ff0000', display: 'Inter', body: 'Inter', defaultMode: 'dark' as const, modes: {}, concept: '' };
}
