import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

import { KeptClip, PictureUploadResult, AnimateEngine, AnimateSettings, ApiErrorBody, BackgroundMusic, CatalogEntry, CatalogPreset, ModelSet, MotionDefaults, MotionDesign, ProjectConfig, Scene, SourceInfo } from '../core/api.models';
import { ApiService } from '../core/api.service';
import { freeSourceName, pictureUploadName, uploadSourceName } from '../core/source-name';
import { toMusicYaml } from '../music/music-yaml';
import { toYaml } from '../shared/project-yaml';
import {
  SceneTierUndo,
  Tier,
  TierOverrides,
  TierUndo,
  applySceneTier,
  applyEditEntry,
  EditEngine,
  editEngineOf,
  editEngineOfSet,
  pickEditEntry,
  applyStyleEntry,
  applyTier,
  pickStyleEntry,
  clearSceneQuality,
  undoSceneTier,
  undoTier,
  AnimateEngineUndo,
  applyAnimateEngine,
  applyMiniMaxMode,
  undoAnimateEngine,
} from './quality-tiers';
import { AutoPlan, describePlan, durationText } from './auto-plan';
import { MotionCatalogStore } from '../core/motion-catalog.store';
import { sceneIdFromServerError, validateConfig } from './scene-validators';

/** What an automatically applied preset overwrote. */
export interface PresetUndo {
  steps: number;
  resolution: string;
  cfg_scale?: number;
}

/**
 * Editor state for one project: the parsed config as the editable model,
 * client-side validation mirroring the Go rules, dirty tracking, and the
 * save flow where the server's validation remains authoritative — its
 * message is attached to the scene it names.
 */
/** A shot described from a reference clip, ready to become a scene. */
export interface NewShotScene {
  prompt: string;
  motion?: string;
  /** The shot's length in seconds. */
  seconds: number;
  /** The vision model that described it. */
  model: string;
}

@Injectable()
export class EditorStore {
  private readonly api = inject(ApiService);
  private readonly motionCatalog = inject(MotionCatalogStore);

  readonly projectId = signal('');
  readonly config = signal<ProjectConfig | null>(null);
  readonly loading = signal(false);
  readonly dirty = signal(false);
  /** Values a preset overwrote when it was applied by choosing a model; the note's "Undo" restores them. */
  readonly presetApplied = signal<PresetUndo | null>(null);
  /** What the last quality level wrote and overwrote; the note's "Undo" restores it. */
  readonly tierApplied = signal<{ tier: Tier; note: string[]; undo: TierUndo } | null>(null);
  /** What "I'm lazy" wrote: a line per thing and the project as it was, so Undo restores it whole. */
  readonly autoApplied = signal<{ note: string[]; before: ProjectConfig } | null>(null);
  /** What choosing the animation engine overwrote; the animation panel's note offers "Undo". */
  readonly engineApplied = signal<{ note: string[]; undo: AnimateEngineUndo; hadBlock: boolean; moduleMissing: boolean; miniMaxMissing: boolean; ltxMissing: boolean } | null>(null);
  /** What the last level given to one scene (or «Como el proyecto») changed; that scene's note offers "Undo". */
  readonly sceneTierApplied = signal<{ id: string; note: string[]; undo: SceneTierUndo } | null>(null);
  /** The model catalog, read once: the levels start from the preset of the project's model. */
  readonly catalog = signal<CatalogEntry[]>([]);
  private catalogRequested = false;
  readonly saving = signal(false);
  readonly warnings = signal<string[]>([]);
  /** Server-side validation rejection (authoritative). */
  readonly serverError = signal<{ message: string; sceneId: string | null } | null>(null);
  /** Index of the scene being edited in the detail panel. */
  readonly selected = signal(0);

  readonly validation = computed(() => {
    const cfg = this.config();
    return cfg ? validateConfig(cfg, this.motionCatalog.available() ? this.motionCatalog.parts() : undefined) : null;
  });

  /**
   * The project is being switched to music: the scenes stay in the model until
   * the user saves, so discarding (or choosing another mode) brings them back.
   */
  readonly toMusic = computed(() => this.config()?.output.mode === 'music');

  /** The soundtrack was chosen but has nothing to play yet: saving would silently drop it. */
  readonly bgmIncomplete = computed(() => {
    const b = this.config()?.bgm;
    return !!b && !(b.prompt ?? '').trim() && !b.file;
  });

  readonly canSave = computed(
    () => this.dirty() && !this.saving() && (this.validation()?.valid ?? false) && !this.bgmIncomplete(),
  );

  // --- sources (audio files the soundtrack can use) -----------------------------
  readonly sources = signal<SourceInfo[]>([]);
  readonly sourcesLoaded = signal(false);
  readonly sourceBusy = signal(false);
  readonly sourceError = signal<string | null>(null);

  async load(id: string): Promise<void> {
    this.projectId.set(id);
    this.loading.set(true);
    try {
      const res = await firstValueFrom(this.api.getConfig(id));
      this.config.set(res.parsed ?? null);
      this.warnings.set(res.warnings ?? []);
      this.dirty.set(false);
      this.presetApplied.set(null);
      this.tierApplied.set(null);
      this.engineApplied.set(null);
      this.sceneTierApplied.set(null);
      this.serverError.set(null);
      this.selected.set(0);
    } finally {
      this.loading.set(false);
    }
  }

  /** The project's model is an editing one (FLUX.1 Kontext): the scenes' starting pictures are edited by instruction. */
  readonly editing = computed(() => !!this.config()?.defaults.model_set?.edit);
  /** The installed editing models (Fast and Precise), when the catalog is read. */
  readonly editEntries = computed(() => this.catalog().filter((e) => e.kind === 'model' && e.edit && e.installed));
  /** The editing model a project switches to: the fast one, or the only one installed. */
  readonly editEntry = computed(() => pickEditEntry(this.catalog()));
  /** The engines of Retoque installed, to choose between when there are two. */
  readonly editEngines = computed(() => this.editEntries().map(editEngineOf));
  /** The engine the project edits with now; null when it does not edit. */
  readonly editEngine = computed(() => editEngineOfSet(this.config()));
  /** What the project's image model was before it became an editing one, to go back to it. */
  private editBackup: ProjectConfig['defaults'] | null = null;

  /**
   * Switches the project between starting a generation from the scenes' pictures (its own image model, strength) and
   * editing them by instruction (the editing model). It is the project's model that changes, so it goes for every scene.
   */
  setEditing(on: boolean, engine?: EditEngine): void {
    const cfg = this.config();
    if (!cfg || on === this.editing()) return;
    if (on) {
      const entry = pickEditEntry(this.catalog(), engine);
      if (!entry) return;
      this.editBackup = structuredClone(cfg.defaults);
      this.presetApplied.set(null);
      this.tierApplied.set(null);
      this.mutate((c) => applyEditEntry(c, entry));
      return;
    }
    const back = this.editBackup;
    this.editBackup = null;
    this.mutate((c) => {
      if (back) {
        c.defaults.model = back.model;
        if (back.model_set) c.defaults.model_set = back.model_set;
        else delete c.defaults.model_set;
        c.defaults.steps = back.steps;
        c.defaults.sampler = back.sampler;
        return c;
      }
      // Nothing remembered (the page was reloaded while editing): the best generation model installed.
      const catalog = this.catalog();
      const entry = pickStyleEntry(catalog, 'photo') ?? pickStyleEntry(catalog, 'general') ?? pickStyleEntry(catalog, 'anime');
      return entry ? applyStyleEntry(c, entry) : c;
    });
  }

  /**
   * Changes the engine of a project that edits: its model becomes the other editing model, and its scenes and their
   * instructions stay as they are. What the project had before editing is kept for going back.
   */
  setEditEngine(engine: EditEngine): void {
    if (!this.editing() || this.editEngine() === engine) return;
    const entry = pickEditEntry(this.catalog(), engine);
    if (!entry || editEngineOf(entry) !== engine) return;
    this.mutate((c) => applyEditEntry(c, entry));
  }

  /** Reads the model catalog once; a failure leaves it empty (the levels then start from sd's defaults). */
  async loadCatalog(): Promise<void> {
    if (this.catalogRequested) return;
    this.catalogRequested = true;
    try {
      this.catalog.set((await firstValueFrom(this.api.getCatalog())).entries);
    } catch {
      this.catalog.set([]);
    }
  }

  /** The audio sources (music for the soundtrack): pictures and videos are listed separately. */
  readonly audioSources = computed(() => this.sources().filter((s) => (s.kind ?? 'audio') === 'audio'));
  /** The videos a scene can use as its clip, and the ones no scene uses (left over, to delete). */
  readonly videoSources = computed(() => this.sources().filter((s) => s.kind === 'video'));
  readonly unusedVideos = computed(() => this.videoSources().filter((s) => (s.used_by ?? []).length === 0));
  /** The clips the other projects kept, to take one as a scene's own. */
  readonly keptClips = signal<KeptClip[]>([]);

  async loadKeptClips(): Promise<void> {
    try {
      this.keptClips.set((await firstValueFrom(this.api.listKeptClips(this.projectId()))).clips);
    } catch {
      this.keptClips.set([]);
    }
  }

  private sourceFailure(err: unknown): null {
    this.sourceError.set(
      err instanceof HttpErrorResponse ? ((err.error as ApiErrorBody | undefined)?.error?.message ?? err.message) : String(err),
    );
    return null;
  }

  /** Uploads a video as a scene's own clip; returns the stored name or null (the reason is in sourceError). */
  async uploadClip(file: File): Promise<string | null> {
    this.sourceBusy.set(true);
    this.sourceError.set(null);
    try {
      const name = freeSourceName(file.name, this.sources().map((s) => s.name));
      const res = await firstValueFrom(this.api.uploadClip(this.projectId(), name, file));
      await this.loadSources();
      return res.name;
    } catch (err) {
      return this.sourceFailure(err);
    } finally {
      this.sourceBusy.set(false);
    }
  }

  /** Copies the clip another project kept into this project's sources; returns the copy's name or null. */
  async useKeptClip(clip: KeptClip): Promise<string | null> {
    this.sourceBusy.set(true);
    this.sourceError.set(null);
    try {
      const res = await firstValueFrom(this.api.copyKeptClip(this.projectId(), clip.project, clip.scene, clip.kind ?? 'clip'));
      await this.loadSources();
      return res.name;
    } catch (err) {
      return this.sourceFailure(err);
    } finally {
      this.sourceBusy.set(false);
    }
  }

  /** Deletes a source nobody uses; the reason of a refusal is in sourceError. */
  async deleteSource(name: string): Promise<void> {
    this.sourceError.set(null);
    try {
      await firstValueFrom(this.api.deleteSource(this.projectId(), name));
    } catch (err) {
      this.sourceFailure(err);
    }
    await this.loadSources();
  }

  async loadSources(): Promise<void> {
    try {
      this.sources.set((await firstValueFrom(this.api.listSources(this.projectId()))).sources);
    } catch {
      this.sources.set([]);
    } finally {
      this.sourcesLoaded.set(true);
    }
  }

  /** Uploads an audio file and returns the name it was stored under, or null (the reason is in sourceError). */
  async uploadSource(file: File): Promise<string | null> {
    this.sourceBusy.set(true);
    this.sourceError.set(null);
    try {
      const name = uploadSourceName(file.name, this.sources().map((s) => s.name));
      const res = await firstValueFrom(this.api.uploadSource(this.projectId(), name, file));
      await this.loadSources();
      return res.name;
    } catch (err) {
      this.sourceError.set(
        err instanceof HttpErrorResponse ? ((err.error as ApiErrorBody | undefined)?.error?.message ?? err.message) : String(err),
      );
      return null;
    } finally {
      this.sourceBusy.set(false);
    }
  }

  /**
   * Uploads a starting picture (or the first frame of a GIF or video) and returns
   * its name with the generation settings the file carried; null when it failed
   * (the reason is in sourceError).
   */
  async uploadPicture(file: File): Promise<PictureUploadResult | null> {
    this.sourceBusy.set(true);
    this.sourceError.set(null);
    try {
      const name = pictureUploadName(file.name, this.sources().map((s) => s.name));
      const res = await firstValueFrom(this.api.uploadPicture(this.projectId(), name, file));
      await this.loadSources();
      return res;
    } catch (err) {
      this.sourceError.set(
        err instanceof HttpErrorResponse ? ((err.error as ApiErrorBody | undefined)?.error?.message ?? err.message) : String(err),
      );
      return null;
    } finally {
      this.sourceBusy.set(false);
    }
  }

  // --- model edits (every mutation marks dirty) ----------------------------
  private mutate(fn: (cfg: ProjectConfig) => ProjectConfig): void {
    const cfg = this.config();
    if (!cfg) return;
    this.config.set(fn(structuredClone(cfg)));
    this.dirty.set(true);
  }

  updateDefaults(patch: Partial<ProjectConfig['defaults']>): void {
    this.mutate((c) => ({ ...c, defaults: { ...c.defaults, ...patch } }));
  }

  /**
   * Image model mode. The mode lives in the data: a model set exists or it
   * does not. Switching leaves only one of `defaults.model` / `defaults.model_set`
   * (the server rejects both together).
   */
  setModelMode(mode: 'checkpoint' | 'set'): void {
    this.mutate((c) => {
      if (mode === 'set') {
        c.defaults.model = '';
        c.defaults.model_set ??= { diffusion_model: '', llm: '', vae: '' };
      } else {
        delete c.defaults.model_set;
      }
      return c;
    });
  }

  updateModelSet(patch: Partial<ModelSet>): void {
    this.mutate((c) => {
      c.defaults.model_set = {
        ...(c.defaults.model_set ?? { diffusion_model: '', llm: '', vae: '' }),
        ...patch,
      };
      return c;
    });
  }

  /**
   * Writes a catalog preset in one edit: steps and resolution into the defaults,
   * cfg_scale into the model set. Fields the preset does not declare are left alone.
   */
  applyPreset(preset: CatalogPreset, remember = false): void {
    const before = this.config();
    if (remember && before) {
      this.presetApplied.set({
        steps: before.defaults.steps,
        resolution: before.defaults.resolution,
        cfg_scale: before.defaults.model_set?.cfg_scale,
      });
    } else {
      this.presetApplied.set(null);
    }
    this.tierApplied.set(null);
    this.mutate((c) => {
      if (preset.steps !== undefined) c.defaults.steps = preset.steps;
      if (preset.resolution !== undefined) c.defaults.resolution = preset.resolution;
      if (preset.cfg_scale !== undefined && c.defaults.model_set) {
        c.defaults.model_set.cfg_scale = preset.cfg_scale;
      }
      return c;
    });
  }

  /** Restores what the last automatic preset overwrote. */
  undoPreset(): void {
    const prev = this.presetApplied();
    if (!prev) return;
    this.mutate((c) => {
      c.defaults.steps = prev.steps;
      c.defaults.resolution = prev.resolution;
      if (c.defaults.model_set) c.defaults.model_set.cfg_scale = prev.cfg_scale;
      return c;
    });
    this.presetApplied.set(null);
  }

  /** Chooses the model of an installed catalog entry (a style) and its recommended settings. */
  applyStyle(entry: CatalogEntry): void {
    const before = this.config();
    if (!before) return;
    this.presetApplied.set({
      steps: before.defaults.steps,
      resolution: before.defaults.resolution,
      cfg_scale: before.defaults.model_set?.cfg_scale,
    });
    this.tierApplied.set(null);
    this.mutate((c) => applyStyleEntry(c, entry));
  }

  /** Writes a quality level in one edit and remembers what it overwrote. */
  applyTier(tier: Tier, catalog: CatalogEntry[], overrides: TierOverrides, maxPx: number | null = null): void {
    const before = this.config();
    if (!before) return;
    const r = applyTier(before, tier, catalog, overrides, maxPx);
    this.presetApplied.set(null);
    this.tierApplied.set({ tier, note: r.note, undo: r.undo });
    this.mutate(() => r.config);
  }

  /** Writes what the automatic plan chose in one edit and keeps the project as it was for Undo. */
  applyAuto(plan: AutoPlan): void {
    const before = this.config();
    if (!before) return;
    this.presetApplied.set(null);
    this.tierApplied.set(null);
    this.engineApplied.set(null);
    this.autoApplied.set({ note: [...describePlan(plan), durationText(plan.seconds)], before: structuredClone(before) });
    this.mutate(() => structuredClone(plan.config));
  }

  /** Puts the project back as it was before the last automatic plan. */
  undoAuto(): void {
    const applied = this.autoApplied();
    if (!applied) return;
    this.mutate(() => structuredClone(applied.before));
    this.autoApplied.set(null);
  }

  /** Gives one scene a quality level, in one edit; the project and the other scenes are not touched. */
  applySceneTier(index: number, tier: Tier, overrides: TierOverrides, maxPx: number | null = null): void {
    const before = this.config();
    if (!before) return;
    const r = applySceneTier(before, index, tier, this.catalog(), overrides, maxPx);
    if (!r) return;
    this.sceneTierApplied.set({ id: r.undo.id, note: r.note, undo: r.undo });
    this.mutate(() => r.config);
  }

  /** The scene goes back to the project's render and animation settings. */
  clearSceneQuality(index: number): void {
    const before = this.config();
    if (!before) return;
    const r = clearSceneQuality(before, index);
    if (!r) return;
    this.sceneTierApplied.set({ id: r.undo.id, note: r.note, undo: r.undo });
    this.mutate(() => r.config);
  }

  /** Restores what the last scene quality change overwrote. */
  undoSceneTier(): void {
    const applied = this.sceneTierApplied();
    if (!applied) return;
    this.mutate((c) => undoSceneTier(c, applied.undo));
    this.sceneTierApplied.set(null);
  }

  /** Restores what the last quality level overwrote. */
  undoTier(): void {
    const applied = this.tierApplied();
    if (!applied) return;
    this.mutate((c) => undoTier(c, applied.undo));
    this.tierApplied.set(null);
  }

  /** Chooses the animation engine in one edit and remembers what it overwrote. */
  setAnimateEngine(engine: AnimateEngine): void {
    const before = this.config();
    if (!before) return;
    const r = applyAnimateEngine(before, engine, this.catalog());
    this.engineApplied.set({ note: r.note, undo: r.undo, hadBlock: !!before.defaults.animate, moduleMissing: r.moduleMissing, miniMaxMissing: r.miniMaxMissing, ltxMissing: r.ltxMissing });
    this.tierApplied.set(null);
    this.mutate(() => r.config);
  }

  /** Chooses how MiniMax-H3 uses the picture (first frame or reference): the DiT and the LoRA follow the mode. */
  setMiniMaxMode(firstFrame: boolean): void {
    const cfg = this.config();
    if (!cfg) return;
    this.mutate(() => applyMiniMaxMode(cfg, firstFrame, this.catalog()).config);
  }

  /** Restores what the last engine choice overwrote. */
  undoAnimateEngine(): void {
    const applied = this.engineApplied();
    if (!applied) return;
    this.mutate((c) => undoAnimateEngine(c, applied.undo, applied.hadBlock));
    this.engineApplied.set(null);
  }

  /** Adds (empty) or removes the animation block `defaults.animate`. */
  setAnimateBlock(enabled: boolean): void {
    this.mutate((c) => {
      if (enabled) {
        c.defaults.animate ??= { diffusion_model: '', t5xxl: '', vae: '' };
      } else {
        delete c.defaults.animate;
      }
      return c;
    });
  }

  updateAnimate(patch: Partial<AnimateSettings>): void {
    this.mutate((c) => {
      c.defaults.animate = {
        ...(c.defaults.animate ?? { diffusion_model: '', t5xxl: '', vae: '' }),
        ...patch,
      };
      return c;
    });
  }

  /**
   * Chooses (or, with an empty path, clears) the high-noise expert. Clearing it
   * also drops its steps and cfg: they mean nothing without it and the server
   * refuses them.
   */
  setHighNoiseModel(path: string): void {
    this.mutate((c) => {
      const a = (c.defaults.animate ??= { diffusion_model: '', t5xxl: '', vae: '' });
      if (path) {
        a.high_noise_diffusion_model = path;
      } else {
        delete a.high_noise_diffusion_model;
        delete a.high_noise_steps;
        delete a.high_noise_cfg_scale;
      }
      return c;
    });
  }

  /**
   * Chooses the project's mode. Music is a pending switch: it gives the project
   * a first track to start from and, on save, replaces the scenes with tracks.
   * Nothing is lost before that: the scenes stay in the editable model.
   */
  setMode(mode: string): void {
    this.mutate((c) => {
      c.output.mode = mode;
      if (mode === 'music') {
        c.tracks = c.tracks?.length ? c.tracks : [{ id: $localize`:@@music.starterId:track_1`, prompt: $localize`:@@music.starterPrompt:Pop ballad with piano and a warm voice` }];
      }
      return c;
    });
  }

  /** Chooses the kind of soundtrack; `none` removes the block. */
  setBGMKind(kind: 'none' | 'prompt' | 'file'): void {
    this.mutate((c) => {
      const keep = { ...c.bgm };
      if (kind === 'none') delete c.bgm;
      else if (kind === 'prompt') c.bgm = { ...keep, file: undefined, prompt: keep.prompt ?? '' };
      else c.bgm = { ...keep, prompt: undefined, seed: undefined, file: keep.file ?? '' };
      return c;
    });
  }

  /**
   * Sets fields of `defaults.motion` (the tempo, the design and the song of the scenes drawn by a part). A field set to
   * `undefined` or '' is removed, and what is left empty is not kept: no `motion` at all if nothing is set.
   */
  updateMotionDefaults(patch: Partial<MotionDefaults>): void {
    this.mutate((c) => {
      const motion = compactMotion({ ...c.defaults.motion, ...patch });
      c.defaults = { ...c.defaults };
      if (motion) c.defaults.motion = motion;
      else delete c.defaults.motion;
      return c;
    });
  }

  /** The same for one or more fields of `defaults.motion.design`. */
  updateMotionDesign(patch: Partial<MotionDesign>): void {
    this.updateMotionDefaults({ design: compactMotion({ ...this.config()?.defaults.motion?.design, ...patch }) });
  }

  updateBGM(patch: Partial<BackgroundMusic>): void {
    this.mutate((c) => {
      c.bgm = { ...c.bgm, ...patch };
      return c;
    });
  }

  /** The project's adult label: true, false (reviewed) or undefined (not reviewed). */
  setAdult(value: boolean | undefined): void {
    this.mutate((c) => ({ ...c, adult: value }));
  }

  updateOutput(patch: Partial<ProjectConfig['output']>): void {
    this.mutate((c) => ({ ...c, output: { ...c.output, ...patch } }));
  }

  updateScene(index: number, patch: Partial<Scene>): void {
    this.mutate((c) => {
      c.scenes[index] = { ...c.scenes[index], ...patch };
      return c;
    });
  }

  addScene(): void {
    this.mutate((c) => {
      c.scenes.push({
        id: `escena_${c.scenes.length + 1}`,
        prompt: '',
        negative_prompt: '',
        tts_text: '',
        speed: 1.0,
        lora: '',
        // A project with animation configured animates what it adds: that is what its animation is for.
        ...(c.defaults.animate ? { animate: true } : {}),
      });
      return c;
    });
    this.selected.set((this.config()?.scenes.length ?? 1) - 1);
  }

  /**
   * Inserts new scenes right after `afterIndex`, in order, one per described shot,
   * and selects the first. Existing scenes are not touched. Each has a unique id
   * (`referencia_N`), the shot's prompt, `described_by`, and, in a video project,
   * the shot's length as `silence_seconds` (a scene needs narration or silence to
   * be valid; at least 1 s). A project set to animate animates them, with the
   * shot's movement as the video prompt.
   */
  insertScenes(afterIndex: number, shots: NewShotScene[]): void {
    if (!shots.length) return;
    this.mutate((c) => {
      const video = c.output.mode !== 'images';
      const taken = new Set(c.scenes.map((s) => s.id));
      let n = 1;
      const fresh = shots.map((sh): Scene => {
        let id: string;
        do id = `referencia_${n++}`;
        while (taken.has(id));
        taken.add(id);
        return {
          id,
          prompt: sh.prompt,
          negative_prompt: '',
          tts_text: '',
          speed: 1.0,
          lora: '',
          described_by: sh.model,
          ...(video ? { silence_seconds: Math.max(1, Math.round(sh.seconds * 10) / 10) } : {}),
          ...(c.defaults.animate ? { animate: true, ...(sh.motion ? { motion_prompt: sh.motion } : {}) } : {}),
        };
      });
      c.scenes.splice(afterIndex + 1, 0, ...fresh);
      return c;
    });
    this.selected.set(afterIndex + 1);
  }

  removeScene(index: number): void {
    this.mutate((c) => {
      c.scenes.splice(index, 1);
      return c;
    });
    this.selected.set(Math.max(0, Math.min(this.selected(), (this.config()?.scenes.length ?? 1) - 1)));
  }

  reorder(from: number, to: number): void {
    this.mutate((c) => {
      const [moved] = c.scenes.splice(from, 1);
      c.scenes.splice(to, 0, moved);
      return c;
    });
    this.selected.set(to);
  }

  // --- persistence ------------------------------------------------------------
  async save(): Promise<boolean> {
    const cfg = this.config();
    if (!cfg) return false;
    this.saving.set(true);
    this.serverError.set(null);
    try {
      // A project switched to music is written as one: tracks in place of scenes.
      const yaml = this.toMusic() ? toMusicYaml({ ...cfg, scenes: [] }) : toYaml(cfg);
      const res = await firstValueFrom(this.api.saveConfig(this.projectId(), yaml));
      this.warnings.set(res.warnings ?? []);
      this.dirty.set(false);
      return true;
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        const message = (err.error as ApiErrorBody | undefined)?.error?.message ?? err.message;
        this.serverError.set({ message, sceneId: sceneIdFromServerError(message) });
        return false;
      }
      throw err;
    } finally {
      this.saving.set(false);
    }
  }
}

/** An object without its empty fields ('' and undefined and empty objects), or undefined when nothing is left. */
function compactMotion<T extends object>(value: T): T | undefined {
  const entries = Object.entries(value).filter(([, v]) => v !== undefined && v !== '' && !(typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length === 0));
  return entries.length ? (Object.fromEntries(entries) as T) : undefined;
}
