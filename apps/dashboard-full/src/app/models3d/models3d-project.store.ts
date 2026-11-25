import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, Injector, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../core/api.service';
import type { CatalogEntry, LibraryModelInfo, ModelEntry, ProjectConfig, Run, SourceInfo } from '../core/api.models';
import { STYLES, applyStyleEntry, chosenModelEntry, pickStyleEntry, styleAvailable, type Style } from '../editor/quality-tiers';
import { RunStream, RunStreamService } from '../core/run-stream.service';
import { entryOfRefusal, validateEntries } from './models3d-validators';
import { toModelsYaml } from './models3d-yaml';

/** One line of `out/<project>/manifest.json`: what a run made of one model. */
export interface ModelsManifestLine {
  entry: string;
  /** 0 for the first model of an entry, then 1, 2, 3. */
  variant?: number;
  /** The name the model has in the library and the file is named after: `<id>` or `<id>-<n>`. */
  name: string;
  /** The path of the `.glb` in the project's artifacts: `out/<project>/<name>.glb`. */
  file: string;
  prompt?: string;
  image?: string;
  engine: string;
  engine_version?: string;
  detail: string;
  seed: number;
  triangles: number;
  seconds: number;
  adult?: boolean;
  key?: string;
}

interface ApiErrorBody {
  error?: { message?: string; reason?: string };
}

/**
 * A project of 3D models: its entries and defaults, saved to `scenes.yaml`; a run, followed while it goes; and what it made (the manifest and the models of the library for the project).
 * Every edit marks the project as changed; nothing is sent that the server's documented rules refuse; a refusal of the server is kept with the entry it names.
 */
@Injectable()
export class Models3dProjectStore {
  private readonly api = inject(ApiService);
  private readonly streams = inject(RunStreamService);
  private readonly injector = inject(Injector);

  readonly projectId = signal('');
  readonly config = signal<ProjectConfig | null>(null);
  readonly loading = signal(false);
  readonly dirty = signal(false);
  readonly saving = signal(false);
  readonly warnings = signal<string[]>([]);
  /** What the server said when it refused to save, and the entry it is about (-1: none). */
  readonly serverError = signal('');
  readonly serverEntry = signal(-1);

  readonly isModels3d = computed(() => this.config()?.output.mode === 'models3d');
  readonly entries = computed<ModelEntry[]>(() => this.config()?.models ?? []);
  readonly defaults = computed(() => this.config()?.defaults.models3d ?? {});
  readonly validation = computed(() => validateEntries(this.entries()));
  readonly canSave = computed(() => this.config() !== null && this.validation().ok && !this.saving());

  /** The pictures of the project's sources, for an entry that brings its own. */
  readonly pictures = signal<SourceInfo[]>([]);
  readonly sourceBusy = signal(false);
  readonly sourceError = signal('');

  // --- the image model: the picture of each text is drawn with the project's ---
  readonly catalog = signal<CatalogEntry[]>([]);
  readonly catalogLoaded = signal(false);
  /** The looks with an installed image model. */
  readonly styles = computed<Style[]>(() => STYLES.filter((s) => styleAvailable(this.catalog(), s)));
  /** The installed model the project draws its pictures with, when it is one of the catalog's. */
  readonly pictureModel = computed(() => {
    const cfg = this.config();
    return cfg ? chosenModelEntry(cfg, this.catalog()) : null;
  });
  /** The look of that model (the first of the styles it serves that the picker offers). */
  readonly style = computed<Style | ''>(() => {
    const entry = this.pictureModel();
    return entry ? (this.styles().find((s) => pickStyleEntry(this.catalog(), s) === entry) ?? '') : '';
  });
  /** The catalog is read and the project's image model is not one of its installed ones: the pictures of the texts cannot be drawn until one is chosen. */
  readonly needsPictureModel = computed(() => this.catalogLoaded() && this.entries().some((e) => (e.prompt ?? '').trim() !== '') && this.pictureModel() === null);

  // --- the run ---
  readonly activeRun = signal<Run | null>(null);
  readonly stream = signal<RunStream | null>(null);
  readonly launching = signal(false);
  readonly runOnly = signal<string | null>(null);
  /** What the server said when it refused to start the run, or what failed it. */
  readonly runProblem = signal('');
  readonly running = computed(() => {
    const s = this.stream();
    return this.launching() || (s !== null && !s.ended());
  });

  // --- what was made ---
  readonly manifest = signal<ModelsManifestLine[]>([]);
  readonly models = signal<LibraryModelInfo[]>([]);
  readonly resultsLoaded = signal(false);
  /** Counts the runs that ended while this store watched; the results are read again when it changes. */
  readonly ended = signal(0);

  constructor() {
    effect(() => {
      const stream = this.stream();
      if (!stream || !stream.ended()) return;
      untracked(() => {
        const state = stream.state();
        if (state?.state === 'failed' || state?.state === 'interrupted') this.runProblem.set(state.error ?? '');
        this.ended.update((n) => n + 1);
        void this.reloadResults();
      });
    });
  }

  async load(id: string): Promise<void> {
    this.projectId.set(id);
    this.loading.set(true);
    try {
      const res = await firstValueFrom(this.api.getConfig(id));
      this.config.set(res.parsed ?? null);
      this.warnings.set(res.warnings ?? []);
      this.dirty.set(false);
      this.serverError.set('');
      this.serverEntry.set(-1);
      if (this.isModels3d()) await Promise.all([this.reloadResults(), this.loadPictures(), this.loadCatalog()]);
    } finally {
      this.loading.set(false);
    }
  }

  /** The catalog of image models (a failure leaves it empty: the page then says no look can be chosen). */
  async loadCatalog(): Promise<void> {
    try {
      this.catalog.set((await firstValueFrom(this.api.getCatalog())).entries);
    } catch {
      this.catalog.set([]);
    }
    this.catalogLoaded.set(true);
  }

  /** Draws the pictures of the texts with the best installed model of a look: its model, steps and resolution (the sampler is kept, or `euler`). */
  setStyle(style: Style): void {
    const entry = pickStyleEntry(this.catalog(), style);
    if (!entry) return;
    this.mutate((c) => {
      const next = applyStyleEntry(c, entry);
      next.defaults.sampler ||= 'euler';
      next.defaults.steps ||= 30;
      return next;
    });
  }

  // --- edits ---

  private mutate(fn: (cfg: ProjectConfig) => ProjectConfig): void {
    const cfg = this.config();
    if (!cfg) return;
    this.config.set(fn(cfg));
    this.dirty.set(true);
    this.serverError.set('');
    this.serverEntry.set(-1);
  }

  private freeId(): string {
    const taken = new Set(this.entries().map((e) => e.id));
    for (let n = this.entries().length + 1; ; n++) if (!taken.has(`object-${n}`)) return `object-${n}`;
  }

  addEntry(): string {
    const id = this.freeId();
    this.mutate((c) => ({ ...c, models: [...(c.models ?? []), { id, prompt: '' }] }));
    return id;
  }

  updateEntry(index: number, patch: Partial<ModelEntry>): void {
    this.mutate((c) => ({ ...c, models: (c.models ?? []).map((e, i) => (i === index ? { ...e, ...patch } : e)) }));
  }

  /** Puts a whole entry in its place (the form hands over the entry it edits). */
  setEntry(index: number, entry: ModelEntry): void {
    this.mutate((c) => ({ ...c, models: (c.models ?? []).map((e, i) => (i === index ? entry : e)) }));
  }

  removeEntry(index: number): void {
    this.mutate((c) => ({ ...c, models: (c.models ?? []).filter((_, i) => i !== index) }));
  }

  duplicateEntry(index: number): void {
    const source = this.entries()[index];
    if (!source) return;
    const id = this.freeId();
    this.mutate((c) => {
      const list = [...(c.models ?? [])];
      list.splice(index + 1, 0, { ...source, id });
      return { ...c, models: list };
    });
  }

  setDefaults(patch: { engine?: string; detail?: string }): void {
    this.mutate((c) => ({ ...c, defaults: { ...c.defaults, models3d: { ...(c.defaults.models3d ?? {}), ...patch } } }));
  }

  // --- saving ---

  async save(): Promise<boolean> {
    const cfg = this.config();
    if (!cfg || !this.canSave()) return false;
    this.saving.set(true);
    this.serverError.set('');
    this.serverEntry.set(-1);
    try {
      const res = await firstValueFrom(this.api.saveConfig(this.projectId(), toModelsYaml(cfg)));
      this.warnings.set(res.warnings ?? []);
      this.dirty.set(false);
      return true;
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        const message = (err.error as ApiErrorBody | undefined)?.error?.message ?? err.message;
        this.serverError.set(message);
        this.serverEntry.set(entryOfRefusal(message));
        return false;
      }
      throw err;
    } finally {
      this.saving.set(false);
    }
  }

  // --- the run ---

  /** Makes the models of the whole project, or only `only` (an entry's id). Unsaved edits are saved first. */
  async launch(only?: string): Promise<boolean> {
    if (this.running()) return false;
    this.runProblem.set('');
    if (this.dirty() && !(await this.save())) return false;
    this.launching.set(true);
    try {
      const res = await firstValueFrom(this.api.launchRun(this.projectId(), { only, keep_tmp: true }, true));
      this.runOnly.set(only ?? null);
      this.activeRun.set(res.run);
      this.stream.set(this.streams.connect(res.run.id));
      return true;
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        this.runProblem.set((err.error as ApiErrorBody | undefined)?.error?.message ?? err.message);
        return false;
      }
      throw err;
    } finally {
      this.launching.set(false);
    }
  }

  async cancel(): Promise<void> {
    const run = this.activeRun();
    if (run) await firstValueFrom(this.api.cancelRun(run.id));
  }

  // --- what was made ---

  /** Reads the manifest the last run left (a 404 until one ended: nothing made yet) and the models of the library that the project made. */
  async reloadResults(): Promise<void> {
    const id = this.projectId();
    const name = this.config()?.project ?? id;
    const [manifest, models] = await Promise.all([
      firstValueFrom(this.api.getArtifactJson<{ models?: ModelsManifestLine[] }>(id, `out/${name}/manifest.json`)).catch(() => ({ models: [] as ModelsManifestLine[] })),
      firstValueFrom(this.api.listLibraryModels({ project: id, limit: 100 })).catch(() => ({ models: [] as LibraryModelInfo[], total: 0 })),
    ]);
    this.manifest.set(manifest.models ?? []);
    this.models.set(models.models);
    this.resultsLoaded.set(true);
  }

  /** The address to save a model of the output (`file` is the manifest's: the path in the project's artifacts). */
  downloadUrl(file: string): string {
    return this.api.artifactUrl(this.projectId(), file);
  }

  // --- pictures ---

  async loadPictures(): Promise<void> {
    try {
      this.pictures.set((await firstValueFrom(this.api.listSources(this.projectId()))).sources.filter((s) => (s.kind ?? 'image') === 'image'));
    } catch {
      this.pictures.set([]);
    }
  }

  /** Uploads a picture for an entry; answers the name it was stored under, or `null` after keeping the refusal. */
  async uploadPicture(file: File): Promise<string | null> {
    this.sourceBusy.set(true);
    this.sourceError.set('');
    try {
      const stored = (await firstValueFrom(this.api.uploadSource(this.projectId(), file.name, file))).name;
      await this.loadPictures();
      return stored;
    } catch (err) {
      this.sourceError.set(err instanceof HttpErrorResponse ? ((err.error as ApiErrorBody | undefined)?.error?.message ?? err.message) : String(err));
      return null;
    } finally {
      this.sourceBusy.set(false);
    }
  }
}
