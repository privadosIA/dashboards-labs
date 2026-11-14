import { BehaviorSubject, Observable, Subject, Subscription, concat, defer, filter, map, of, skip, takeWhile, throwError, timer } from 'rxjs';

import { estimate } from './estimate';
import { inputsOf } from './inputs';
import { ASPECT_RATIOS, NO_REFERENCES, QUALITIES, START_ONLY, isFinished, type Estimate, type Generation, type GenerationInput, type GenerationSettings, type VideoModel } from './model';
import type { VideoGenerationPort } from './port';
import { advance, fail, finish, start } from './state';
import { GenerationRefused, validate } from './validate';

export interface InMemoryOptions {
  /** Milliseconds each step lasts. 0 makes every step happen on the next tick. */
  pace?: number;
  /** How many steps a generation takes to get to 100. */
  steps?: number;
  /** The address every finished video gets: there is no real video, only this placeholder. */
  videoUrl?: string;
  /**
   * Where the history is kept so it outlives the page (`sessionStorage` in the application). Without one nothing is
   * kept. A storage that is full, blocked or holds something unreadable never breaks the adapter.
   */
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  storageKey?: string;
}

export class GenerationNotFound extends Error {
  constructor(id: string) {
    super(`there is no generation ${id}`);
    this.name = 'GenerationNotFound';
  }
}

type Change = { id: string; generation: Generation | null };

/** Models of demonstration: the adapter makes no videos, so these only give the choice something to choose from. */
export const DEMO_MODELS: readonly VideoModel[] = [
  { id: 'balanced', name: 'Balanced', description: 'Demonstration model: a middle ground between speed and detail.', available: true, audio: true, inputs: { startImage: true, endImage: true } },
  { id: 'fast', name: 'Fast', description: 'Demonstration model: quick drafts with less detail.', available: true, audio: false, inputs: START_ONLY },
  { id: 'cinematic', name: 'Cinematic', description: 'Demonstration model: slower, with the smoothest motion.', available: true, audio: true, inputs: { startImage: true, endImage: true } },
  {
    id: 'reference',
    name: 'Reference',
    description: 'Demonstration model: it follows reference images, videos and audios instead of frames.',
    available: true,
    audio: true,
    inputs: { startImage: false, endImage: false, referenceImages: { min: 1, max: 2 }, referenceVideos: { max: 1, maxSeconds: 2 }, referenceAudios: { max: 1, maxSeconds: 3 } },
  },
  { id: 'premium', name: 'Premium', description: 'Demonstration model: the best quality, which this demonstration cannot run.', available: false, reason: 'Demonstration only: it needs a server', audio: true },
];

const INTERRUPTED = 'Interrupted: the page was reloaded';
const STATES = ['queued', 'running', 'done', 'failed'];

const isSavedSettings = (s: Partial<GenerationSettings> | null | undefined): s is GenerationSettings =>
  !!s &&
  typeof s.prompt === 'string' &&
  typeof s.duration === 'number' &&
  (ASPECT_RATIOS as readonly unknown[]).includes(s.aspectRatio) &&
  (QUALITIES as readonly unknown[]).includes(s.quality) &&
  typeof s.audio === 'boolean';

const isSaved = (g: Partial<Generation> | null): g is Generation =>
  !!g && typeof g.id === 'string' && /^gen-\d+$/.test(g.id) && STATES.includes(g.state as string) && typeof g.progress === 'number' && isSavedSettings(g.settings);

const objectUrl = (blob: Blob): string => (typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : '');

/** The inputs a generation reports: the start image first, then the rest in the order they were given. */
const describe = (s: GenerationSettings): GenerationInput[] => {
  const refs = s.references ?? NO_REFERENCES;
  return [
    ...(s.startImage ? [{ kind: 'start_image' as const, name: s.startImage.name, url: s.startImage.dataUrl }] : []),
    ...(s.endImage ? [{ kind: 'end_image' as const, name: s.endImage.name, url: s.endImage.dataUrl }] : []),
    ...refs.images.map((f) => ({ kind: 'reference_image' as const, name: f.name, url: objectUrl(f.blob) })),
    ...refs.videos.map((f) => ({ kind: 'reference_video' as const, name: f.name, url: objectUrl(f.blob) })),
    ...refs.audios.map((f) => ({ kind: 'reference_audio' as const, name: f.name, url: objectUrl(f.blob) })),
  ];
};

/** A generation as it is stored: no file of it (a data URL can be as big as the image and a blob does not outlive the page), only the names of its inputs. */
const withoutFiles = (g: Generation): Generation => {
  const { endImage: _end, references: _refs, reuse: _reuse, ...settings } = g.settings;
  return { ...g, settings: { ...settings, startImage: null }, ...(g.inputs ? { inputs: g.inputs.map((i) => ({ ...i, url: '' })) } : {}) };
};

/** A generation cut short by the reload has no timer any more: it comes back failed, as it was when it stopped. */
const withModel = (g: Generation): Generation => ({ ...g, settings: { ...g.settings, model: g.settings.model || DEMO_MODELS[0].id } });

const interrupted = (g: Generation): Generation => (isFinished(g) ? g : fail(g.state === 'queued' ? start(g) : g, INTERRUPTED));

/**
 * A video generation port that makes no videos: it simulates one (queued, running with progress, done or failed) with
 * timers, keeps everything for the life of the page (or of the storage it is given) and sends nothing anywhere. It exists to build and try the studio
 * without a server, not to stand in for one.
 */
export class InMemoryVideoGeneration implements VideoGenerationPort {
  private readonly pace: number;
  private readonly steps: number;
  private readonly videoUrl: string;
  private readonly generations: BehaviorSubject<readonly Generation[]>;
  private readonly changes = new Subject<Change>();
  private readonly running = new Map<string, Subscription>();
  private readonly storage?: InMemoryOptions['storage'];
  private readonly storageKey: string;
  private counter = 0;
  private failNextOne = false;
  /** The files of what this page made, which a repeat reuses; they do not outlive the page, so a restored generation cannot be reused. */
  private readonly files = new Map<string, GenerationSettings>();

  constructor({ pace = 400, steps = 10, videoUrl = 'placeholder.mp4', storage, storageKey = 'video-studio.history' }: InMemoryOptions = {}) {
    this.pace = pace;
    this.steps = Math.max(2, steps);
    this.videoUrl = videoUrl;
    this.storage = storage;
    this.storageKey = storageKey;
    const restored = this.restore();
    this.counter = Math.max(0, ...restored.map((g) => Number(g.id.slice('gen-'.length))));
    this.generations = new BehaviorSubject<readonly Generation[]>(restored);
    if (storage) {
      this.save(restored);
      this.generations.pipe(skip(1)).subscribe((list) => this.save(list));
    }
  }

  /** The next generation created ends `failed`; the one after it is not affected. `failNext(false)` takes it back. */
  failNext(on = true): void {
    this.failNextOne = on;
  }

  models(): Observable<readonly VideoModel[]> {
    return of(DEMO_MODELS);
  }

  estimate(settings: GenerationSettings): Estimate {
    return estimate(settings);
  }

  list(): Observable<readonly Generation[]> {
    return this.generations.asObservable();
  }

  create(settings: GenerationSettings): Observable<Generation> {
    return defer(() => {
      const model = DEMO_MODELS.find((m) => m.id === settings.model);
      const problems = validate(settings, DEMO_MODELS.filter((m) => m.available).map((m) => m.id), model?.audio !== false, inputsOf(model));
      if (problems.length) return throwError(() => new GenerationRefused(problems, inputsOf(model)));
      const source = settings.reuse ? this.files.get(settings.reuse.of) : undefined;
      if (settings.reuse && !source) return throwError(() => new GenerationRefused(['reuse-unavailable']));
      const made = source ? { ...settings, startImage: source.startImage, endImage: source.endImage, references: source.references, reuse: undefined } : settings;
      const created: Generation = { id: `gen-${++this.counter}`, settings: { ...made }, state: 'queued', progress: 0, createdAt: new Date().toISOString(), inputs: describe(made) };
      this.files.set(created.id, made);
      this.generations.next([created, ...this.generations.value]);
      this.run(created.id, this.failNextOne);
      this.failNextOne = false;
      return of(created);
    });
  }

  repeat(id: string): Observable<Generation> {
    return defer(() => {
      const original = this.find(id);
      if (!original) return throwError(() => new GenerationNotFound(id));
      if (this.files.has(id) && original.inputs?.length) {
        return this.create({ ...original.settings, startImage: null, endImage: null, references: NO_REFERENCES, reuse: { of: id, inputs: original.inputs } });
      }
      // Restored after a reload: the files are gone. What only needed text or frames repeats as text; references cannot.
      if (original.inputs?.some((i) => i.kind.startsWith('reference_'))) return throwError(() => new GenerationRefused(['reuse-unavailable']));
      return this.create(original.settings);
    });
  }

  remove(id: string): Observable<void> {
    return defer(() => {
      if (!this.find(id)) return throwError(() => new GenerationNotFound(id));
      this.running.get(id)?.unsubscribe();
      this.running.delete(id);
      this.generations.next(this.generations.value.filter((g) => g.id !== id));
      this.changes.next({ id, generation: null });
      return of(undefined);
    });
  }

  follow(id: string): Observable<Generation> {
    return defer(() => {
      const now = this.find(id);
      if (!now) return throwError(() => new GenerationNotFound(id));
      // Removing the generation ends the stream without emitting it.
      const later = this.changes.pipe(
        filter((c) => c.id === id),
        takeWhile((c) => c.generation !== null),
        map((c) => c.generation as Generation),
      );
      return concat(of(now), later).pipe(takeWhile((g) => !isFinished(g), true));
    });
  }

  private restore(): Generation[] {
    if (!this.storage) return [];
    try {
      const saved: unknown = JSON.parse(this.storage.getItem(this.storageKey) ?? '[]');
      return Array.isArray(saved) ? saved.filter(isSaved).map(withModel).map(interrupted) : [];
    } catch {
      return [];
    }
  }

  /** The start image is left out: a data URL can be as big as the image and would fill the storage. */
  private save(list: readonly Generation[]): void {
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify(list.map(withoutFiles)));
    } catch {
      // A storage that is full or blocked only means the history is not kept.
    }
  }

  private find(id: string): Generation | undefined {
    return this.generations.value.find((g) => g.id === id);
  }

  private update(id: string, change: (g: Generation) => Generation): void {
    const current = this.find(id);
    if (!current) return;
    const next = change(current);
    this.generations.next(this.generations.value.map((g) => (g.id === id ? next : g)));
    this.changes.next({ id, generation: next });
  }

  /** One tick per step: start, progress, then done, or failed half-way when asked to. */
  private run(id: string, willFail: boolean): void {
    const failAt = Math.ceil(this.steps / 2);
    const ticks = timer(this.pace, this.pace).subscribe((tick) => {
      if (tick === 0) return this.update(id, start);
      if (willFail && tick === failAt) return this.end(id, (g) => fail(g, 'Simulated failure'));
      if (tick >= this.steps) return this.end(id, (g) => finish(g, this.videoUrl));
      this.update(id, (g) => advance(g, (tick * 100) / this.steps));
    });
    this.running.set(id, ticks);
  }

  private end(id: string, change: (g: Generation) => Generation): void {
    this.update(id, change);
    this.running.get(id)?.unsubscribe();
    this.running.delete(id);
  }
}
