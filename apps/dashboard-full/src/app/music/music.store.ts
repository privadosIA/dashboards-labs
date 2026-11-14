import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, Injector, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import {
  ApiErrorBody,
  CatalogEntry,
  Mix,
  MixClip,
  MixManifestEntry,
  MusicManifestEntry,
  PeaksResponse,
  MusicSettings,
  MusicTask,
  ProjectConfig,
  SourceInfo,
  Run,
  Track,
} from '../core/api.models';
import { ApiService } from '../core/api.service';
import { EnvironmentStore } from '../core/environment.store';
import { RunStream, RunStreamService } from '../core/run-stream.service';
import { freeSourceName, uploadSourceName } from '../core/source-name';
import { toMusicYaml } from './music-yaml';
import { DEFAULT_SYNTH_MODEL, STEMS, synthesisModels, tierSettings } from './music-options';
import { applyStyleEntry } from '../editor/quality-tiers';
import { COVER_RESOLUTION, MusicAutoPlan, describeMusicPlan, durationText, planSettings } from './music-auto-plan';
import { toYaml } from '../shared/project-yaml';
import { ServerMixError, ServerTrackError, serverMixErrors, serverTrackErrors, validateMixes, validateTracks } from './music-validators';

/** Where to send the user when a run is refused: the engine or a model is missing. */
export interface LaunchHelp {
  /** The error message from the server, verbatim. */
  message: string;
  /** A program is missing: the Environment page says how to build it. */
  engine: boolean;
  /** A model file is missing: the Music tab of Models installs it. */
  models: boolean;
}

/** Seconds of the end of a song a lengthened one repaints too, so the join is not heard. */
export const EXTEND_OVERLAP_SECONDS = 4;
/** The most and the fewest seconds a song can be lengthened by in one go. */
export const EXTEND_MIN_SECONDS = 5;
export const EXTEND_MAX_SECONDS = 180;

/** Buckets of the waveform of a song in the list, and how many peaks requests go out at once. */
export const WAVE_BUCKETS = 600;
const WAVE_CONCURRENCY = 4;

/** Edits of the same thing closer together than this are one undo step. */
const COALESCE_MS = 800;
const HISTORY_LIMIT = 100;

/**
 * State of the music studio for one project: its tracks as the editable
 * model, the client mirror of the server's rules, the save flow (the
 * server's answer stays authoritative and is tied to the track it names),
 * runs of the whole project or of one track with their live stream, and the
 * exported songs read from manifest.json.
 */
@Injectable()
export class MusicStore {
  private readonly api = inject(ApiService);
  private readonly streams = inject(RunStreamService);
  private readonly env = inject(EnvironmentStore);
  private readonly injector = inject(Injector);

  readonly projectId = signal('');
  readonly config = signal<ProjectConfig | null>(null);
  readonly loading = signal(false);
  readonly dirty = signal(false);
  readonly saving = signal(false);
  readonly warnings = signal<string[]>([]);
  /** Server validation rejections of the last save (authoritative). */
  readonly serverErrors = signal<ServerTrackError[]>([]);

  readonly tracks = computed(() => this.config()?.tracks ?? []);
  /** The project is not a music project: the page sends the user to the scene editor. */
  readonly isMusic = computed(() => this.config()?.output.mode === 'music');
  readonly settings = computed<MusicSettings>(() => this.config()?.defaults.music ?? {});

  /** What Easy mode wrote, and the project as it was, so Undo restores it whole. */
  readonly autoApplied = signal<{ note: string[]; before: ProjectConfig } | null>(null);

  /**
   * Sets how the songs get their cover. `auto` makes sure the project has an image model to make them with (the given
   * entry, when it has none) and a square size; `off` removes the setting.
   */
  setCover(mode: 'auto' | 'off', model: CatalogEntry | null = null): void {
    this.mutate((c) => this.withCover(c, mode, model));
  }

  private withCover(cfg: ProjectConfig, mode: 'auto' | 'off', model: CatalogEntry | null): ProjectConfig {
    let c = cfg;
    if (mode === 'auto') {
      if (!c.defaults.model && !c.defaults.model_set && model) c = applyStyleEntry(c, model);
      if (c.defaults.model || c.defaults.model_set) c.defaults.resolution = COVER_RESOLUTION;
    }
    const next = { ...(c.defaults.music ?? {}) };
    if (mode === 'auto') next.cover = 'auto';
    else delete next.cover;
    if (Object.keys(next).length === 0) delete c.defaults.music;
    else c.defaults.music = next;
    return c;
  }

  /** Writes what the plan chose in one edit: the level, the language model, the versions of every song and the covers. */
  applyAuto(plan: MusicAutoPlan): void {
    const before = this.config();
    if (!before) return;
    this.autoApplied.set({ note: [...describeMusicPlan(plan), durationText(plan.seconds)], before: structuredClone(before) });
    this.mutate((c) => {
      const patch = planSettings(plan);
      const next = { ...(c.defaults.music ?? {}), ...patch };
      for (const key of Object.keys(patch) as (keyof MusicSettings)[]) {
        if (next[key] === undefined) delete next[key];
      }
      if (Object.keys(next).length === 0) delete c.defaults.music;
      else c.defaults.music = next;
      if (plan.coverEntry) c = this.withCover(c, 'auto', plan.coverEntry);
      c.tracks = (c.tracks ?? []).map((t) => {
        const n = { ...t };
        if (plan.variants === 1) delete n.variants;
        else n.variants = plan.variants;
        return n;
      });
      return c;
    });
  }

  /** Puts the project back as it was before the last Easy mode plan. */
  undoAuto(): void {
    const applied = this.autoApplied();
    if (!applied) return;
    this.mutate(() => structuredClone(applied.before));
    this.autoApplied.set(null);
  }
  readonly validation = computed(() => validateTracks(this.tracks()));
  /** The mixes of the project (timelines of clips rendered into one song each). */
  readonly mixes = computed(() => this.config()?.mixes ?? []);
  readonly mixValidation = computed(() => validateMixes(this.mixes(), this.tracks()));
  /** Server rejections that name a mix, from the last save. */
  readonly serverMixIssues = signal<ServerMixError[]>([]);
  readonly canSave = computed(
    () =>
      this.dirty() &&
      !this.saving() &&
      this.validation().valid &&
      this.mixValidation().valid,
  );

  // --- sources (songs that covers, repaints and extracts start from) -----------
  readonly sources = signal<SourceInfo[]>([]);
  /** The audio sources: pictures and videos of the project's scenes are not songs to transform. */
  readonly audioSources = computed(() => this.sources().filter((s) => (s.kind ?? 'audio') === 'audio'));
  readonly sourceBusy = signal(false);
  /** Why the last upload or copy failed, for the form to show. */
  readonly sourceError = signal<string | null>(null);

  // --- runs -----------------------------------------------------------------
  /** GPU indexes joined by commas, or empty to leave the GPU unpinned. */
  readonly gpu = signal('');
  readonly force = signal(false);
  readonly activeRun = signal<Run | null>(null);
  readonly stream = signal<RunStream | null>(null);
  readonly launching = signal(false);
  readonly launchHelp = signal<LaunchHelp | null>(null);
  readonly running = computed(() => {
    const s = this.stream();
    return this.launching() || (s !== null && !s.ended());
  });
  /** The track an active run is restricted to, if any. */
  readonly runOnly = signal<string | null>(null);

  // --- results ----------------------------------------------------------------
  readonly results = signal<MusicManifestEntry[]>([]);
  /** The mixes the last run rendered, from the manifest. */
  readonly mixResults = signal<MixManifestEntry[]>([]);
  readonly resultsLoaded = signal(false);
  /** Files that could not be played (deleted from out/). */
  readonly missing = signal<ReadonlySet<string>>(new Set());
  readonly pinned = signal<string | null>(null);

  /** The program the project's engine needs. */
  readonly engineProgram = computed(() => (this.settings().engine === 'server' ? 'ace-server' : 'ace-synth'));

  /** The engine or the models are not installed: say so before the user tries. */
  readonly setupIssue = computed(() => {
    const report = this.env.report();
    if (!report) return null;
    const synth = report.binaries.find((b) => b.name === this.engineProgram());
    const engine = !!synth && !synth.present;
    const models = (report.music ?? []).length === 0;
    return engine || models ? { engine, models } : null;
  });

  constructor() {
    // When the run ends, the songs it exported are on disk: read them.
    effect(() => {
      const s = this.stream();
      if (s && s.ended()) {
        untracked(() => void this.reloadResults());
      }
    });
  }

  async load(id: string): Promise<void> {
    if (id !== this.projectId()) {
      this.waves.set(new Map()); // the waveforms of another project
      this.waveAsked.clear();
    }
    this.projectId.set(id);
    this.lastAdded.set(null);
    this.loading.set(true);
    try {
      const res = await firstValueFrom(this.api.getConfig(id));
      this.config.set(res.parsed ?? null);
      this.resetHistory();
      this.warnings.set(res.warnings ?? []);
      this.dirty.set(false);
      this.serverErrors.set([]);
      if (this.isMusic()) {
        await Promise.all([this.reloadResults(), this.loadSources()]);
      }
    } finally {
      this.loading.set(false);
    }
  }

  // --- edits (every mutation marks dirty) -------------------------------------
  /** Earlier states of the project, newest last, and the ones undone (redo). Cleared when the project loads. */
  private past: ProjectConfig[] = [];
  private future: ProjectConfig[] = [];
  private lastKey: string | undefined;
  private lastAt = 0;
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);

  /**
   * Applies an edit. Successive edits with the same `coalesce` key within
   * COALESCE_MS (a clip dragged, a value typed) share one undo step.
   */
  private mutate(fn: (cfg: ProjectConfig) => ProjectConfig, coalesce?: string): void {
    const cfg = this.config();
    if (!cfg) return;
    const now = Date.now();
    if (!(coalesce !== undefined && coalesce === this.lastKey && now - this.lastAt < COALESCE_MS)) {
      this.past.push(cfg);
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
    }
    this.lastKey = coalesce;
    this.lastAt = now;
    this.future = [];
    if (!this.adding) this.lastAdded.set(null); // any other edit of the project ends the offer to take the last action back
    this.config.set(fn(structuredClone(cfg)));
    this.dirty.set(true);
    this.syncHistory();
  }

  private syncHistory(): void {
    this.canUndo.set(this.past.length > 0);
    this.canRedo.set(this.future.length > 0);
  }

  private resetHistory(): void {
    this.past = [];
    this.future = [];
    this.lastKey = undefined;
    this.syncHistory();
  }

  undo(): void {
    const cfg = this.config();
    const prev = this.past.pop();
    if (!cfg || !prev) return;
    this.future.push(cfg);
    this.restore(prev);
  }

  redo(): void {
    const cfg = this.config();
    const next = this.future.pop();
    if (!cfg || !next) return;
    this.past.push(cfg);
    this.restore(next);
  }

  private restore(state: ProjectConfig): void {
    this.lastKey = undefined; // the next edit starts a step of its own
    this.config.set(state);
    this.dirty.set(true);
    this.syncHistory();
  }

  updateTrack(index: number, patch: Partial<Track>): void {
    this.mutate((c) => {
      const next = { ...(c.tracks ?? [])[index], ...patch } as Track;
      // An unset optional is an absent key, never undefined/empty: absent means "let the model decide".
      for (const key of Object.keys(patch) as (keyof Track)[]) {
        if (next[key] === undefined || next[key] === null || next[key] === '') delete next[key];
      }
      const renamedFrom = (c.tracks ?? [])[index]?.id;
      (c.tracks ??= [])[index] = next;
      // A favorite follows its track when it is renamed.
      if (renamedFrom && next.id !== renamedFrom) {
        for (const f of c.favorites ?? []) if (f.track === renamedFrom) f.track = next.id;
      }
      return c;
    });
  }

  // --- favorites --------------------------------------------------------------
  readonly favorites = computed(() => this.config()?.favorites ?? []);

  /** Whether a song is marked: its track and the seed it was made with. */
  isFavorite(entry: MusicManifestEntry): boolean {
    return this.favorites().some((f) => f.track === entry.track_id && f.seed === entry.effective_seed);
  }

  /** How many of a track's songs on disk are marked. */
  favoriteCount(trackId: string): number {
    return this.results().filter((e) => e.track_id === trackId && this.isFavorite(e)).length;
  }

  /** Marks or unmarks a song. The mark is in the project file, so it needs saving like any edit. */
  toggleFavorite(entry: MusicManifestEntry): void {
    this.mutate((c) => {
      const list = (c.favorites ??= []);
      const at = list.findIndex((f) => f.track === entry.track_id && f.seed === entry.effective_seed);
      if (at >= 0) list.splice(at, 1);
      else list.push({ track: entry.track_id, seed: entry.effective_seed });
      if (list.length === 0) delete c.favorites;
      return c;
    });
  }

  /**
   * Chooses what a track does. Changing it drops the fields of the old task
   * (a field of another task is refused by the server), and a task drops the
   * duration, which the source decides.
   */
  setTask(index: number, task: MusicTask | ''): void {
    const t = this.tracks()[index];
    if (!t) return;
    this.mutate((c) => {
      const tr = (c.tracks ?? [])[index];
      for (const k of ['cover_strength', 'repaint_start', 'repaint_end', 'stem'] as const) delete tr[k];
      if (task === '') {
        delete tr.task;
        delete tr.source;
      } else {
        tr.task = task;
        delete tr.reference; // a reference is for new songs
        delete tr.duration_seconds;
        delete tr.use_lm;
      }
      return c;
    });
  }

  addTrack(): void {
    this.mutate((c) => {
      const tracks = (c.tracks ??= []);
      const taken = new Set(tracks.map((t) => t.id));
      let n = tracks.length + 1;
      while (taken.has(`pista_${n}`)) n++;
      tracks.push({ id: `pista_${n}`, prompt: '' });
      return c;
    });
  }

  removeTrack(index: number): void {
    this.mutate((c) => {
      const [gone] = c.tracks?.splice(index, 1) ?? [];
      if (gone && c.favorites) {
        c.favorites = c.favorites.filter((f) => f.track !== gone.id);
        if (c.favorites.length === 0) delete c.favorites;
      }
      return c;
    });
  }

  moveTrack(from: number, to: number): void {
    const n = this.tracks().length;
    if (from === to || to < 0 || to >= n) return;
    this.mutate((c) => {
      const [moved] = c.tracks!.splice(from, 1);
      c.tracks!.splice(to, 0, moved);
      return c;
    });
  }

  /** Chooses how the engine runs; the programs engine is the default and leaves no keys in the file. */
  setEngine(engine: 'cli' | 'server'): void {
    this.updateSettings(engine === 'server' ? { engine } : { engine: undefined, keep_loaded: undefined });
  }

  updateSettings(patch: Partial<MusicSettings>): void {
    this.mutate((c) => {
      const next = { ...(c.defaults.music ?? {}), ...patch };
      for (const key of Object.keys(patch) as (keyof MusicSettings)[]) {
        if (next[key] === undefined || next[key] === null || next[key] === '') delete next[key];
      }
      if (Object.keys(next).length === 0) delete c.defaults.music;
      else c.defaults.music = next;
      return c;
    });
  }

  // --- mixes ------------------------------------------------------------------
  addMix(): void {
    this.mutate((c) => {
      const mixes = (c.mixes ??= []);
      const taken = new Set([...mixes.map((m) => m.id), ...(c.tracks ?? []).map((t) => t.id)]);
      let n = mixes.length + 1;
      while (taken.has(`mezcla_${n}`)) n++;
      mixes.push({ id: `mezcla_${n}`, clips: [] });
      return c;
    });
  }

  removeMix(index: number): void {
    this.mutate((c) => {
      c.mixes?.splice(index, 1);
      if (c.mixes?.length === 0) delete c.mixes;
      return c;
    });
  }

  /**
   * Changes the master settings of a mix; a volume of 1 and "normalize" off are
   * the defaults and leave no key. A volume dragged or typed in one go is one undo step.
   */
  updateMix(index: number, patch: { gain?: number | undefined; normalize?: boolean | undefined }): void {
    this.mutate((c) => {
      const mix = (c.mixes ?? [])[index];
      if (!mix) return c;
      if ('gain' in patch) {
        if (patch.gain === undefined || patch.gain === 1) delete mix.gain;
        else mix.gain = patch.gain;
      }
      if ('normalize' in patch) {
        if (patch.normalize) mix.normalize = true;
        else delete mix.normalize;
      }
      return c;
    }, `mix:${index}`);
  }

  /** Adds a copy of a mix right after it, named after it ("<id>_copia", numbered when taken). */
  duplicateMix(index: number): void {
    this.mutate((c) => {
      const mixes = c.mixes ?? [];
      const source = mixes[index];
      if (!source) return c;
      const taken = new Set([...mixes.map((m) => m.id), ...(c.tracks ?? []).map((t) => t.id)]);
      let id = `${source.id}_copia`;
      for (let n = 2; taken.has(id); n++) id = `${source.id}_copia${n}`;
      mixes.splice(index + 1, 0, { ...structuredClone(source), id });
      return c;
    });
  }

  renameMix(index: number, id: string): void {
    this.mutate((c) => {
      (c.mixes ?? [])[index].id = id;
      return c;
    });
  }

  addClip(mix: number, clip: MixClip): void {
    this.mutate((c) => {
      (c.mixes ?? [])[mix].clips.push(clip);
      return c;
    });
  }

  removeClip(mix: number, clip: number): void {
    this.mutate((c) => {
      (c.mixes ?? [])[mix].clips.splice(clip, 1);
      return c;
    });
  }

  /** Changes a clip; a key set to undefined goes back to its default. */
  updateClip(mix: number, clip: number, patch: Partial<MixClip>): void {
    this.mutate((c) => {
      const mixes = c.mixes ?? [];
      const next: MixClip = { ...mixes[mix].clips[clip], ...patch };
      for (const key of Object.keys(patch) as (keyof MixClip)[]) {
        if (next[key] === undefined || next[key] === null) delete next[key];
      }
      mixes[mix].clips[clip] = next;
      return c;
    }, `clip:${mix}:${clip}`);
  }

  /**
   * Adds a mix that plays the given tracks one after another, in the order
   * given: each starts when the previous song ends (a track without a song yet
   * starts where the last one ended). Returns the new mix's index.
   */
  mixFromTracks(trackIds: string[]): number {
    let index = -1;
    this.mutate((c) => {
      const mixes = (c.mixes ??= []);
      const taken = new Set([...mixes.map((m) => m.id), ...(c.tracks ?? []).map((t) => t.id)]);
      let n = mixes.length + 1;
      while (taken.has(`mezcla_${n}`)) n++;
      let at = 0;
      const clips: MixClip[] = trackIds.map((track) => {
        const clip: MixClip = { track };
        if (at > 0) clip.start = at;
        const seconds = this.resultsOf(track).find((e) => e.variant === 0)?.audio_seconds;
        if (seconds) at = Math.round((at + seconds) * 10) / 10;
        return clip;
      });
      mixes.push({ id: `mezcla_${n}`, clips });
      index = mixes.length - 1;
      return c;
    });
    return index;
  }

  /** Changes several clips of a mix in one step (one undo). */
  updateClips(mix: number, changes: { index: number; patch: Partial<MixClip> }[]): void {
    if (changes.length === 0) return;
    this.mutate((c) => {
      const clips = (c.mixes ?? [])[mix].clips;
      for (const { index, patch } of changes) clips[index] = { ...clips[index], ...patch };
      return c;
    });
  }

  /** The exported file a clip plays, relative to the project, or null while its track has no song yet. */
  clipFile(clip: MixClip): string | null {
    if (clip.file) return `sources/${clip.file}`;
    if (!clip.track) return null;
    const variant = (clip.variant ?? 1) - 1;
    return this.resultsOf(clip.track).find((e) => e.variant === variant)?.file ?? null;
  }

  private readonly peaksCache = new Map<string, Promise<PeaksResponse | null>>();

  /** Peaks of a project audio, once per file until the songs are read again; null when it cannot be read. */
  peaks(file: string): Promise<PeaksResponse | null> {
    let p = this.peaksCache.get(file);
    if (!p) {
      p = firstValueFrom(this.api.getPeaks(this.projectId(), file)).catch(() => null);
      this.peaksCache.set(file, p);
    }
    return p;
  }

  /**
   * The waveform of every song of the list, by file, version of the file and
   * number of buckets. A value is the peaks, null when they could not be read
   * (remembered, so a row does not ask again until it is told to) and absent
   * while nobody asked.
   */
  readonly waves = signal<ReadonlyMap<string, PeaksResponse | null>>(new Map());
  private readonly waveAsked = new Set<string>();
  private readonly waveQueue: (() => void)[] = [];
  private waveActive = 0;

  /** The key of a waveform: a regenerated song has another `version` (its content hash), so it is drawn again. */
  static waveKey(file: string, version: string | undefined, buckets: number): string {
    return `${file}|${version ?? ''}|${buckets}`;
  }

  /** The peaks of a song if they are here: undefined while loading or before asking, null when they cannot be read. */
  wave(file: string, version?: string, buckets = WAVE_BUCKETS): PeaksResponse | null | undefined {
    return this.waves().get(MusicStore.waveKey(file, version, buckets));
  }

  /** Asks for the peaks of a song once, at most {@link WAVE_CONCURRENCY} requests at a time; the answer lands in {@link waves}. */
  loadWave(file: string, version?: string, buckets = WAVE_BUCKETS): void {
    const key = MusicStore.waveKey(file, version, buckets);
    if (this.waveAsked.has(key)) return;
    this.waveAsked.add(key);
    const projectId = this.projectId();
    this.waveQueue.push(() => {
      this.waveActive++;
      new Promise<PeaksResponse>((resolve, reject) => this.api.getPeaks(projectId, file, buckets).subscribe({ next: resolve, error: reject }))
        .catch(() => null)
        .then((peaks) => {
          if (projectId === this.projectId()) this.waves.update((m) => new Map(m).set(key, peaks));
        })
        .finally(() => {
          this.waveActive--;
          this.nextWave();
        });
    });
    this.nextWave();
  }

  /** Forgets that the peaks of a song could not be read, so the next {@link loadWave} asks again. */
  retryWave(file: string, version?: string, buckets = WAVE_BUCKETS): void {
    const key = MusicStore.waveKey(file, version, buckets);
    if (this.waves().get(key) !== null) return;
    this.waves.update((m) => {
      const next = new Map(m);
      next.delete(key);
      return next;
    });
    this.waveAsked.delete(key);
  }

  private nextWave(): void {
    while (this.waveActive < WAVE_CONCURRENCY) {
      const start = this.waveQueue.shift();
      if (!start) return;
      start();
    }
  }

  private readonly loudnessCache = new Map<string, Promise<number | null>>();

  /** Integrated loudness (LUFS) of a project audio; null when it is silent or cannot be read. Asked once per file until the songs are read again. */
  loudness(file: string): Promise<number | null> {
    let p = this.loudnessCache.get(file);
    if (!p) {
      p = firstValueFrom(this.api.getLoudness(this.projectId(), file))
        .then((r) => r.lufs)
        .catch(() => null);
      this.loudnessCache.set(file, p);
    }
    return p;
  }

  private readonly phaseCache = new Map<string, Promise<number | null>>();

  /**
   * Where the beats of a song fall in its file, given its tempo: the second of
   * its first beat (under one beat). Null when the audio has no clear pulse or
   * cannot be read. Asked once per song and tempo until the songs are read again.
   */
  beatPhase(file: string, bpm: number): Promise<number | null> {
    const key = `${file}|${bpm}`;
    let p = this.phaseCache.get(key);
    if (!p) {
      p = firstValueFrom(this.api.getPeaks(this.projectId(), file, undefined, bpm))
        .then((r) => r.beat_offset ?? null)
        .catch(() => null);
      this.phaseCache.set(key, p);
    }
    return p;
  }

  /** The rendered file of a mix when the last run produced it, otherwise null. */
  mixResult(id: string): MixManifestEntry | null {
    return this.mixResults().find((e) => e.id === id) ?? null;
  }

  /**
   * A song the mix was rendered from has been regenerated since: its current
   * hash differs from the one the mix recorded. False when the mix was never
   * rendered or its manifest predates the hashes.
   */
  mixOutdated(id: string): boolean {
    const r = this.mixResult(id);
    if (!r?.inputs) return false;
    const songs = new Map(this.results().map((e) => [e.file, e.sha256]));
    return r.inputs.some((i) => {
      const now = songs.get(i.file);
      return now !== undefined && i.sha256 !== now;
    });
  }

  /** Renders one mix: unsaved edits are saved first and the run is restricted to it. */
  async mixNow(id: string): Promise<void> {
    await this.launch(id);
  }

  // --- persistence ------------------------------------------------------------
  async save(): Promise<boolean> {
    const cfg = this.config();
    if (!cfg) return false;
    this.saving.set(true);
    this.serverErrors.set([]);
    this.serverMixIssues.set([]);
    try {
      const yaml = toMusicYaml(cfg);
      const res = await firstValueFrom(this.api.saveConfig(this.projectId(), yaml));
      this.warnings.set(res.warnings ?? []);
      this.dirty.set(false);
      return true;
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        const message = (err.error as ApiErrorBody | undefined)?.error?.message ?? err.message;
        this.serverErrors.set(serverTrackErrors(message));
        this.serverMixIssues.set(serverMixErrors(message));
        return false;
      }
      throw err;
    } finally {
      this.saving.set(false);
    }
  }

  // --- runs -------------------------------------------------------------------
  /** Creates the whole project, or only `only` (a track id). Unsaved edits are saved first. */
  async launch(only?: string): Promise<boolean> {
    if (this.running()) return false;
    this.launchHelp.set(null);
    if (this.dirty()) {
      if (!this.canSave() || !(await this.save())) return false;
    }
    this.launching.set(true);
    try {
      const res = await firstValueFrom(
        this.api.launchRun(
          this.projectId(),
          {
            only,
            force: this.force() || undefined,
            gpu: this.gpu() || undefined,
            keep_tmp: true,
          },
          true,
        ),
      );
      this.runOnly.set(only ?? null);
      this.activeRun.set(res.run);
      this.stream.set(this.streams.connect(res.run.id));
      return true;
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        this.launchHelp.set(helpFor((err.error as ApiErrorBody | undefined)?.error?.message ?? err.message));
        return false;
      }
      throw err;
    } finally {
      this.launching.set(false);
    }
  }

  /** Where a queue of tracks being created has got to: tracks made out of those to make. Null when there is none. */
  readonly queue = signal<{ done: number; total: number } | null>(null);

  /**
   * Creates the given tracks one after another, each alone (a run takes one
   * track), saving the project first. It stops at the first run that does not
   * succeed or is refused, leaving the rest added and not created.
   */
  async createTracks(ids: readonly string[]): Promise<void> {
    if (ids.length === 0 || this.running() || this.queue()) return;
    this.queue.set({ done: 0, total: ids.length });
    try {
      for (const id of ids) {
        if (!(await this.launch(id))) return;
        const stream = this.stream();
        if (!stream) return;
        await this.whenEnded(stream);
        if (stream.state()?.state !== 'succeeded') return;
        this.queue.update((q) => (q ? { ...q, done: q.done + 1 } : q));
      }
    } finally {
      this.queue.set(null);
    }
  }

  private whenEnded(stream: RunStream): Promise<void> {
    return new Promise((resolve) => {
      const ref = effect(
        () => {
          if (!stream.ended()) return;
          untracked(() => resolve());
          ref.destroy();
        },
        { injector: this.injector },
      );
    });
  }

  async cancel(): Promise<void> {
    const run = this.activeRun();
    if (run) await firstValueFrom(this.api.cancelRun(run.id));
  }

  // --- sources ----------------------------------------------------------------
  async loadSources(): Promise<void> {
    try {
      this.sources.set((await firstValueFrom(this.api.listSources(this.projectId()))).sources);
    } catch {
      this.sources.set([]);
    }
  }

  /** A name for a new source that no existing one has. */
  freeSourceName(wanted: string): string {
    return freeSourceName(wanted, this.sources().map((s) => s.name));
  }

  /** Uploads a file from the computer and returns the name it was stored under, or null. */
  async uploadSource(file: File): Promise<string | null> {
    return this.addSource(() => {
      const name = uploadSourceName(file.name, this.sources().map((s) => s.name));
      return firstValueFrom(this.api.uploadSource(this.projectId(), name, file)).then((r) => r.name);
    });
  }

  /** Uploads a video and keeps it as a video, so its picture can be described; returns the name or null. */
  async uploadKeptVideo(file: File): Promise<string | null> {
    return this.addSource(() => {
      const name = freeSourceName(file.name, this.sources().map((s) => s.name));
      return firstValueFrom(this.api.uploadClip(this.projectId(), name, file)).then((r) => r.name);
    });
  }

  /**
   * Adds a track that lengthens an exported song by `extra` seconds and returns
   * its index (-1 when it could not): a repaint of the song's last seconds that
   * runs past its end, which the engine fills with a continuation. The song is
   * copied to the sources first, so the track keeps working if it is created
   * again. The new track starts from the original's style and lyrics (the ones
   * actually sung), to be edited before creating it; nothing is saved.
   */
  async extendSong(entry: MusicManifestEntry, extra: number): Promise<number> {
    const length = entry.audio_seconds ?? entry.duration_seconds;
    if (!length || !(extra >= EXTEND_MIN_SECONDS && extra <= EXTEND_MAX_SECONDS)) return -1;
    const round = (v: number) => Math.round(v * 10) / 10;
    const id = await this.repaintTrack(entry, '_larga', {
      repaint_start: round(Math.max(0, length - EXTEND_OVERLAP_SECONDS)),
      repaint_end: round(length + extra),
    });
    return id ? this.tracks().findIndex((t) => t.id === id) : -1;
  }

  /**
   * Adds a track that repaints the part `start` to `end` seconds of an exported
   * song and returns its id (null when it could not). Like {@link extendSong} the
   * song is copied to the sources and the track starts from the style and the
   * lyrics that were sung; nothing is saved: the caller creates it. The id says
   * the variant when the song is one of several of its track.
   */
  async repaintSong(entry: MusicManifestEntry, range: { start: number; end: number }): Promise<string | null> {
    if (!(range.start >= 0 && range.end - range.start >= 0.1)) return null;
    return this.repaintTrack(entry, '_repintado', { repaint_start: range.start, repaint_end: range.end }, true);
  }

  /** `_v<n>` when `entry` is one of several variants of its track, so the tracks made from it say which; empty otherwise. */
  private variantTag(entry: MusicManifestEntry): string {
    const several = (this.tracks().find((t) => t.id === entry.track_id)?.variants ?? 1) > 1 || this.resultsOf(entry.track_id).length > 1;
    return several ? `_v${entry.variant + 1}` : '';
  }

  /** The tracks a one-step action has just added and the source it copied for them, to take back; null once the list is edited otherwise. */
  readonly lastAdded = signal<{ ids: string[]; source: string | null } | null>(null);
  private adding = false;

  /** The track of a repaint of `entry`, named `<track>[_v<n>]<suffix>` (numbered when taken), from the original's style and lyrics. */
  private async repaintTrack(
    entry: MusicManifestEntry,
    suffix: string,
    region: Pick<Track, 'repaint_start' | 'repaint_end'>,
    named = false,
  ): Promise<string | null> {
    const name = await this.adoptExport(entry);
    if (!name) return null;
    const origin = this.tracks().find((t) => t.id === entry.track_id);
    const base = `${entry.track_id}${named ? this.variantTag(entry) : ''}${suffix}`;
    let made: string | null = null;
    this.adding = named;
    try {
      this.mutate((c) => {
        const tracks = (c.tracks ??= []);
        const taken = new Set([...tracks.map((t) => t.id), ...(c.mixes ?? []).map((m) => m.id)]);
        let id = base;
        for (let n = 2; taken.has(id); n++) id = `${base}${n}`;
        const track: Track = { id, prompt: origin?.prompt ?? entry.caption, task: 'repaint', source: name, ...region };
        if (entry.instrumental || origin?.instrumental) track.instrumental = true;
        else {
          const lyrics = entry.lyrics_sung || origin?.lyrics;
          if (lyrics) track.lyrics = lyrics;
        }
        const language = origin?.vocal_language ?? entry.vocal_language;
        if (language) track.vocal_language = language;
        if (origin?.vocals) track.vocals = origin.vocals;
        tracks.push(track);
        made = id;
        return c;
      });
    } finally {
      this.adding = false;
    }
    if (named && made) this.lastAdded.set({ ids: [made], source: name });
    return made;
  }

  /** The synthesis models installed that can separate instruments: every one but the turbo ones. */
  readonly separationModels = computed(() => synthesisModels(this.env.report()?.music ?? []).filter((n) => !/turbo/i.test(n)));
  /** The project's own synthesis model is a turbo one, which cannot separate: the tracks added would be refused until it is changed. */
  readonly synthIsTurbo = computed(() => /turbo/i.test(this.settings().synth_model ?? DEFAULT_SYNTH_MODEL));

  /**
   * Adds one `extract` track per stem, all from the same audio, and returns
   * their ids (none when nothing was added): a song of the results (copied to
   * the sources first) or a source that is already there. Each track is named
   * after the song (and its variant when it has several) and the stem, numbered
   * when taken. It adds nothing when no synthesis model other than the turbo is
   * installed, since the engine could not run them. Nothing is saved: the caller creates them.
   */
  async separateSong(from: MusicManifestEntry | SourceInfo, stems: readonly string[]): Promise<string[]> {
    const wanted = STEMS.map((s) => s.value).filter((v) => stems.includes(v));
    if (wanted.length === 0 || this.separationModels().length === 0) return [];
    const entry = 'track_id' in from ? from : null;
    const source = entry ? await this.adoptExport(entry) : (from as SourceInfo).name;
    if (!source) return [];
    const base = entry
      ? `${entry.track_id}${this.variantTag(entry)}`
      : source.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[^A-Za-z0-9]+/, '') || 'cancion';
    const prompt = (entry && (this.tracks().find((t) => t.id === entry.track_id)?.prompt ?? entry.caption)) || base;
    const ids: string[] = [];
    this.adding = true;
    try {
      this.mutate((c) => {
        const tracks = (c.tracks ??= []);
        const taken = new Set([...tracks.map((t) => t.id), ...(c.mixes ?? []).map((m) => m.id)]);
        for (const stem of wanted) {
          let id = `${base}_${stem}`;
          for (let n = 2; taken.has(id); n++) id = `${base}_${stem}${n}`;
          taken.add(id);
          tracks.push({ id, prompt, task: 'extract', source, stem });
          ids.push(id);
        }
        return c;
      });
    } finally {
      this.adding = false;
    }
    this.lastAdded.set({ ids, source: entry ? source : null });
    return ids;
  }

  /**
   * Switches the project to the Maximum quality level with the SFT model that
   * is installed (extraction needs a model that is not the turbo one). False
   * when there is none.
   */
  useMaximumLevel(): boolean {
    const model = this.separationModels().find((n) => /sft/i.test(n)) ?? this.separationModels()[0];
    if (!model) return false;
    const { inference_steps, shift } = tierSettings('max');
    this.updateSettings({ synth_model: model, inference_steps, shift });
    return true;
  }

  /**
   * Takes back what the last one-step action added: its tracks, their songs and
   * the source copied for them when nothing else uses it; then saves. The song
   * they came from is never touched. Returns whether it was done.
   */
  async removeAdded(): Promise<boolean> {
    const added = this.lastAdded();
    if (!added || this.running()) return false;
    for (const id of added.ids) {
      for (const e of this.resultsOf(id)) await this.deleteSong(e);
    }
    this.mutate((c) => {
      c.tracks = (c.tracks ?? []).filter((t) => !added.ids.includes(t.id));
      if (c.favorites) {
        c.favorites = c.favorites.filter((f) => !added.ids.includes(f.track));
        if (c.favorites.length === 0) delete c.favorites;
      }
      return c;
    });
    // Saved first: the server refuses to delete a source that the saved project still uses.
    const saved = await this.save();
    const source = added.source;
    const used = !!source && (this.tracks().some((t) => t.source === source || t.reference === source) || this.mixes().some((m) => m.clips.some((k) => k.file === source)));
    if (saved && source && !used) {
      try {
        await firstValueFrom(this.api.deleteSource(this.projectId(), source));
      } catch {
        // a source that cannot be deleted stays; the project is still right
      }
      await this.loadSources();
    }
    this.lastAdded.set(null);
    return saved;
  }

  /** Copies an exported song as a source and returns its name, or null. */
  async adoptExport(entry: MusicManifestEntry): Promise<string | null> {
    return this.addSource(() => {
      const name = this.freeSourceName(entry.file.split('/').pop() ?? 'origen.mp3');
      return firstValueFrom(this.api.copySource(this.projectId(), entry.file, name)).then((r) => r.name);
    });
  }

  private async addSource(run: () => Promise<string>): Promise<string | null> {
    this.sourceBusy.set(true);
    this.sourceError.set(null);
    try {
      const name = await run();
      await this.loadSources();
      return name;
    } catch (err) {
      const message =
        err instanceof HttpErrorResponse ? ((err.error as ApiErrorBody | undefined)?.error?.message ?? err.message) : String(err);
      this.sourceError.set(message);
      return null;
    } finally {
      this.sourceBusy.set(false);
    }
  }

  // --- results ----------------------------------------------------------------
  async reloadResults(): Promise<void> {
    const cfg = this.config();
    if (!cfg) return;
    try {
      const m = await firstValueFrom(this.api.getMusicManifest(this.projectId(), cfg.project));
      // The manifest is the single source: a run restricted to one track keeps the
      // others' entries in it (the server merges them), so there is nothing to patch here.
      this.results.set(m.tracks);
      this.mixResults.set(m.mixes ?? []);
      this.missing.set(new Set());
      this.peaksCache.clear(); // a regenerated song has other peaks
      this.phaseCache.clear();
      this.loudnessCache.clear();
    } catch {
      // Not produced yet: the empty state explains.
    } finally {
      this.resultsLoaded.set(true);
    }
  }

  /** The exported variants of one track, in variant order. */
  resultsOf(trackId: string): MusicManifestEntry[] {
    return this.results()
      .filter((e) => e.track_id === trackId)
      .sort((a, b) => a.variant - b.variant);
  }

  markMissing(file: string): void {
    this.missing.update((s) => new Set(s).add(file));
  }

  /**
   * How many clips of mixes use another variant of this track than the one kept
   * (they would point at a song that will no longer exist).
   */
  keepVariantDrops(entry: MusicManifestEntry): number {
    const kept = entry.variant + 1;
    return this.mixes().reduce((n, m) => n + m.clips.filter((c) => c.track === entry.track_id && (c.variant ?? 1) !== kept).length, 0);
  }

  /**
   * Keeps one variant of a track and drops the rest: the track gets that
   * variant's seed and a single variant, so the next run finds the song in the
   * cache (the same request) and exports it as the track's only file, removing
   * the other variants' files. The mix clips that played it become the track's
   * first variant, and the ones that played another variant are removed. Saves,
   * then creates the track (instant: nothing is generated).
   */
  async keepVariant(entry: MusicManifestEntry): Promise<void> {
    const index = this.tracks().findIndex((t) => t.id === entry.track_id);
    if (index < 0) return;
    const kept = entry.variant + 1;
    this.mutate((c) => {
      const track = (c.tracks ?? [])[index];
      track.seed = entry.effective_seed;
      delete track.variants;
      for (const mix of c.mixes ?? []) {
        mix.clips = mix.clips.filter((clip) => clip.track !== entry.track_id || (clip.variant ?? 1) === kept);
        for (const clip of mix.clips) if (clip.track === entry.track_id) delete clip.variant;
      }
      return c;
    });
    if (await this.save()) await this.launch(entry.track_id);
  }

  /** Deletes one exported song from the project (its file and manifest entry); the track itself stays. */
  async deleteSong(entry: MusicManifestEntry): Promise<void> {
    try {
      await firstValueFrom(this.api.deleteSong(this.projectId(), entry.track_id, entry.variant));
    } catch {
      // the error interceptor explains it (e.g. a run became active)
    }
    await this.reloadResults();
  }

  /** Writes the variant's effective seed into its track and saves, so the next run reproduces it. */
  async pinSeed(entry: MusicManifestEntry): Promise<void> {
    const index = this.tracks().findIndex((t) => t.id === entry.track_id);
    if (index < 0) return;
    this.updateTrack(index, { seed: entry.effective_seed });
    if (await this.save()) {
      this.pinned.set(`${entry.track_id} ← seed ${entry.effective_seed}`);
    }
  }
}

/** Reads a refusal to launch and says which part of the setup it points at. */
export function helpFor(message: string): LaunchHelp {
  const engine = /required binary|ace-(lm|synth)/i.test(message);
  const models = /music (synthesis|language) model|text encoder|VAE|models\/music|\.gguf/i.test(message);
  // An unrecognised refusal still gets both pointers: it is some part of the setup.
  return { message, engine: engine || !models, models: models || !engine };
}
