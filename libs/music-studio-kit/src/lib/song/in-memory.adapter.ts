import { BehaviorSubject, Observable, defer, distinctUntilChanged, filter, map, of, takeWhile, throwError } from 'rxjs';

import { GENERATORS, GENERATOR_ORDER } from './generators';
import { DEFAULT_SECONDS } from './request';
import { isFinished, type ContainerStatus, type EngineId, type EngineStatus, type GeneratorName, type Heard, type Song, type SongRequest, type SongState, type TagVocabulary, type WriteRequest, type Written } from './model';
import type { ListenOptions, Recognizer } from './listen';
import { AssistFailed, EngineFailed, ListenFailed, SongRefused, type SongPort } from './port';
import { tagsInText } from './style';
import { isYoutubeUrl } from './youtube';
import { validateCustom } from './validate';
import { VOCABULARY_FIXTURE } from './vocabulary.fixture';

export interface InMemoryOptions {
  /** Milliseconds each step lasts (queued, running). 0 makes every step happen on the next tick. */
  pace?: number;
  /** The address every finished song gets: there is no real audio, only this placeholder. */
  audioUrl?: string;
  /** Makes every song fail with this reason. */
  fail?: string;
  /** What the generators report; the ones not named are available. */
  engines?: readonly EngineStatus[];
  /** What the assistant does: write (default), be missing, or refuse. */
  assistant?: 'ok' | 'unavailable' | 'refuses';
  /** What listening to a file does: describe it (default) or fail like the server does. */
  listening?: 'ok' | ListenFailed['kind'];
  /** Whether LAION-CLAP can be used (it is by default). */
  clap?: boolean;
  muq?: boolean;
  /** The vocabulary offered; the server's, copied, by default. */
  vocabulary?: TagVocabulary;
  /**
   * Where the history is kept so it outlives the page (`sessionStorage` in the application). Without one nothing is
   * kept. A storage that is full, blocked or holds something unreadable never breaks the adapter.
   */
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  storageKey?: string;
}

export class SongNotFound extends Error {
  constructor(id: string) {
    super(`there is no song ${id}`);
    this.name = 'SongNotFound';
  }
}

const INTERRUPTED = 'Interrupted: the page was reloaded';
const PHASES = ['queued', 'running', 'done', 'failed', 'cancelled'];

const isSaved = (s: Partial<Song> | null): s is Song =>
  !!s && typeof s.id === 'string' && /^song-\d+$/.test(s.id) && typeof s.title === 'string' && typeof s.style === 'string' && typeof s.lyrics === 'string' && typeof s.instrumental === 'boolean' && typeof s.createdAt === 'number' && PHASES.includes((s.state as SongState | undefined)?.phase ?? '');

/** A song cut short by the reload has no timer any more: it comes back failed, as it was when it stopped. */
const interrupted = (s: Song): Song => (isFinished(s) ? s : { ...s, state: { phase: 'failed', reason: INTERRUPTED } });

const words = (text: string): string[] => text.trim().split(/\s+/).filter(Boolean);

/**
 * A song port that makes no audio: it simulates a song (queued, running, done or failed) with timers, writes lyrics and
 * styles from a fixed recipe, keeps everything for the life of the page (or of the storage it is given) and sends nothing
 * anywhere. It exists to build and try the dashboard without a server, not to stand in for one.
 */
export class InMemorySongs implements SongPort {
  private readonly pace: number;
  private readonly audioUrl: string;
  private readonly options: InMemoryOptions;
  private readonly list: BehaviorSubject<readonly Song[]>;
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>[]>();
  private counter = 0;
  /** What was started or stopped here: a stopped one is up from then on, a stopped one is down until it is started. */
  private readonly overrides = new Map<string, 'running' | 'stopped'>();

  constructor(options: InMemoryOptions = {}) {
    this.options = options;
    this.pace = options.pace ?? 800;
    this.audioUrl = options.audioUrl ?? '';
    const saved = this.load();
    this.counter = saved.reduce((max, s) => Math.max(max, Number(s.id.slice(5))), 0);
    this.list = new BehaviorSubject<readonly Song[]>(saved);
    this.save();
  }

  engines(): Observable<readonly EngineStatus[]> {
    return defer(() => {
      const given = this.options.engines ?? [];
      return of(
        GENERATOR_ORDER.map((generator): EngineStatus => {
          if (this.isUp(generator)) return { generator, available: true };
          if (this.overrides.get(generator) === 'stopped') return { generator, available: false, reason: 'not_running' };
          return given.find((e) => e.generator === generator) ?? { generator, available: true };
        }),
      );
    });
  }

  start(engine: GeneratorName | EngineId): Observable<void> {
    return defer(() => {
      if (this.isStopped(engine)) this.overrides.set(engine, 'running');
      return of(undefined);
    });
  }

  stopEngine(engine: EngineId): Observable<void> {
    return defer(() => {
      // like the server, it does not stop a generator a song is being made with
      if (this.list.value.some((s) => s.generator === engine && !isFinished(s))) return throwError(() => new EngineFailed('busy'));
      this.overrides.set(engine, 'stopped');
      return of(undefined);
    });
  }

  containers(): Observable<readonly ContainerStatus[]> {
    return defer(() =>
      of(
        (['heartmula', 'diffrhythm2', 'clap'] as const).map((engine): ContainerStatus => {
          if (this.isUp(engine)) return { engine, available: true, container: 'running' };
          if (this.isStopped(engine)) return { engine, available: false, reason: 'not_running', container: 'stopped' };
          const given = this.options.engines?.find((e) => e.generator === engine);
          return given && !given.available ? { engine, available: false, ...(given.reason ? { reason: given.reason } : {}) } : { engine, available: true, container: 'running' };
        }),
      ),
    );
  }

  /** Its container is stopped (not broken): stopped here, or the options say `not_running` (or LAION-CLAP is off). */
  private isStopped(engine: string): boolean {
    if (this.isUp(engine)) return false;
    if (this.overrides.get(engine) === 'stopped') return true;
    if (engine === 'clap') return this.options.clap === false;
    return this.options.engines?.find((e) => e.generator === engine)?.reason === 'not_running';
  }

  vocabulary(): Observable<TagVocabulary> {
    return of(this.options.vocabulary ?? VOCABULARY_FIXTURE);
  }

  write(request: WriteRequest): Observable<Written> {
    return defer(() => {
      if (this.options.assistant === 'unavailable') return throwError(() => new AssistFailed('unavailable'));
      if (this.options.assistant === 'refuses') return throwError(() => new AssistFailed('refused', 'the model declined'));
      const text = request.text.trim();
      const title = words(text).slice(0, 4).join(' ').replace(/^./, (c) => c.toUpperCase());
      const lyrics = request.instrumental ? '' : `[verse]\n${text}\n\n[chorus]\n${text}`;
      return of({ title, lyrics, style: this.styleFor(text, request) });
    });
  }

  /** What the last import was asked with, so a test can see that the options reached the port. */
  lastListen?: { source: string; options: ListenOptions };

  recognizers(): Observable<readonly Recognizer[]> {
    const clap = this.isUp('clap') || (this.overrides.get('clap') !== 'stopped' && (this.options.clap ?? true));
    const muq = this.options.muq ?? true;
    return of<readonly Recognizer[]>([
      { id: 'whisper', available: true },
      clap ? { id: 'clap', available: true } : { id: 'clap', available: false, reason: 'not_running' },
      muq ? { id: 'muq', available: true } : { id: 'muq', available: false, reason: 'no_weights' },
    ]);
  }

  listen(file: File, options: ListenOptions): Observable<Heard> {
    return defer(() => {
      this.lastListen = { source: file.name, options };
      const failure = this.options.listening;
      if (failure && failure !== 'ok') return throwError(() => new ListenFailed(failure));
      return of<Heard>({ style: `Chill lo-fi with soft piano and female vocal, like ${file.name}`, bpm: 92, keyscale: 'D minor', theme: '', sound: ['warm', 'soft'], genreUnknown: false, noWords: false });
    });
  }

  listenUrl(url: string, _generator: GeneratorName, options: ListenOptions): Observable<Heard> {
    return defer(() => {
      this.lastListen = { source: url, options };
      if (!isYoutubeUrl(url)) return throwError(() => new ListenFailed('badUrl'));
      const failure = this.options.listening;
      if (failure && failure !== 'ok') return throwError(() => new ListenFailed(failure));
      return of<Heard>({ style: 'Chill lo-fi', tags: ['lo-fi', 'chill'], bpm: 88, keyscale: 'A minor', theme: '', sound: [], genreUnknown: false, noWords: true });
    });
  }

  generate(request: SongRequest): Observable<Song> {
    return defer(() => {
      const problems: ConstructorParameters<typeof SongRefused>[0] = [
        ...validateCustom(request),
        ...(this.available(request.generator) ? [] : (['generator.unavailable'] as const)),
      ];
      if (problems.length) return throwError(() => new SongRefused(problems));
      const song: Song = { id: `song-${++this.counter}`, title: request.title.trim(), style: request.style.trim(), lyrics: request.lyrics.trim(), instrumental: request.instrumental, generator: request.generator, createdAt: Date.now(), state: { phase: 'queued', position: 1 } };
      this.publish([song, ...this.list.value]);
      this.script(song.id);
      return of(song);
    });
  }

  songs(): Observable<readonly Song[]> {
    return this.list.asObservable();
  }

  follow(id: string): Observable<Song> {
    return this.list.pipe(
      map((songs) => songs.find((s) => s.id === id)),
      distinctUntilChanged(),
      takeWhile((s) => s !== undefined && !isFinished(s), true),
      filter((s): s is Song => s !== undefined),
    );
  }

  cancel(id: string): Observable<void> {
    return defer(() => {
      const song = this.find(id);
      if (!song) return throwError(() => new SongNotFound(id));
      if (!isFinished(song)) {
        this.stop(id);
        this.replace(id, { phase: 'cancelled' });
      }
      return of(undefined);
    });
  }

  remove(id: string): Observable<void> {
    return defer(() => {
      if (!this.find(id)) return throwError(() => new SongNotFound(id));
      this.stop(id);
      this.publish(this.list.value.filter((s) => s.id !== id));
      return of(undefined);
    });
  }

  private isUp(engine: string): boolean {
    return this.overrides.get(engine) === 'running';
  }

  private available(generator: SongRequest['generator']): boolean {
    if (this.overrides.get(generator) === 'stopped') return false;
    return this.isUp(generator) || (this.options.engines?.find((e) => e.generator === generator)?.available ?? true);
  }

  /** The style the assistant writes: a sentence for ACE-Step, else the tags of the vocabulary the text mentions. */
  private styleFor(text: string, request: WriteRequest): string {
    if (GENERATORS[request.generator].style === 'sentence') return text;
    const tags = tagsInText(text, this.options.vocabulary ?? VOCABULARY_FIXTURE);
    return (tags.length ? tags : ['pop']).join(', ');
  }

  private find(id: string): Song | undefined {
    return this.list.value.find((s) => s.id === id);
  }

  /** queued now, running after one step, done (or failed) after two. */
  private script(id: string): void {
    const run = setTimeout(() => this.replace(id, { phase: 'running' }), this.pace);
    const end = setTimeout(() => this.replace(id, this.options.fail ? { phase: 'failed', reason: this.options.fail } : { phase: 'done', url: this.audioUrl, seconds: DEFAULT_SECONDS }), this.pace * 2);
    this.timers.set(id, [run, end]);
  }

  private stop(id: string): void {
    for (const t of this.timers.get(id) ?? []) clearTimeout(t);
    this.timers.delete(id);
  }

  private replace(id: string, state: SongState): void {
    this.publish(this.list.value.map((s) => (s.id === id ? { ...s, state } : s)));
  }

  private publish(songs: readonly Song[]): void {
    this.list.next(songs);
    this.save();
  }

  private key(): string {
    return this.options.storageKey ?? 'music-studio.songs';
  }

  private load(): Song[] {
    try {
      const raw = this.options.storage?.getItem(this.key());
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as Partial<Song>[]).filter(isSaved).map(interrupted) : [];
    } catch {
      return [];
    }
  }

  private save(): void {
    try {
      this.options.storage?.setItem(this.key(), JSON.stringify(this.list.value));
    } catch {
      // a full or blocked storage only costs the history across a reload
    }
  }
}
