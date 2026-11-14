import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TRANSITION_KINDS, transitionLabel } from '../../core/transitions';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { EditEngineSelectComponent } from '../../shared/edit-engine-select/edit-engine-select.component';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';

import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AnimateEngine, CatalogEntry, CatalogPreset } from '../../core/api.models';
import { catalogName, catalogPromptHint } from '../../core/catalog-text';
import { ApiService } from '../../core/api.service';
import { EnvironmentStore } from '../../core/environment.store';
import { BUDGETS, AutoPlan, describePlan, durationText, machineOf, pictureLimitFor, planAuto } from '../auto-plan';
import { EditorStore } from '../editor.store';
import { MiddleEllipsisPipe } from '../../shared/pipes/middle-ellipsis.pipe';
import { selectableVoices, speakerLabel } from '../asset-options';
import {
  stylesOf,
  Style,
  TIERS,
  Tier,
  TierOverride,
  TierOverrides,
  animateEngine,
  chosenModelEntry,
  editLabel,
  entryForFile,
  fitResolution,
  loadOverrides,
  pickStyleEntry,
  pickWanEntry,
  saveOverrides,
  styleHelp,
  styleLabel,
  tierLabel,
  activeTier,
  tierValues,
} from '../quality-tiers';

/**
 * Project-wide settings: defaults (model/voice from the shared inventory,
 * resolution, sampler, steps, fps, global prompts) and output (video /
 * images selector + mode-specific fields). A configured asset missing
 * from the inventory stays selected, flagged as not found.
 */
@Component({
  selector: 'app-defaults-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatExpansionModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatButtonToggleModule,
    EditEngineSelectComponent,
    MatCheckboxModule,
    MatButtonModule,
    MatTooltipModule,
    MiddleEllipsisPipe,
  ],
  templateUrl: './defaults-panel.component.html',
  styleUrl: './defaults-panel.component.scss',
})
export class DefaultsPanelComponent {
  protected readonly store = inject(EditorStore);
  protected readonly env = inject(EnvironmentStore);

  /** The label as the select holds it: '' (not reviewed), 'false' (reviewed) or 'true' (for adults). */
  protected readonly adultValue = computed(() => {
    const a = this.cfg()?.adult;
    return a === undefined ? '' : a ? 'true' : 'false';
  });

  protected setAdult(v: string): void {
    this.store.setAdult(v === '' ? undefined : v === 'true');
  }
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  protected readonly cfg = computed(() => this.store.config());
  protected readonly videoMode = computed(() => this.cfg()?.output.mode !== 'images');
  protected readonly validation = computed(() => this.store.validation() ?? { defaults: {} as Record<string, string | undefined> });

  /** The crossfade between scenes; empty clears it (hard cuts). */
  protected setTransition(raw: string): void {
    const n = raw.trim() === '' ? undefined : Number(raw);
    this.store.updateDefaults({ transition_seconds: n !== undefined && Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined });
  }
  protected readonly transitionKinds = TRANSITION_KINDS;
  protected readonly transitionLabel = transitionLabel;

  /** The kind of transition between scenes; the crossfade is the default and is not written. */
  protected setTransitionKind(kind: string): void {
    this.store.updateDefaults({ transition: kind === 'fade' ? undefined : kind });
  }

  /** The project is being switched to music: only the mode selector applies until it is saved. */
  protected readonly toMusic = computed(() => this.cfg()?.output.mode === 'music');

  protected readonly modelOptions = computed(() =>
    this.assetOptions(this.env.models().map((m) => `models/${m.name}`), this.cfg()?.defaults.model),
  );
  protected readonly voiceOptions = computed(() =>
    this.assetOptions(
      selectableVoices(this.env.voices().map((v) => v.name)).map((n) => `voices/${n}`),
      this.cfg()?.defaults.voice,
    ),
  );

  protected readonly speakerLabel = speakerLabel;
  /** The speakers of the project's voice, when that model holds several. */
  protected readonly voiceSpeakers = computed(
    () => this.env.voices().find((v) => `voices/${v.name}` === this.cfg()?.defaults.voice)?.speakers ?? [],
  );

  /** The image model mode lives in the data: a model set exists or it does not. */
  protected readonly modelMode = computed(() => (this.cfg()?.defaults.model_set ? 'set' : 'checkpoint'));

  /** Options for one model-set file: the installed models plus the configured value if missing. */
  protected setOptions(field: 'diffusion_model' | 'llm' | 'vae' | 'clip_l' | 't5xxl') {
    return this.assetOptions(
      this.env.models().map((m) => `models/${m.name}`),
      this.cfg()?.defaults.model_set?.[field],
    );
  }

  /**
   * Installed Wan files (models/video/). The environment report does not list
   * that directory, so they come from the models inventory, loaded once the
   * animation block is in use.
   */
  private readonly videoAssets = signal<string[]>([]);
  private videoLoaded = false;

  protected readonly animateOn = computed(() => !!this.cfg()?.defaults.animate);

  /** The engine the project animates with (Wan unless `defaults.animate.engine` says AnimateDiff). */
  protected readonly engine = computed<AnimateEngine>(() => animateEngine(this.cfg()));
  protected readonly isAnimateDiff = computed(() => this.engine() === 'animatediff');
  protected readonly isMiniMax = computed(() => this.engine() === 'minimax-h3');
  protected readonly isLtx = computed(() => this.engine() === 'ltx-2.3');
  protected readonly engineLabel = computed(() => (this.isAnimateDiff() ? 'AnimateDiff' : this.isMiniMax() ? 'MiniMax H3' : this.isLtx() ? 'LTX 2.3' : 'Wan'));

  /** What an unset field resolves to, as the placeholders and hints show it. */
  protected readonly animateDefaults = computed(() => {
    if (this.isAnimateDiff()) return { resolution: '512x512', frames: 16, fps: 8, steps: 25, cfg: '7', strength: '0.75' };
    if (this.isMiniMax()) {
      // 4 steps with the turbo LoRA, 20 without; 24 fps are fixed.
      const turbo = !!this.cfg()?.defaults.animate?.lora;
      return { resolution: '864x480', frames: 56, fps: 24, steps: turbo ? 4 : 20, cfg: '1', strength: '' };
    }
    if (this.isLtx()) return { resolution: '768x416', frames: 49, fps: 24, steps: 8, cfg: '1', strength: '' };
    const two = !!this.cfg()?.defaults.animate?.high_noise_diffusion_model;
    return { resolution: '832x480', frames: 33, fps: 16, steps: two ? 10 : 20, cfg: two ? '3.5' : '6', strength: '' };
  });

  /** The five files of LTX-2.3, in the order the panel shows them. */
  protected readonly ltxFields: { key: 'diffusion_model' | 'llm' | 'vae' | 'audio_vae' | 'connectors'; testId: string; label: string }[] = [
    { key: 'diffusion_model', testId: 'animate-ltx-dit', label: $localize`:@@defaults.aLtxDit:LTX 2.3 model (DiT)` },
    { key: 'llm', testId: 'animate-ltx-llm', label: $localize`:@@defaults.aLtxLlm:Text encoder (Gemma)` },
    { key: 'vae', testId: 'animate-ltx-vae', label: $localize`:@@defaults.aLtxVae:Video VAE` },
    { key: 'audio_vae', testId: 'animate-ltx-audio-vae', label: $localize`:@@defaults.aLtxAudioVae:Audio VAE` },
    { key: 'connectors', testId: 'animate-ltx-connectors', label: $localize`:@@defaults.aLtxConnectors:Embeddings connectors` },
  ];

  protected ltxValue(key: string): string {
    return (this.cfg()?.defaults.animate as unknown as Record<string, string | undefined> | undefined)?.[key] ?? '';
  }

  protected setLtxFile(key: string, value: string): void {
    this.store.updateAnimate({ [key]: value || undefined });
  }

  protected setEngine(engine: AnimateEngine): void {
    this.store.setAnimateEngine(engine);
  }

  /** The checkpoint of an AnimateDiff project: the installed image models (it must be SD 1.5). */
  protected checkpointOptions() {
    return this.assetOptions(
      this.env.models().map((m) => `models/${m.name}`),
      this.cfg()?.defaults.animate?.checkpoint,
    );
  }

  /** The motion module: the installed video files that are one (the catalog's, or named like one). */
  protected moduleOptions() {
    const known = new Set(
      this.catalog().flatMap((e) => e.files.filter((f) => f.role === 'motion_module').map((f) => f.name)),
    );
    const modules = this.videoAssets().filter((p) => {
      const name = baseName(p);
      return known.has(name) || /^(mm_|v\d+_sd15_mm|.*motion)/i.test(name);
    });
    return this.assetOptions(modules, this.cfg()?.defaults.animate?.motion_module);
  }

  /**
   * Catalog entries, read once when the project loads, to offer the
   * recommended settings of the chosen model. A failed request leaves it empty
   * and the offer simply does not appear.
   */
  protected readonly catalog = computed(() => this.store.catalog());
  private catalogLoaded = false;

  /** Chosen image model file: the set's diffusion model, or the single checkpoint. */
  private readonly chosenModel = computed(() => {
    const d = this.cfg()?.defaults;
    return baseName(d?.model_set ? d.model_set.diffusion_model : d?.model);
  });

  /** Catalog entry whose `model` file is the given file (by name). */
  private entryFor(file: string): CatalogEntry | null {
    if (!file) return null;
    return entryForFile(this.catalog(), file);
  }

  /** Preset of the catalog entry of the chosen model. */
  protected readonly preset = computed<CatalogPreset | null>(
    () => this.entryFor(this.chosenModel())?.preset ?? null,
  );

  /** Prompt advice of the chosen model (display only). */
  protected catalogLabel = catalogName;
  protected readonly noneLabel = $localize`:@@defaults.none:none`;
  protected readonly promptHint = computed(() => (() => { const e = this.entryFor(this.chosenModel()); return e ? catalogPromptHint(e) : ''; })());

  /** The user picked a model: save it and apply that model's preset, if it has one. */
  protected pickModel(value: string, mode: 'checkpoint' | 'set'): void {
    if (mode === 'set') this.store.updateModelSet({ diffusion_model: value });
    else this.store.updateDefaults({ model: value });
    const p = this.entryFor(baseName(value))?.preset;
    if (p) this.store.applyPreset(p, true);
  }

  /** The preset as the button shows it, e.g. "8 pasos · cfg 1 · 1024x576". */
  protected readonly presetText = computed(() => {
    const p = this.preset();
    if (!p) return '';
    const parts: string[] = [];
    if (p.steps !== undefined) parts.push($localize`:@@defaults.presetSteps:${p.steps} steps`);
    if (p.cfg_scale !== undefined) parts.push(`cfg ${p.cfg_scale}`);
    if (p.resolution) parts.push(p.resolution);
    return parts.join(' · ');
  });

  protected applyPreset(): void {
    const p = this.preset();
    if (p) this.store.applyPreset(p);
  }

  /** What the automatic apply wrote, for the note under the selector. */
  protected readonly appliedNote = computed(() => (this.store.presetApplied() ? this.presetText() : ''));

  // --- style and quality ----------------------------------------------------

  /** Customized values of the quality levels, kept in this browser. */
  protected readonly overrides = signal<TierOverrides>(loadOverrides());

  // --- I'm lazy: the plan for what is installed, this machine and the time the user gives ---------

  protected readonly budgets = BUDGETS;
  /** The time the user is willing to wait, as an index of BUDGETS (0: whatever it takes). */
  protected readonly budgetIndex = signal(0);
  /** Switch animation on in the scenes (default): the point of a video is that it moves. */
  protected readonly autoAnimate = signal(true);
  protected readonly machine = computed(() => machineOf(this.env.gpus(), this.env.ram()));
  protected readonly autoPlan = computed<AutoPlan | null>(() => {
    const cfg = this.cfg();
    if (!cfg || cfg.output.mode === 'music') return null;
    return planAuto(cfg, this.catalog(), this.machine(), this.budgets[this.budgetIndex()] ?? null, this.autoAnimate());
  });
  protected readonly autoLines = computed(() => {
    const p = this.autoPlan();
    return p ? describePlan(p) : [];
  });
  protected readonly autoTime = (seconds: number): string => durationText(seconds);

  protected budgetLabel(seconds: number | null): string {
    if (seconds === null) return $localize`:@@auto.budgetAny:Whatever it takes (the best quality)`;
    const min = Math.round(seconds / 60);
    if (min < 60) return $localize`:@@auto.budgetMin:${min}:min: minutes`;
    const h = Math.round(min / 60);
    return h === 1 ? $localize`:@@auto.budgetHour:1 hour` : h >= 8 ? $localize`:@@auto.budgetNight:${h}:h: hours (all night)` : $localize`:@@auto.budgetHours:${h}:h: hours`;
  }

  protected betterNames(plan: AutoPlan): string {
    return plan.better.map((e) => catalogName(e)).join(', ');
  }

  protected applyAuto(): void {
    const p = this.autoPlan();
    if (p) this.store.applyAuto(p);
  }

  /** The whole way in one click: writes the plan, saves the project and launches the run, which opens. */
  protected readonly generating = signal(false);
  protected async applyAndGenerate(): Promise<void> {
    const p = this.autoPlan();
    if (!p || this.generating()) return;
    this.generating.set(true);
    try {
      this.store.applyAuto(p);
      if (!(await this.store.save())) return; // the editor shows what the server refused
      const res = await firstValueFrom(this.api.launchRun(this.store.projectId(), {}));
      await this.router.navigate(['/runs', res.run.id]);
    } finally {
      this.generating.set(false);
    }
  }

  /** Styles with the installed model each would choose; none = disabled. */
  protected readonly styles = computed(() =>
    stylesOf(this.catalog()).map((style) => ({
      style,
      label: styleLabel(style),
      entry: pickStyleEntry(this.catalog(), style),
    })),
  );

  /** The most pixels a picture of the chosen model can have on this machine: a level never asks for more. */
  protected readonly pictureLimit = computed(() => {
    const cfg = this.cfg();
    return cfg ? pictureLimitFor(cfg, this.catalog(), this.env.gpus(), this.env.ram()) : null;
  });

  /** The levels with what each would write for the chosen model and mode. */
  protected readonly tiers = computed(() => {
    const cfg = this.cfg();
    const preset = cfg ? (chosenModelEntry(cfg, this.catalog())?.preset ?? null) : null;
    const images = !this.videoMode();
    return TIERS.map((tier) => {
      const twoExpert =
        !images &&
        !this.isAnimateDiff() &&
        !!(pickWanEntry(this.catalog(), tier)?.entry.files.some((f) => f.role === 'high_noise_model'));
      const v = tierValues(tier, preset, this.overrides(), twoExpert, this.engine());
      const limit = this.pictureLimit();
      const parts = [limit ? fitResolution(v.resolution, limit) : v.resolution, $localize`:@@tier.noteSteps:${v.steps} steps`];
      if (images) parts.push($localize`:@@tier.noteVariants:${v.variants} variants`);
      if (v.lora) parts.push(`lora ${v.lora}`);
      if (!images) parts.push(`${this.engineLabel()} ${v.wanResolution} · ${v.wanFrames} f · ${v.wanSteps}`);
      return { tier, label: tierLabel(tier), text: parts.join(' · '), values: v };
    });
  });

  /** The level the project is at now, or null when it is none of them (shown pressed). */
  protected readonly activeTier = computed(() => {
    const cfg = this.cfg();
    return cfg ? activeTier(cfg, this.catalog(), this.overrides(), this.pictureLimit()) : null;
  });

  /** The look the project has now: editing his pictures, or the style of the model it uses. null when it is none of them. */
  protected readonly activeStyle = computed<Style | 'edit' | null>(() => {
    if (this.store.editing()) return 'edit';
    const cfg = this.cfg();
    const s = cfg ? chosenModelEntry(cfg, this.catalog())?.styles?.[0] : undefined;
    return s ?? null;
  });
  protected readonly editLabel = editLabel();
  protected readonly editAvailable = computed(() => !!this.store.editEntry());
  /** What the project is set to draw with now, so the user sees what a style loaded: the model, the size and the steps. */
  protected readonly usedModel = computed(() => {
    const cfg = this.cfg();
    if (!cfg || this.store.editing()) return null;
    const entry = chosenModelEntry(cfg, this.catalog());
    if (!entry) return null;
    return { name: entry.name, resolution: cfg.defaults.resolution, steps: cfg.defaults.steps };
  });
  protected readonly styleHelpText = computed(() => styleHelp(this.activeStyle() ?? 'auto'));

  protected readonly styleAny = computed(() => this.styles().some((s) => !!s.entry));
  protected readonly tierNote = computed(() => this.store.tierApplied());
  protected readonly loraChoices = computed(() => this.env.loras().map((l) => l.name));

  protected pickStyle(style: Style): void {
    const entry = pickStyleEntry(this.catalog(), style);
    if (!entry) return;
    // Leaving the editing model gives the project back its own first, so the style is applied on that.
    if (this.store.editing()) this.store.setEditing(false);
    this.store.applyStyle(entry);
  }

  /** Makes the project edit its pictures by instruction (the editing model). */
  protected pickEdit(): void {
    this.store.setEditing(true);
  }

  protected pickTier(tier: Tier): void {
    this.store.applyTier(tier, this.catalog(), this.overrides(), this.pictureLimit());
  }

  /** Changes one field of a level; an empty field goes back to the derived value. */
  protected setOverride(tier: Tier, field: keyof TierOverride, raw: string): void {
    const o: TierOverrides = structuredClone(this.overrides());
    const t = (o[tier] ??= {}) as Record<string, string | number | undefined>;
    const numeric =
      field === 'steps' || field === 'variants' || field === 'wanFrames' || field === 'wanSteps' || field === 'adFrames' || field === 'adSteps';
    const text = raw.trim();
    if (text === '') delete t[field];
    else t[field] = numeric ? Number(text) : text;
    if (Object.keys(t).length === 0) delete o[tier];
    this.overrides.set(o);
    saveOverrides(o);
  }

  protected restoreTiers(): void {
    this.overrides.set({});
    saveOverrides({});
  }

  protected readonly hasOverrides = computed(() => Object.keys(this.overrides()).length > 0);

  /** Value shown in a level's field: the customization, or empty so the derived one shows as a placeholder. */
  protected ov(tier: Tier, field: keyof TierOverride): string | number {
    return this.overrides()[tier]?.[field] ?? '';
  }

  constructor() {
    effect(() => {
      if (this.cfg() && !this.catalogLoaded) {
        this.catalogLoaded = true;
        void this.store.loadCatalog();
      }
    });
    effect(() => {
      if (this.animateOn() && !this.videoLoaded) {
        this.videoLoaded = true;
        void this.loadVideoAssets();
      }
    });
  }

  private async loadVideoAssets(): Promise<void> {
    try {
      const res = await firstValueFrom(this.api.listAssets());
      const video = res.kinds.find((k) => k.kind === 'video');
      this.videoAssets.set((video?.assets ?? []).map((a) => `models/video/${a.name}`));
    } catch {
      this.videoAssets.set([]); // the selectors keep any configured value
    }
  }

  protected animateOptions(field: 'diffusion_model' | 'high_noise_diffusion_model' | 't5xxl' | 'vae' | 'llm' | 'audio_vae' | 'connectors' | 'lora') {
    return this.assetOptions(this.videoAssets(), this.cfg()?.defaults.animate?.[field]);
  }

  /** The block is in the two-expert mode (Wan A14B) when it names a high-noise expert. */
  protected readonly twoExpert = computed(() => !!this.cfg()?.defaults.animate?.high_noise_diffusion_model);

  protected setHighNoiseModel(path: string): void {
    this.store.setHighNoiseModel(path);
  }

  protected setAnimateBlock(on: boolean): void {
    this.store.setAnimateBlock(on);
  }

  /** Whether the chosen value is a file that is no longer on disk (the option list flags it). */
  protected missing(opts: { value: string; missing: boolean }[], value: string | undefined): boolean {
    return !!value && opts.some((o) => o.value === value && o.missing);
  }

  /** An emptied number field means "unset", never 0. */
  protected num(value: string): number | undefined {
    return value.trim() === '' ? undefined : Number(value);
  }

  /** Inventory paths plus the configured value when it is missing on disk. */
  private assetOptions(paths: string[], current?: string): { value: string; missing: boolean }[] {
    const opts = paths.map((value) => ({ value, missing: false }));
    if (current && !paths.includes(current)) {
      opts.unshift({ value: current, missing: true });
    }
    return opts;
  }
}

/** Last path segment: `models/krea2_turbo-Q4_K_M.gguf` -> `krea2_turbo-Q4_K_M.gguf`. */
function baseName(path?: string): string {
  return path ? (path.split('/').pop() ?? '') : '';
}
