import { ApiError, type ApiClient } from '@lab/api-client';
import { dump } from 'js-yaml';
import { BehaviorSubject, Observable, catchError, defer, distinctUntilChanged, filter, firstValueFrom, from, map, of, switchMap, takeWhile, throwError } from 'rxjs';

import { STUDIO_CLIENT } from '../core/client';
import { GENERATOR_ORDER } from './generators';
import { isFinished, type ContainerStatus, type EngineId, type EngineStatus, type GeneratorName, type Heard, type Song, type SongRequest, type SongState, type TagVocabulary, type WriteRequest, type Written } from './model';
import { AssistFailed, EngineFailed, ListenFailed, SongRefused, type SongPort } from './port';
import { toListeningWav } from './listen-audio';
import type { ListenOptions, Recognizer } from './listen';
import { isYoutubeUrl } from './youtube';
import { parseTags } from './style';
import { DEFAULT_SECONDS, configOf } from './request';
import { validateCustom } from './validate';

/** What the adapter uses of the API client: the typed calls it makes, and the address of a file. */
export type SongsApi = Pick<ApiClient, 'get' | 'post' | 'put' | 'delete' | 'getBlobAt' | 'urlOf'>;

export interface ServerSongsOptions {
  /** Milliseconds between two reads of the server while a song is unfinished. */
  pollMs?: number;
  /** The names of ids and the clock, so tests can fix them. */
  now?: () => number;
  /** Cuts the piece of a file that is listened to (the browser decodes it); tests give theirs. */
  prepare?: (file: File) => Promise<Blob>;
  /** The name the dashboard gives itself to the server on every song it makes, and the one "My songs" filters by. */
  client?: string;
}

/** What a song's project says about it, read once. */
interface Detail {
  title: string;
  style: string;
  lyrics: string;
  instrumental: boolean;
  generator: GeneratorName;
}

const KNOWN: readonly GeneratorName[] = GENERATOR_ORDER;
const isGenerator = (value: unknown): value is GeneratorName => KNOWN.includes(value as GeneratorName);
/** The runs the history asks for: every run of this server, the dashboard keeps its own. */
const HISTORY_LIMIT = 200;

/**
 * A song port that makes the songs through the server: a project per song (one track, the generator in its defaults,
 * this dashboard's client name), a run for it, and the history read back from the runs of that client. The server owns
 * every state, so the adapter keeps only a copy of the list that it refreshes while anything is unfinished.
 */
export class ServerSongs implements SongPort {
  private readonly pollMs: number;
  private readonly now: () => number;
  private readonly prepare: (file: File) => Promise<Blob>;
  private readonly client: string;
  /** `null` until the history has been read once (or has failed to be): nothing is known before that, not even that there are no songs. */
  private readonly list = new BehaviorSubject<readonly Song[] | null>(null);
  /** The run of each song's project. */
  private readonly runs = new Map<string, string>();
  private readonly details = new Map<string, Detail>();
  private readonly finished = new Map<string, SongState>();
  private started = false;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly api: SongsApi,
    { pollMs = 1500, now = () => Date.now(), prepare = toListeningWav, client = STUDIO_CLIENT }: ServerSongsOptions = {},
  ) {
    this.pollMs = pollMs;
    this.now = now;
    this.prepare = prepare;
    this.client = client;
  }

  engines(): Observable<readonly EngineStatus[]> {
    return defer(() =>
      Promise.all([firstValueFrom(this.api.get('/api/music/engines')), firstValueFrom(this.api.get('/api/environment'))]).then(([engines, env]) => {
        const given = engines.engines ?? {};
        const acestep = (env.music ?? []).some((a) => /^acestep-v\d/i.test(a.name));
        return GENERATOR_ORDER.map((generator): EngineStatus => {
          if (generator === 'ace-step') return acestep ? { generator, available: true } : { generator, available: false, reason: 'no_weights' };
          const e = given[generator];
          if (!e) return { generator, available: false, reason: 'unreachable' };
          return { generator, available: e.available === true, ...(e.reason ? { reason: e.reason } : {}), ...(e.detail ? { detail: e.detail } : {}) };
        });
      }),
    );
  }

  start(engine: GeneratorName | EngineId): Observable<void> {
    // ACE-Step has no container of its own to start
    if (engine === 'ace-step') return of(undefined);
    return this.api.post('/api/music/engines/{engine}/start', { path: { engine } }).pipe(map(() => undefined), engineFailure);
  }

  stopEngine(engine: EngineId): Observable<void> {
    return this.api.post('/api/music/engines/{engine}/stop', { path: { engine } }).pipe(map(() => undefined), engineFailure);
  }

  containers(): Observable<readonly ContainerStatus[]> {
    return this.api.get('/api/music/engines').pipe(
      map((answer) => {
        const given = answer.engines ?? {};
        return CONTAINER_ENGINES.map((engine): ContainerStatus => {
          const e = given[engine];
          if (!e) return { engine, available: false, reason: 'unreachable' };
          return { engine, available: e.available === true, ...(e.reason ? { reason: e.reason } : {}), ...(e.detail ? { detail: e.detail } : {}), ...(e.container?.state ? { container: e.container.state } : {}) };
        });
      }),
    );
  }

  vocabulary(): Observable<TagVocabulary> {
    return this.api.get('/api/assist/music-tags').pipe(
      map((v) => ({
        categories: (v.categories ?? []).map((c) => ({ id: c.id ?? '', tags: c.tags ?? [] })).filter((c) => c.id),
        combos: (v.combos ?? []).map((c) => ({ id: c.id ?? '', name: c.name ?? c.id ?? '', tags: c.tags ?? [] })).filter((c) => c.id),
      })),
    );
  }

  write(request: WriteRequest): Observable<Written> {
    return this.api.post('/api/assist', { body: { task: 'music', text: request.text, generator: request.generator, instrumental: request.instrumental, ...(request.provider ? { provider: request.provider } : {}), ...(request.model ? { model: request.model } : {}) } }).pipe(
      map((a) => ({ title: '', lyrics: a.lyrics ?? '', style: (request.generator === 'ace-step' ? a.caption : (a.tags ?? a.caption)) ?? '' })),
      (source) => new Observable<Written>((subscriber) => source.subscribe({ next: (w) => subscriber.next(w), complete: () => subscriber.complete(), error: (e) => subscriber.error(assistFailure(e)) })),
    );
  }

  recognizers(): Observable<readonly Recognizer[]> {
    return this.api.get('/api/music/recognizers').pipe(
      map((r) => (r.recognizers ?? []).flatMap((x): Recognizer[] => (x.id ? [{ id: x.id, available: x.available === true, ...(x.reason ? { reason: x.reason } : {}), ...(x.detail ? { detail: x.detail } : {}) }] : []))),
    );
  }

  listen(file: File, options: ListenOptions): Observable<Heard> {
    return defer(() =>
      from(this.prepare(file).catch(() => Promise.reject(new ListenFailed('unreadable')))).pipe(
        switchMap((piece) =>
          // the typed client takes no binary body: the piece goes in with a cast, as the browser's recording does
          this.api.post('/api/assist/listen', { body: piece, query: { method: options.method, ...(options.language ? { language: options.language } : {}) } } as never) as Observable<{ style?: string; bpm?: number; keyscale?: string; theme?: string; sound?: string[]; heard?: string[]; genre_unknown?: boolean; no_words?: boolean }>,
        ),
        map((a): Heard => ({ style: a.style ?? '', ...(a.bpm ? { bpm: Math.round(a.bpm) } : {}), ...(a.keyscale ? { keyscale: a.keyscale } : {}), theme: a.theme ?? '', sound: a.sound ?? [], ...(a.heard?.length ? { tags: a.heard } : {}), genreUnknown: a.genre_unknown === true, noWords: a.no_words === true })),
        catchError((e) => throwError(() => listenFailure(e))),
      ),
    );
  }

  listenUrl(url: string, generator: GeneratorName, options: ListenOptions): Observable<Heard> {
    return defer(() => (isYoutubeUrl(url) ? from(this.fetchAndDescribe(url.trim(), generator, options)) : throwError(() => new ListenFailed('badUrl')))).pipe(catchError((e) => throwError(() => listenFailure(e))));
  }

  generate(request: SongRequest): Observable<Song> {
    return defer(() => {
      const problems = validateCustom(request);
      if (problems.length) return throwError(() => new SongRefused(problems));
      return from(this.make(request));
    });
  }

  songs(): Observable<readonly Song[]> {
    return defer(() => {
      if (!this.started) {
        this.started = true;
        void this.refresh();
      }
      return this.list.pipe(filter((l): l is readonly Song[] => l !== null));
    });
  }

  follow(id: string): Observable<Song> {
    return this.songs().pipe(
      map((songs) => songs.find((s) => s.id === id)),
      distinctUntilChanged(),
      takeWhile((s) => s !== undefined && !isFinished(s), true),
      filter((s): s is Song => s !== undefined),
    );
  }

  cancel(id: string): Observable<void> {
    return defer(() => from(this.stop(id)));
  }

  remove(id: string): Observable<void> {
    return defer(() =>
      from(
        (async () => {
          const song = this.current().find((s) => s.id === id);
          if (song && !isFinished(song)) await this.stop(id);
          await firstValueFrom(this.api.delete('/api/projects/{id}', { path: { id } }));
          this.runs.delete(id);
          this.details.delete(id);
          this.finished.delete(id);
          this.list.next(this.current().filter((s) => s.id !== id));
        })(),
      ),
    );
  }

  /**
   * A YouTube video, listened to the way `dashboard-full` extracts a song, shortened: a temporary project gets its audio, the
   * server measures it, reads its words (`whisper`) or hears its sound (`clap` or `muq`, when they can run), and the assistant
   * describes the style from that and from what the user said. The project is deleted whatever happens.
   */
  private async fetchAndDescribe(url: string, generator: GeneratorName, options: ListenOptions): Promise<Heard> {
    const id = `ms-tmp-${this.now().toString(36)}`;
    await firstValueFrom(this.api.post('/api/projects', { body: { id } }));
    try {
      const { name: source = '' } = await firstValueFrom(this.api.post('/api/projects/{id}/sources/from-url', { path: { id }, body: { url } }));
      // the tempo and the key are hints: without them the assistant still describes what it can
      const measure = await firstValueFrom(this.api.post('/api/projects/{id}/measure', { path: { id }, body: { source } })).catch(() => null);
      let words = '';
      let language = options.language;
      let sound: string[] = [];
      if (options.method === 'clap' || options.method === 'muq') {
        // what the sound is like is a hint too: the service (LAION-CLAP) or the executable (MuQ-MuLan) may not be there
        sound = await firstValueFrom(this.api.post('/api/projects/{id}/recognize', { path: { id }, body: { source, method: options.method } })).then((r) => r.tags ?? []).catch((): string[] => []);
      } else {
        // reading the words is what this method is: when it cannot, the import fails
        const heard = await firstValueFrom(this.api.post('/api/projects/{id}/transcribe', { path: { id }, body: { source, ...(options.language ? { language: options.language } : {}) } }));
        words = heard.text ?? '';
        language = language || heard.language || '';
      }
      const hint = [options.hint.trim(), sound.join(', ')].filter(Boolean).join('. ');
      const draft = await firstValueFrom(
        this.api.post('/api/assist', {
          body: { task: 'lyrics-from-transcript', text: words, generator, ...(language ? { language } : {}), ...(hint ? { hint } : {}), ...(measure?.bpm ? { bpm: measure.bpm } : {}), ...(measure?.keyscale ? { keyscale: measure.keyscale } : {}) },
        }),
      );
      const tags = parseTags(draft.tags ?? '');
      const style = (draft.caption ?? '').trim();
      return { style, tags, ...(measure?.bpm ? { bpm: Math.round(measure.bpm) } : {}), ...(measure?.keyscale ? { keyscale: measure.keyscale } : {}), theme: '', sound, genreUnknown: tags.length === 0 && style === '', noWords: words.trim() === '' };
    } finally {
      await firstValueFrom(this.api.delete('/api/projects/{id}', { path: { id } })).catch(() => undefined);
    }
  }

  /** Creates the project of the song, saves its configuration and starts the run. */
  private async make(request: SongRequest): Promise<Song> {
    const id = `ms-${this.now().toString(36)}`;
    try {
      await firstValueFrom(this.api.post('/api/projects', { body: { id } }));
      const starter = await firstValueFrom(this.api.get('/api/projects/{id}/config', { path: { id } }));
      const yaml = dump(configOf((starter.parsed ?? {}) as Record<string, unknown>, request, this.client), { lineWidth: -1, noRefs: true });
      await firstValueFrom(this.api.put('/api/projects/{id}/config', { path: { id }, body: { yaml } }));
      const started = await firstValueFrom(this.api.post('/api/projects/{id}/runs', { path: { id }, body: { mode: 'music' } }));
      this.runs.set(id, started.run?.id ?? '');
      this.details.set(id, { title: request.title.trim(), style: request.style.trim(), lyrics: request.lyrics.trim(), instrumental: request.instrumental, generator: request.generator });
      const song: Song = { id, ...this.details.get(id)!, createdAt: this.now(), state: { phase: 'queued', ...(started.queue_position ? { position: started.queue_position } : {}) } };
      this.list.next([song, ...this.current()]);
      this.schedule();
      return song;
    } catch (e) {
      throw refusal(e);
    }
  }

  private async stop(id: string): Promise<void> {
    const run = this.runs.get(id);
    if (!run) return;
    await firstValueFrom(this.api.post('/api/runs/{id}/cancel', { path: { id: run } }));
    await this.refresh();
  }

  /** Reads the history again: the runs of this dashboard's client, newest first, each with what its project says. */
  private async refresh(): Promise<void> {
    try {
      const runs = (await firstValueFrom(this.api.get('/api/runs', { query: { limit: HISTORY_LIMIT } }))).filter((r) => r.client === this.client);
      const songs = await Promise.all(runs.map((r) => this.toSong(r)));
      this.list.next(songs.filter((s): s is Song => s !== null).sort((a, b) => b.createdAt - a.createdAt));
    } catch {
      // the next read, or the list as it stands, will say; a history that cannot be read is an empty one, not a wait for ever
      if (this.list.value === null) this.list.next([]);
    }
    this.schedule();
  }

  private current(): readonly Song[] {
    return this.list.value ?? [];
  }

  private schedule(): void {
    clearTimeout(this.timer);
    if (this.current().some((s) => !isFinished(s))) this.timer = setTimeout(() => void this.refresh(), this.pollMs);
  }

  private async toSong(run: { id: string; project: string; state: string; created_at: string; error?: string; result_available?: boolean }): Promise<Song | null> {
    this.runs.set(run.project, run.id);
    const detail = await this.detail(run.project);
    if (!detail) return null;
    return { id: run.project, ...detail, createdAt: Date.parse(run.created_at) || 0, state: await this.stateOf(run) };
  }

  private async detail(id: string): Promise<Detail | null> {
    const known = this.details.get(id);
    if (known) return known;
    try {
      const config = await firstValueFrom(this.api.get('/api/projects/{id}/config', { path: { id } }));
      const parsed = (config.parsed ?? {}) as { tracks?: { title?: string; prompt?: string; tags?: string; lyrics?: string; instrumental?: boolean }[]; defaults?: { music?: { generator?: string } } };
      const track = parsed.tracks?.[0];
      const generator = parsed.defaults?.music?.generator;
      const detail: Detail = { title: track?.title ?? id, style: track?.tags ?? track?.prompt ?? '', lyrics: track?.lyrics ?? '', instrumental: track?.instrumental === true, generator: isGenerator(generator) ? generator : 'ace-step' };
      this.details.set(id, detail);
      return detail;
    } catch {
      return null;
    }
  }

  private async stateOf(run: { project: string; state: string; error?: string }): Promise<SongState> {
    switch (run.state) {
      case 'queued':
        return { phase: 'queued' };
      case 'running':
        return { phase: 'running' };
      case 'cancelled':
        return { phase: 'cancelled' };
      case 'succeeded':
        return (await this.result(run.project)) ?? { phase: 'failed', reason: 'The song is no longer there.' };
      default:
        return { phase: 'failed', reason: run.error?.trim() || (run.state === 'interrupted' ? 'Interrupted' : 'The run did not finish.') };
    }
  }

  /** The address and length of a finished song, from the manifest its run wrote. */
  private async result(id: string): Promise<SongState | null> {
    const known = this.finished.get(id);
    if (known) return known;
    try {
      const { body } = await firstValueFrom(this.api.getBlobAt(`/api/projects/${encodeURIComponent(id)}/artifacts/out/${encodeURIComponent(id)}/manifest.json`));
      const manifest = JSON.parse(await body.text()) as { tracks?: { file?: string; audio_seconds?: number; duration_seconds?: number }[] };
      const track = manifest.tracks?.[0];
      if (!track?.file) return null;
      const state: SongState = { phase: 'done', url: this.api.urlOf(`/api/projects/${encodeURIComponent(id)}/artifacts/${track.file.split('/').map(encodeURIComponent).join('/')}`), seconds: Math.round(track.audio_seconds ?? track.duration_seconds ?? DEFAULT_SECONDS) };
      this.finished.set(id, state);
      return state;
    } catch {
      return null;
    }
  }
}

/** The engines that have a container to start and stop, in the order they are shown. */
const CONTAINER_ENGINES: readonly EngineId[] = ['heartmula', 'diffrhythm2', 'clap'];

/** What failing to start or stop an engine means: 409 a run uses it, 422 it cannot run (the server's reason goes along); anything else is left as it came. */
function engineFailure(source: Observable<void>): Observable<void> {
  return new Observable<void>((subscriber) =>
    source.subscribe({
      next: (v) => subscriber.next(v),
      complete: () => subscriber.complete(),
      error: (e) => subscriber.error(e instanceof ApiError && e.status === 409 ? new EngineFailed('busy', e.reason, e.message) : e instanceof ApiError && e.status === 422 ? new EngineFailed('refused', e.reason, e.message) : e),
    }),
  );
}

/** What the assistant's failure means: 409 busy, 503 not there, a model's refusal; anything else is left as it came. */
function assistFailure(e: unknown): unknown {
  if (!(e instanceof ApiError)) return e;
  if (e.status === 409) return new AssistFailed('busy', e.message);
  if (e.status === 503) return new AssistFailed('unavailable', e.message);
  if (e.status === 422 || e.code === 'assist_refused') return new AssistFailed('refused', e.message);
  return e;
}

/** What a failure to ask for the song means: the server did not accept it (400, 409, 422) or something else went wrong. */
function refusal(e: unknown): unknown {
  return e instanceof ApiError && [400, 409, 422].includes(e.status) ? new SongRefused([], e.message) : e;
}

/** What listening failed for: 409 busy, 413 too long or too big, 422 not readable, 503 nothing there to listen, 504 too slow; anything else is left as it came. */
function listenFailure(e: unknown): unknown {
  if (e instanceof ListenFailed || !(e instanceof ApiError)) return e;
  const kinds: Record<number, ListenFailed['kind']> = { 400: 'badUrl', 409: 'busy', 413: 'tooLong', 422: 'unreadable', 503: 'unavailable', 504: 'timeout' };
  const kind = kinds[e.status];
  return kind ? new ListenFailed(kind) : e;
}
