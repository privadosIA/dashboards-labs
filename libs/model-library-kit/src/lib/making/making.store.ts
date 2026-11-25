import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { LanguageService } from '../core/language';
import { MODEL_LIBRARY_OPTIONS } from '../core/options';
import { reasonOf } from '../core/reason';
import { textsFor } from '../core/texts';
import { type BackendId, type Engines, type Generation, type GenerationRequest, type InstallJob, type InstallOptions, type InstallPlan, LibraryFailed, MODEL_LIBRARY_PORT, type ModelBackend } from '../port';

/** The most times a container that is starting is asked for before the store says it gave up (about a minute at one a second). */
export const START_TRIES = 60;

/**
 * What a person needs to make 3D models: the engines and whether each can be used, the container's start and stop, the download of an engine's weights and the generations.
 *
 * A server with no 3D service answers 503 to the engines: `status` is then `none` and nothing about making is offered. A container that is starting and a download are asked for every `pollMs`
 * until they end; the generations every two `pollMs` while one is queued or running; all of it ends with the screen that holds the store. A refusal is kept by what asked, in the server's words
 * (or the sentence of its reason when the server gave one).
 */
@Injectable()
export class MakingStore {
  private readonly port = inject(MODEL_LIBRARY_PORT);
  private readonly t = textsFor(inject(LanguageService).lang);
  private readonly pollMs = inject(MODEL_LIBRARY_OPTIONS, { optional: true })?.pollMs ?? 1000;
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private gone = false;
  private startTries = 0;

  readonly status = signal<'loading' | 'ready' | 'none' | 'error'>('loading');
  readonly error = signal('');
  readonly engines = signal<Engines>({});
  /** The backend TripoSR runs on, from the server's settings; `null` while it is not known (an older server does not say). */
  readonly backend = signal<ModelBackend | null>(null);
  /** The container did not come up in time. */
  readonly gaveUp = signal(false);
  /** The download of each engine's weights, by engine. */
  readonly jobs = signal<Readonly<Record<string, InstallJob>>>({});
  readonly generations = signal<readonly Generation[]>([]);
  /** Counts the generations that ended `done` while this store watched: the catalog is read again when it changes. */
  readonly finished = signal(0);
  /** The last refusal of each thing asked (an engine's id, `generate` or a generation's id), in words. */
  readonly problems = signal<Readonly<Record<string, string>>>({});
  readonly busy = signal<ReadonlySet<string>>(new Set());

  /** The ids of the engines that can be used now. */
  readonly usable = computed(() => Object.entries(this.engines()).filter(([, e]) => e.available).map(([id]) => id));
  readonly names = computed(() => Object.keys(this.engines()));

  /** The backend an engine runs on: its only one, or the one the settings say. Empty when it is not known. */
  backendOf(engine: string): string {
    const keys = Object.keys(this.engines()[engine]?.backends ?? {});
    return keys.length === 1 ? keys[0] : (this.backend()?.backend ?? '');
  }

  /** The choice of backend is offered for an engine with more than one, that no external service runs, when the settings say which is in use. */
  canChoose(engine: string): boolean {
    const status = this.engines()[engine];
    return !!status && status.mode !== 'external' && Object.keys(status.backends ?? {}).length > 1 && this.backend() !== null;
  }

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.gone = true;
      for (const timer of this.timers.values()) clearTimeout(timer);
      this.timers.clear();
    });
  }

  /** The sentence for a refusal: the one of its reason when the server gave a reason we know, otherwise its own words. */
  say(e: unknown): string {
    return e instanceof LibraryFailed && e.reason && this.t.making.engines.reasons[e.reason] ? this.t.making.engines.reasons[e.reason] : reasonOf(e, this.t);
  }

  async load(): Promise<void> {
    try {
      const engines = await firstValueFrom(this.port.engines());
      if (engines === null) {
        this.status.set('none');
        return;
      }
      this.engines.set(engines);
      this.status.set('ready');
      if (Object.values(engines).some((e) => e.container?.state === 'starting')) this.watchStart();
      await this.loadBackend();
    } catch (e) {
      this.status.set('error');
      this.error.set(this.say(e));
      return;
    }
    await this.loadGenerations();
  }

  private problem(key: string, e: unknown): void {
    this.problems.update((p) => ({ ...p, [key]: typeof e === 'string' ? e : this.say(e) }));
  }

  private async run(key: string, work: () => Promise<void>): Promise<void> {
    this.busy.update((b) => new Set(b).add(key));
    this.problems.update(({ [key]: _gone, ...rest }) => rest);
    try {
      await work();
    } catch (e) {
      this.problem(key, e);
    } finally {
      this.busy.update((b) => {
        const next = new Set(b);
        next.delete(key);
        return next;
      });
    }
  }

  private later(key: string, ms: number, work: () => Promise<void>): void {
    if (this.gone || this.timers.has(key)) return;
    this.timers.set(
      key,
      setTimeout(async () => {
        this.timers.delete(key);
        if (!this.gone) await work();
      }, ms),
    );
  }

  // --- the container ---

  start(engine: string): Promise<void> {
    return this.run(engine, async () => {
      await firstValueFrom(this.port.startEngine(engine));
      this.gaveUp.set(false);
      this.startTries = 0;
      await this.refreshEngines();
      this.watchStart();
    });
  }

  stop(engine: string): Promise<void> {
    return this.run(engine, async () => {
      await firstValueFrom(this.port.stopEngine(engine));
      await this.refreshEngines();
    });
  }

  /** Reads the backend in use (a failure leaves it unknown: the choice is then not offered, and the rest works as before). */
  private async loadBackend(): Promise<void> {
    try {
      this.backend.set(await firstValueFrom(this.port.modelBackend()));
    } catch {
      this.backend.set(null);
    }
  }

  /** Chooses the backend (`''` goes back to the server's default); a refusal is kept under `backend` in the server's words and the choice stays as it was. */
  setBackend(value: BackendId | ''): Promise<void> {
    return this.run('backend', async () => {
      this.backend.set(await firstValueFrom(this.port.setModelBackend(value)));
      await this.refreshEngines();
    });
  }

  private async refreshEngines(): Promise<void> {
    const engines = await firstValueFrom(this.port.engines());
    if (engines) this.engines.set(engines);
  }

  /** Asks for the engines every `pollMs` while a container is starting, up to `START_TRIES` times. */
  private watchStart(): void {
    this.later('start', this.pollMs, async () => {
      try {
        await this.refreshEngines();
      } catch (e) {
        this.problem('start', e);
        return;
      }
      const starting = Object.values(this.engines()).some((e) => e.container?.state === 'starting');
      if (!starting) return;
      if (++this.startTries >= START_TRIES) this.gaveUp.set(true);
      else this.watchStart();
    });
  }

  // --- the weights ---

  /** What an engine's weights need, to be read before anything is downloaded; `null` after keeping the refusal under the engine. */
  async plan(engine: string, options: InstallOptions = {}): Promise<InstallPlan | null> {
    try {
      this.problems.update(({ [engine]: _gone, ...rest }) => rest);
      return await firstValueFrom(this.port.installPlan(engine, options));
    } catch (e) {
      this.problem(engine, e);
      return null;
    }
  }

  /** Starts the download: only the plan dialog's button calls it, after the person read the plan. */
  confirmInstall(engine: string, options: InstallOptions = {}): Promise<void> {
    return this.run(engine, async () => {
      const job = await firstValueFrom(this.port.startInstall(engine, options));
      this.putJob(job);
    });
  }

  private putJob(job: InstallJob): void {
    this.jobs.update((j) => ({ ...j, [job.engine]: job }));
    if (job.state === 'running') this.followJob(job);
  }

  private followJob(job: InstallJob): void {
    this.later(`job ${job.id}`, this.pollMs, async () => {
      try {
        const next = await firstValueFrom(this.port.installJob(job.id));
        this.putJob(next);
        if (next.state === 'done') await this.refreshEngines();
      } catch (e) {
        this.problem(job.engine, e);
      }
    });
  }

  cancelInstall(engine: string): Promise<void> {
    const job = this.jobs()[engine];
    if (!job) return Promise.resolve();
    return this.run(engine, async () => {
      clearTimeout(this.timers.get(`job ${job.id}`));
      this.timers.delete(`job ${job.id}`);
      this.putJob(await firstValueFrom(this.port.cancelInstall(job.id)));
    });
  }

  // --- the generations ---

  async loadGenerations(): Promise<void> {
    try {
      this.setGenerations(await firstValueFrom(this.port.generations()));
    } catch (e) {
      this.problem('generations', e);
    }
  }

  private setGenerations(list: readonly Generation[]): void {
    const before = new Map(this.generations().map((g) => [g.id, g.state]));
    const ended = list.filter((g) => g.state === 'done' && before.has(g.id) && before.get(g.id) !== 'done').length;
    this.generations.set(list);
    if (ended > 0) this.finished.update((n) => n + ended);
    if (list.some((g) => g.state === 'queued' || g.state === 'running')) this.watchGenerations();
  }

  private watchGenerations(): void {
    this.later('generations', this.pollMs * 2, async () => {
      try {
        this.setGenerations(await firstValueFrom(this.port.generations()));
      } catch (e) {
        this.problem('generations', e);
      }
    });
  }

  /** Starts a generation; answers it, or `null` after keeping the refusal under `generate` with what was typed left to the caller. */
  async generate(request: GenerationRequest): Promise<Generation | null> {
    this.problems.update(({ generate: _gone, ...rest }) => rest);
    try {
      const generation = await firstValueFrom(this.port.generate(request));
      this.setGenerations([generation, ...this.generations().filter((g) => g.id !== generation.id)]);
      this.watchGenerations();
      return generation;
    } catch (e) {
      this.problem('generate', e);
      return null;
    }
  }

  cancelGeneration(id: string): Promise<void> {
    return this.run(id, async () => {
      try {
        this.replace(await firstValueFrom(this.port.cancelGeneration(id)));
      } catch (e) {
        if (e instanceof LibraryFailed && e.status === 409) this.replace(await firstValueFrom(this.port.generation(id)));
        else throw e;
      }
    });
  }

  removeGeneration(id: string): Promise<void> {
    return this.run(id, async () => {
      await firstValueFrom(this.port.deleteGeneration(id));
      this.generations.update((list) => list.filter((g) => g.id !== id));
    });
  }

  private replace(generation: Generation): void {
    this.generations.update((list) => list.map((g) => (g.id === generation.id ? generation : g)));
  }
}
