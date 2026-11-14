import { ApiError, type ApiClient, type components } from '@lab/api-client';
import { BehaviorSubject, EMPTY, Observable, Subscription, catchError, defer, distinctUntilChanged, map, of, shareReplay, switchMap, takeWhile, tap, throwError, timer } from 'rxjs';

import { dataUrlToBlob, pictureFileName } from '../shared/data-url';
import { estimate } from './estimate';
import { GenerationNotFound } from './in-memory.adapter';
import { carriesFiles, inputsOf } from './inputs';
import { NO_REFERENCES, isFinished, type Estimate, type Generation, type GenerationSettings, type ReferenceFile, type VideoModel } from './model';
import type { VideoGenerationPort } from './port';
import { toGeneration, toModelInputs, toRequest, type ServerGeneration, type ServerGenerationRequest, type ServerVideoOption } from './server-mapping';
import { GenerationRefused, validate } from './validate';

/** What the adapter uses of the API client: the typed calls it makes and the address of a file. */
export type VideoApi = Pick<ApiClient, 'get' | 'post' | 'postForm' | 'delete' | 'urlOf'>;

export interface ServerVideoOptions {
  /** Milliseconds between two reads of the server while a generation is unfinished. */
  pollMs?: number;
  /** The name the host gives itself to the server (`client` in the API); the studio's own when left out. */
  client?: string;
}

type GenerationOptions = components['schemas']['GenerationOptions'];

const addFile = (form: FormData, part: string, file: ReferenceFile): void => form.append(part, file.blob, file.name);

/**
 * The request as a form: the JSON in a `request` part, the start image as `image`, the end image as `end_image` and each
 * reference as a repeated `reference_images`, `reference_videos` or `reference_audios` part, in the order they were chosen.
 */
export function generationForm(request: ServerGenerationRequest, settings: Pick<GenerationSettings, 'startImage' | 'endImage' | 'references'>): FormData {
  const form = new FormData();
  form.set('request', JSON.stringify(request));
  for (const [part, image] of [['image', settings.startImage], ['end_image', settings.endImage]] as const) {
    if (!image) continue;
    const blob = dataUrlToBlob(image.dataUrl);
    form.set(part, blob, pictureFileName(image.name, blob.type));
  }
  const refs = settings.references ?? NO_REFERENCES;
  refs.images.forEach((f) => addFile(form, 'reference_images', f));
  refs.videos.forEach((f) => addFile(form, 'reference_videos', f));
  refs.audios.forEach((f) => addFile(form, 'reference_audios', f));
  return form;
}

/**
 * A video generation port that makes the videos through the server (`/api/generation/options`, `/api/generations`). The
 * server owns the state, so the adapter keeps only a copy of the list that it refreshes while anything is unfinished.
 */
export class ServerVideoGeneration implements VideoGenerationPort {
  private readonly pollMs: number;
  private readonly client?: string;
  private readonly options$: Observable<GenerationOptions>;
  private loaded?: GenerationOptions;
  private readonly generations = new BehaviorSubject<readonly Generation[]>([]);
  /** The settings of what this page made, with the start image the server does not give back. */
  private readonly own = new Map<string, GenerationSettings>();
  private started = false;
  private poller?: Subscription;

  constructor(
    private readonly api: VideoApi,
    { pollMs = 1500, client }: ServerVideoOptions = {},
  ) {
    this.pollMs = pollMs;
    this.client = client;
    this.options$ = defer(() => this.api.get('/api/generation/options')).pipe(
      tap((o) => (this.loaded = o)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
  }

  models(): Observable<readonly VideoModel[]> {
    return this.options$.pipe(map((o) => o.video.map(({ id, name, description, available, reason, audio, inputs }) => ({ id, name, description, available, audio, inputs: toModelInputs(inputs), ...(reason ? { reason } : {}) }))));
  }

  /** The option's own figure for the seconds (it does not grow with the duration); the size from the studio's model. */
  estimate(settings: GenerationSettings): Estimate {
    const local = estimate(settings);
    const seconds = this.optionOf(settings.model)?.estimate;
    return seconds ? { seconds, megabytes: local.megabytes } : local;
  }

  list(): Observable<readonly Generation[]> {
    return defer(() => {
      if (!this.started) {
        this.started = true;
        this.refresh().subscribe({ error: () => undefined });
      }
      return this.generations.asObservable();
    });
  }

  create(settings: GenerationSettings): Observable<Generation> {
    return defer(() => {
      const option = this.optionOf(settings.model);
      const inputs = this.loaded ? inputsOf({ inputs: toModelInputs(option?.inputs) }) : undefined;
      const problems = validate(settings, this.loaded?.video.filter((v) => v.available).map((v) => v.id), option?.audio !== false, inputs);
      if (problems.length) return throwError(() => new GenerationRefused(problems, inputs));
      const request = toRequest(settings, this.optionOf(settings.model), this.client);
      const call = carriesFiles(settings) ? this.api.postForm('/api/generations', generationForm(request, settings)) : this.api.post('/api/generations', { body: request });
      return call.pipe(
        map((made) => {
          this.own.set(made.id, { ...settings, reuse: undefined });
          const created = toGeneration(made, (a) => this.api.urlOf(a), this.own.get(made.id));
          this.generations.next([created, ...this.generations.value.filter((g) => g.id !== created.id)]);
          this.schedule();
          return created;
        }),
      );
    });
  }

  repeat(id: string): Observable<Generation> {
    return defer(() => {
      const found = this.generations.value.find((g) => g.id === id);
      const settings = this.own.get(id) ?? found?.settings;
      if (!settings) return throwError(() => new GenerationNotFound(id));
      // The server keeps the files of a generation: ask it to reuse them instead of sending them again.
      const inputs = found?.inputs ?? [];
      return this.create(inputs.length ? { ...settings, startImage: null, endImage: null, references: NO_REFERENCES, reuse: { of: id, inputs } } : settings);
    });
  }

  remove(id: string): Observable<void> {
    return defer(() => this.api.delete('/api/generations/{id}', { path: { id } })).pipe(
      map(() => {
        this.own.delete(id);
        this.generations.next(this.generations.value.filter((g) => g.id !== id));
      }),
    );
  }

  follow(id: string): Observable<Generation> {
    return defer(() =>
      timer(0, this.pollMs).pipe(
        switchMap(() =>
          this.api.get('/api/generations/{id}', { path: { id } }).pipe(
            catchError((e) => (e instanceof ApiError && e.status === 404 ? of(null) : throwError(() => e))),
          ),
        ),
        takeWhile((g): g is ServerGeneration => g !== null),
        map((g) => toGeneration(g, (a) => this.api.urlOf(a), this.own.get(id))),
        distinctUntilChanged((a, b) => a.state === b.state && a.progress === b.progress),
        tap((g) => this.generations.next(this.generations.value.map((x) => (x.id === g.id ? g : x)))),
        takeWhile((g) => !isFinished(g), true),
      ),
    );
  }

  private optionOf(model: string): ServerVideoOption | undefined {
    const video = this.loaded?.video;
    return video?.find((v) => (model ? v.id === model : v.default));
  }

  private refresh(): Observable<void> {
    return defer(() => this.api.get('/api/generations')).pipe(
      map((list) => {
        this.generations.next(list.map((g) => toGeneration(g, (a) => this.api.urlOf(a), this.own.get(g.id))));
        this.schedule();
      }),
    );
  }

  /** While anything is unfinished the list is read again every `pollMs`; when nothing is, it is left alone. */
  private schedule(): void {
    const pending = this.generations.value.some((g) => !isFinished(g));
    if (pending && !this.poller) {
      this.poller = timer(this.pollMs, this.pollMs)
        .pipe(switchMap(() => this.refresh().pipe(catchError(() => EMPTY))))
        .subscribe();
    } else if (!pending && this.poller) {
      this.poller.unsubscribe();
      this.poller = undefined;
    }
  }
}
