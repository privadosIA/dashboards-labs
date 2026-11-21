import { GpuStatus, ProjectConfig, RamReport, Scene, CatalogEntry } from '../core/api.models';
import { catalogName } from '../core/catalog-text';
import {
  Tier,
  TIERS,
  Style,
  animateDiffEntry,
  animateEngine,
  applyAnimateEngine,
  applyStyleEntry,
  applyTier,
  chosenModelEntry,
  entryForFile,
  installedSd15,
  miniMaxEntry,
  ltxEntry,
  miniMaxFirstFrameEntry,
  applyMiniMaxMode,
  pickEditEntry,
  EditEngine,
  pickStyleEntry,
  pickWanEntry,
  stylesOf,
  fitResolution,
  tierValues,
} from './quality-tiers';

// --- the machine ---------------------------------------------------------------------------------

/** What the planner knows about the machine: the card that will do the work and the memory. */
export interface AutoMachine {
  /** The biggest card, by its memory. 0 when there is no GPU. */
  vramMb: number;
  gpuName: string;
  gpuCount: number;
  /** How many cards can make songs on their own (the server runs a music project on all of them at once). */
  musicCards?: number;
  ramGb: number | null;
  /** Multiplier of the reference machine's times (RTX 5060 Ti 16 GB = 1): 2 means twice as slow. */
  speed: number;
  /** Whether `speed` is a guess because the card is not in the table (and not measured either). */
  speedGuessed: boolean;
  /** How many renders and animations of this machine the speed was measured from; 0 when it comes from the table. */
  speedMeasured: number;
}

/**
 * Time of a card against the reference one (an approximation by card family, not a measure: it
 * only scales the estimates). The first pattern that matches wins.
 */
const GPU_SPEED: [RegExp, number][] = [
  [/5090/, 0.25],
  [/4090/, 0.33],
  [/5080/, 0.45],
  [/4080/, 0.55],
  [/5070 ?Ti/i, 0.65],
  [/3090/, 0.7],
  [/4070 ?Ti/i, 0.8],
  [/5070/, 0.8],
  [/3080/, 0.8],
  [/4070/, 0.95],
  [/5060 ?Ti/i, 1],
  [/4060 ?Ti/i, 1.05],
  [/3070/, 1.1],
  [/5060/, 1.15],
  [/3060 ?Ti/i, 1.2],
  [/4060/, 1.3],
  [/2080/, 1.3],
  [/3060/, 1.5],
  [/2070/, 1.6],
  [/1080 ?Ti/i, 2],
  [/2060/, 2],
  [/1660|1650/, 3],
];

/** The memory a card needs to make songs on its own (the server's musicMinVRAMMB). */
const MUSIC_CARD_MB = 9000;

export function machineOf(gpus: GpuStatus[], ram: RamReport | null | undefined): AutoMachine {
  const mem = (g: GpuStatus) => g.total_vram_mb ?? g.free_vram_mb;
  const best = [...gpus].sort((a, b) => mem(b) - mem(a))[0];
  const hit = best ? GPU_SPEED.find(([re]) => re.test(best.name)) : undefined;
  // What the machine did in its own runs beats a table of card families.
  const measured = best?.speed_factor && best.speed_samples ? best.speed_factor : 0;
  return {
    vramMb: best ? mem(best) : 0,
    gpuName: best?.name ?? '',
    gpuCount: gpus.length,
    musicCards: gpus.filter((g) => mem(g) >= MUSIC_CARD_MB).length,
    ramGb: ram ? Math.round(ram.total_bytes / 2 ** 30) : null,
    speed: best ? (measured || (hit ? hit[1] : 1.5)) : 20,
    speedGuessed: !!best && !hit && !measured,
    speedMeasured: measured ? (best?.speed_samples ?? 0) : 0,
  };
}

// --- video memory of a picture --------------------------------------------------------------------

/**
 * Extra video memory a picture needs per thousand pixels above the entry's preset resolution (MB). Measured
 * with IntoRealism fp8 on a 16 GB card: 13.8 GB at 1024x576, 15.2 GB at 1280x704 (it works, with about a gigabyte
 * left) and out of memory at 1408x768.
 */
const VRAM_MB_PER_KPX = 4.6;
/** What share of the card's memory a picture may use: the rest is the CUDA context and a margin. */
const VRAM_USABLE = 0.95;

/** The most pixels a picture of this model can have on this machine; null when there is no limit to speak of. */
export function maxPicturePixels(entry: CatalogEntry | null, machine: AutoMachine): number | null {
  if (!entry?.vram_mb || machine.vramMb <= 0) return null;
  const base = pixels(entry.preset?.resolution ?? entry.timing?.resolution ?? '1024x576');
  return base + ((machine.vramMb * VRAM_USABLE - entry.vram_mb) / VRAM_MB_PER_KPX) * 1000;
}

export { fitResolution };

/** The most pixels a picture of the project's model can have on this machine; null when there is no limit to speak of. */
export function pictureLimitFor(cfg: ProjectConfig, catalog: CatalogEntry[], gpus: GpuStatus[], ram?: RamReport | null): number | null {
  return maxPicturePixels(chosenModelEntry(cfg, catalog), machineOf(gpus, ram));
}

// --- time ------------------------------------------------------------------------------------

const pixels = (res: string): number => {
  const m = /^(\d+)x(\d+)$/.exec(res);
  return m ? +m[1] * +m[2] : 0;
};

const baseName = (p?: string): string => (p ? (p.split('/').pop() ?? '') : '');

/** Time that is not the models': narration, the clip of each scene, joining. */
const PER_SCENE_SECONDS = 4;
const FIXED_SECONDS = 15;

/** Seconds one picture takes: the entry's time scaled by pixels and steps. */
export function pictureSeconds(entry: CatalogEntry | null, resolution: string, steps: number): number {
  const t = entry?.timing;
  if (!t || !pixels(t.resolution) || !t.steps) return 20 * (pixels(resolution) / pixels('1024x576') || 1) * (steps / 8);
  return t.seconds * (pixels(resolution) / pixels(t.resolution)) * (steps / t.steps);
}

/** Seconds one clip takes: the entry's time scaled by pixels, frames and steps. */
export function clipSeconds(entry: CatalogEntry | null, turbo: boolean, resolution: string, frames: number, steps: number): number {
  const t = entry?.timing;
  if (!t || !t.frames || !pixels(t.resolution) || !t.steps) return 85;
  const base = turbo && t.turbo_seconds ? t.turbo_seconds : t.seconds;
  const baseSteps = turbo && t.turbo_steps ? t.turbo_steps : t.steps;
  return base * (pixels(resolution) / pixels(t.resolution)) * (frames / t.frames) * (steps / baseSteps);
}

interface ClipSettings {
  entry: CatalogEntry | null;
  turbo: boolean;
  resolution: string;
  frames: number;
  steps: number;
}

/** The animation settings a scene ends up with: the project's, over the engine's defaults, under the scene's own. */
function clipSettings(cfg: ProjectConfig, scene: Scene, catalog: CatalogEntry[]): ClipSettings {
  const a = cfg.defaults.animate;
  const engine = animateEngine(cfg);
  const turbo = engine === 'minimax-h3' && !!a?.lora;
  const firstFrame = engine === 'minimax-h3' && !!a?.first_frame;
  const defaults =
    engine === 'animatediff'
      ? { resolution: '512x512', frames: 16, steps: 25 }
      : engine === 'minimax-h3'
        ? { resolution: '864x480', frames: 56, steps: turbo ? (firstFrame ? 8 : 4) : 20 }
        : engine === 'ltx-2.3'
          ? { resolution: '768x416', frames: 49, steps: 8 }
          : { resolution: '832x480', frames: 33, steps: a?.high_noise_diffusion_model ? 10 : 20 };
  const entry =
    engine === 'animatediff'
      ? animateDiffEntry(catalog)
      : engine === 'minimax-h3'
        ? ((firstFrame ? miniMaxFirstFrameEntry(catalog) : null) ?? miniMaxEntry(catalog))
        : engine === 'ltx-2.3'
          ? ltxEntry(catalog)
          : entryForFile(catalog, baseName(a?.diffusion_model));
  return {
    entry,
    turbo,
    resolution: scene.animation?.resolution || a?.resolution || defaults.resolution,
    frames: scene.animation?.frames || a?.frames || defaults.frames,
    steps: scene.animation?.steps || a?.steps || defaults.steps,
  };
}

/** How long a run of the project would take on this machine, from what the catalog timed. */
export function estimateSeconds(cfg: ProjectConfig, catalog: CatalogEntry[], speed: number): number {
  const d = cfg.defaults;
  const images = cfg.output.mode === 'images';
  const imageEntry = chosenModelEntry(cfg, catalog);
  let seconds = 0;
  for (const s of cfg.scenes) {
    if (s.image === undefined && s.clip === undefined) {
      const res = s.render?.resolution || d.resolution;
      const steps = s.render?.steps || d.steps;
      seconds += pictureSeconds(imageEntry, res, steps) * (images ? (s.variants ?? 1) : 1);
    }
    if (!images) {
      seconds += PER_SCENE_SECONDS;
      if (s.animate && s.clip === undefined && d.animate) {
        const c = clipSettings(cfg, s, catalog);
        seconds += clipSeconds(c.entry, c.turbo, c.resolution, c.frames, c.steps);
      }
    }
  }
  return Math.round((seconds + FIXED_SECONDS) * speed);
}

/** "≈ 45 min", "≈ 1 h 20 min", "≈ 3 h". */
export function durationText(seconds: number): string {
  const min = Math.max(1, Math.round(seconds / 60));
  if (min < 60) return `≈ ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `≈ ${h} h` : `≈ ${h} h ${m} min`;
}

// --- the plan ---------------------------------------------------------------------------------

/** How long the user is willing to wait; null is "whatever it takes" (the best quality there is). */
export const BUDGETS: (number | null)[] = [null, 15 * 60, 30 * 60, 60 * 60, 2 * 3600, 4 * 3600, 8 * 3600];

export type VideoChoiceId = 'h3-full' | 'wan-high' | 'ltx' | 'h3-draft' | 'wan-medium' | 'wan-low' | 'ad-high' | 'ad-medium' | 'ad-low';

export interface VideoChoice {
  id: VideoChoiceId;
  engine: 'wan' | 'animatediff' | 'minimax-h3' | 'ltx-2.3';
  /** The level of Wan or AnimateDiff; H3 and LTX have none. */
  tier?: Tier;
  turbo?: boolean;
  /** MiniMax-H3: the picture is the first frame of the clip (the first-frame bundle) rather than a reference. */
  firstFrame?: boolean;
  /** MiniMax-H3 on a small card: the lower resolution it runs at there (the entry's `low_vram`). */
  resolution?: string;
  entry: CatalogEntry;
}

/** From best to worst: what the measured shots said (identity, faces, how well it follows the prompt). */
const VIDEO_ORDER: VideoChoiceId[] = ['h3-full', 'wan-high', 'ltx', 'h3-draft', 'wan-medium', 'wan-low', 'ad-high', 'ad-medium', 'ad-low'];

export interface AutoPlan {
  /** The settings the plan writes. */
  config: ProjectConfig;
  imageEntry: CatalogEntry | null;
  tier: Tier;
  video: VideoChoice | null;
  seconds: number;
  budget: number | null;
  /** The estimate is within the budget (always true without one). */
  fits: boolean;
  /** When it does not fit: how long the fastest combination takes. */
  fastest?: number;
  /** What is installed but cannot run on this machine, and what could be installed to do better. */
  notes: string[];
  better: CatalogEntry[];
  machine: AutoMachine;
  /** Something installed can animate on this machine, in a project that can animate. */
  animationAvailable: boolean;
  /** How many scenes the plan switches animation on in. */
  newlyAnimated: number;
}

const fitsMachine = (e: CatalogEntry, m: AutoMachine): boolean =>
  (e.vram_mb ?? 0) <= m.vramMb && (e.min_ram_gb === undefined || m.ramGb === null || e.min_ram_gb <= m.ramGb);

function styleOf(cfg: ProjectConfig, catalog: CatalogEntry[]): Style {
  const s = chosenModelEntry(cfg, catalog)?.styles?.[0];
  return s ?? 'photo';
}

/** The installed editing models (FLUX.1 Kontext, Qwen-Image-Edit) that fit this machine. */
export function editEntriesFor(catalog: CatalogEntry[], m: AutoMachine): CatalogEntry[] {
  return catalog.filter((e) => e.kind === 'model' && e.edit && e.installed && fitsMachine(e, m));
}

/** The installed editing model that fits this machine for an engine (the fast one when none is asked); null when there is none. */
export function editEntryFor(catalog: CatalogEntry[], m: AutoMachine, engine?: EditEngine | null): CatalogEntry | null {
  return pickEditEntry(editEntriesFor(catalog, m), engine);
}

/** The looks (photo, anime, general and any other an installed model declares) with an image model that fits this machine. */
export function availableStyles(catalog: CatalogEntry[], m: AutoMachine): Style[] {
  const fit = catalog.filter((e) => fitsMachine(e, m));
  return stylesOf(fit).filter((s) => !!pickStyleEntry(fit, s));
}

/** The installed image model that fits the machine for the project's style (any style when that one has none). */
export function imageEntryFor(cfg: ProjectConfig, catalog: CatalogEntry[], m: AutoMachine, style: Style | null = null): CatalogEntry | null {
  const fit = catalog.filter((e) => fitsMachine(e, m));
  return pickStyleEntry(fit, style ?? styleOf(cfg, catalog)) ?? pickStyleEntry(fit, 'general') ?? pickStyleEntry(fit, 'photo') ?? pickStyleEntry(fit, 'anime');
}

/** The video choices the machine and the installed models allow, best first. */
function videoChoices(catalog: CatalogEntry[], m: AutoMachine): { choices: VideoChoice[]; notes: string[] } {
  const notes: string[] = [];
  const fit = catalog.filter((e) => fitsMachine(e, m));
  const choices: VideoChoice[] = [];
  // The first-frame bundle is preferred when it is installed: the shot starts exactly from the picture and the
  // subjects stay in frame; its 8-step LoRA also makes a better draft than the reference one (4 steps).
  const ff = miniMaxFirstFrameEntry(catalog);
  const h3 = ff?.installed ? ff : miniMaxEntry(catalog);
  if (h3?.installed) {
    // On a card with less memory than the preset needs, a measured lower resolution may still fit.
    const small = !fitsMachine(h3, m) && h3.low_vram && fitsMachine({ ...h3, vram_mb: h3.low_vram.vram_mb }, m) ? h3.low_vram.resolution : undefined;
    if (fitsMachine(h3, m) || small) {
      const firstFrame = h3 === ff;
      const resolution = small;
      choices.push({ id: 'h3-full', engine: 'minimax-h3', firstFrame, resolution, entry: h3 });
      if (h3.files.some((f) => f.role === 'lora')) choices.push({ id: 'h3-draft', engine: 'minimax-h3', turbo: true, firstFrame, resolution, entry: h3 });
      if (small) notes.push($localize`:@@auto.noteH3Small:MiniMax H3 fits your card at a lower resolution (${small}:res:)`);
    } else {
      notes.push($localize`:@@auto.noteH3:MiniMax H3 is installed but does not fit this machine (it needs ${Math.round((h3.vram_mb ?? 0) / 1024)}:vram: GB of VRAM and ${h3.min_ram_gb ?? 0}:ram: GB of RAM)`);
    }
  }
  // LTX-2.3 has no levels and fits a 12 GB card at its preset; it sits after Wan high and before the H3 draft, so a
  // time limit too short for the full H3 reaches it first.
  const ltx = ltxEntry(catalog);
  if (ltx?.installed) {
    if (fitsMachine(ltx, m)) choices.push({ id: 'ltx', engine: 'ltx-2.3', entry: ltx });
    else notes.push($localize`:@@auto.noteLtx:LTX 2.3 is installed but does not fit this machine (it needs ${Math.round((ltx.vram_mb ?? 0) / 1024)}:vram: GB of VRAM and ${ltx.min_ram_gb ?? 0}:ram: GB of RAM)`);
  }
  for (const tier of ['high', 'medium', 'low'] as Tier[]) {
    const w = pickWanEntry(fit, tier);
    if (w && w.used === tier) choices.push({ id: `wan-${tier}` as VideoChoiceId, engine: 'wan', tier, entry: w.entry });
  }
  const ad = animateDiffEntry(catalog);
  if (ad?.installed && fitsMachine(ad, m) && installedSd15(catalog)) {
    for (const tier of ['high', 'medium', 'low'] as Tier[]) choices.push({ id: `ad-${tier}` as VideoChoiceId, engine: 'animatediff', tier, entry: ad });
  }
  choices.sort((a, b) => VIDEO_ORDER.indexOf(a.id) - VIDEO_ORDER.indexOf(b.id));
  return { choices, notes };
}

/**
 * Writes a choice on a copy of the project: the image model, the animation (engine, files and, for Wan and
 * AnimateDiff, its own level) and the level of the pictures, which can be another one: a slower animation can
 * be paid for with cheaper pictures.
 */
export function writePlan(cfg: ProjectConfig, imageEntry: CatalogEntry | null, imageTier: Tier, video: VideoChoice | null, catalog: CatalogEntry[], maxPx: number | null = null): ProjectConfig {
  let c = cfg;
  if (imageEntry) c = applyStyleEntry(c, imageEntry);
  if (video) {
    c = applyAnimateEngine(c, video.engine, catalog).config;
    if (video.engine === 'minimax-h3' && video.firstFrame) c = applyMiniMaxMode(c, true, catalog).config;
    if (video.engine === 'minimax-h3' && video.resolution && c.defaults.animate) c.defaults.animate.resolution = video.resolution;
    if (video.engine === 'minimax-h3' && video.turbo) {
      const lora = video.entry.files.find((f) => f.role === 'lora');
      if (lora && c.defaults.animate) {
        c.defaults.animate.lora = `models/video/${lora.name}`;
        c.defaults.animate.steps = video.entry.timing?.turbo_steps ?? 4;
      }
    }
  }
  // The level of the animation, when it has one (it writes the pictures' too)...
  c = applyTier(c, video?.tier ?? imageTier, catalog).config;
  // A project that animates nothing keeps its animation block as it was: a level would write the Wan files into it.
  if (!video) {
    if (cfg.defaults.animate) c.defaults.animate = structuredClone(cfg.defaults.animate);
    else delete c.defaults.animate;
  }
  // ... and the pictures' own level when it is another one.
  if (video?.tier && video.tier !== imageTier) {
    const v = tierValues(imageTier, chosenModelEntry(c, catalog)?.preset ?? null);
    c.defaults.resolution = v.resolution;
    c.defaults.steps = v.steps;
    if (c.output.mode === 'images') c.scenes.forEach((sc) => sc.image === undefined && (sc.variants = v.variants));
  }
  // The pictures must fit the card: a higher level can ask for more than the model can do there.
  if (maxPx !== null) c.defaults.resolution = fitResolution(c.defaults.resolution, maxPx);
  return c;
}

const animatesSomething = (cfg: ProjectConfig): boolean => cfg.output.mode !== 'images' && cfg.scenes.some((s) => s.animate && s.clip === undefined);

/**
 * Chooses the best the machine can do within the time the user gives: the highest-ranked animation that
 * is installed and fits, and the highest level of image quality, such that the estimate stays within
 * the budget. Without a budget it is just the best that fits. When nothing fits, the fastest combination.
 */
export function planAuto(
  cfg: ProjectConfig,
  catalog: CatalogEntry[],
  machine: AutoMachine,
  budget: number | null,
  animateAll: boolean | ((scene: Scene) => boolean) = false,
  only: VideoChoiceId | null = null,
  style: Style | null = null,
): AutoPlan {
  const canAnimate = cfg.output.mode !== 'images' && cfg.scenes.some((s) => s.clip === undefined);
  const found = canAnimate ? videoChoices(catalog, machine) : { choices: [] as VideoChoice[], notes: [] as string[] };
  const choices = found.choices;
  const notes = found.notes;
  // "Animate the scenes" switches animation on in every scene that does not bring its own clip (or, given a
  // predicate, only in the scenes it accepts), when something can animate.
  const wants = typeof animateAll === 'function' ? animateAll : () => animateAll;
  const switchOn = !!animateAll && canAnimate && choices.length > 0;
  const toAnimate = (s: Scene): boolean => s.clip === undefined && wants(s);
  const base = switchOn ? { ...cfg, scenes: cfg.scenes.map((s) => (toAnimate(s) ? { ...s, animate: true } : s)) } : cfg;
  const newlyAnimated = switchOn ? cfg.scenes.filter((s) => toAnimate(s) && !s.animate).length : 0;
  const imageEntry = imageEntryFor(base, catalog, machine, style);
  const maxPx = maxPicturePixels(imageEntry, machine);
  const animated = animatesSomething(base);
  if (animated && choices.length === 0) {
    notes.push($localize`:@@auto.noteNoVideo:No animation model that fits this machine is installed: the animation is left alone`);
  }
  // A choice made by the user is the only one tried (when it cannot run here the usual ones stay).
  const forced = only ? choices.filter((c) => c.id === only) : [];
  const options: (VideoChoice | null)[] = animated && choices.length > 0 ? (forced.length > 0 ? forced : choices) : [null];
  const combos: { video: VideoChoice | null; tier: Tier; config: ProjectConfig; seconds: number }[] = [];
  for (const video of options) {
    // Each animation is tried with the pictures at every level, the best first.
    for (const tier of [...TIERS].reverse()) {
      const config = writePlan(base, imageEntry, tier, video, catalog, maxPx);
      combos.push({ video, tier, config, seconds: estimateSeconds(config, catalog, machine.speed) });
    }
  }
  const chosen = budget === null ? combos[0] : (combos.find((c) => c.seconds <= budget) ?? null);
  const fastest = [...combos].sort((a, b) => a.seconds - b.seconds)[0];
  const pick = chosen ?? fastest;
  const wanted = writePlan(base, imageEntry, pick.tier, pick.video, catalog).defaults.resolution;
  if (wanted !== pick.config.defaults.resolution) {
    const from = wanted;
    const to = pick.config.defaults.resolution;
    notes.push($localize`:@@auto.noteCapped:The resolution of the pictures is limited to ${to}:to: (instead of ${from}:from:) so that it fits the memory of your card`);
  }
  if (!imageEntry) notes.push($localize`:@@auto.noteNoImage:No image model that fits this machine is installed: install one in Models`);
  // What would do better: higher-ranked video entries that would fit but are not installed.
  const better: CatalogEntry[] = [];
  if (animated) {
    const have = choices[0] ? VIDEO_ORDER.indexOf(choices[0].id) : VIDEO_ORDER.length;
    const h3 = miniMaxFirstFrameEntry(catalog) ?? miniMaxEntry(catalog);
    if (h3 && !h3.installed && fitsMachine(h3, machine) && have > VIDEO_ORDER.indexOf('h3-full')) better.push(h3);
    const high = catalog.find((e) => e.kind === 'video' && e.quality === 'high');
    if (high && !high.installed && fitsMachine(high, machine) && have > VIDEO_ORDER.indexOf('wan-high')) better.push(high);
  }
  return {
    config: pick.config,
    imageEntry,
    tier: pick.tier,
    video: pick.video,
    seconds: pick.seconds,
    budget,
    fits: budget === null || chosen !== null,
    fastest: chosen === null ? fastest.seconds : undefined,
    notes,
    better,
    machine,
    animationAvailable: canAnimate && choices.length > 0,
    newlyAnimated,
  };
}

/** One line per thing the plan chose, for the preview and for the note after applying it. */
export function describePlan(plan: AutoPlan): string[] {
  const c = plan.config;
  const lines: string[] = [];
  if (plan.imageEntry) lines.push($localize`:@@auto.lineImage:Image: ${catalogName(plan.imageEntry)}:model: · ${c.defaults.resolution}:res: · ${c.defaults.steps}:steps: steps`);
  if (plan.newlyAnimated > 0) lines.push($localize`:@@auto.lineAnimateOn:Animation switched on in ${plan.newlyAnimated}:n: scenes`);
  const a = c.defaults.animate;
  if (plan.video && a) {
    const frames = a.frames ? $localize`:@@auto.frames: · ${a.frames}:n: frames` : '';
    const turbo = plan.video.turbo ? $localize`:@@auto.turbo: (draft, with the turbo LoRA)` : '';
    lines.push($localize`:@@auto.lineVideo:Animation: ${plan.video.engine === 'minimax-h3' ? 'MiniMax H3' : plan.video.engine === 'ltx-2.3' ? 'LTX 2.3' : plan.video.engine === 'animatediff' ? 'AnimateDiff' : catalogName(plan.video.entry)}:engine:${turbo}:turbo: · ${a.resolution ?? ''}:res:${frames}:frames: · ${a.steps ?? ''}:steps: steps`);
  }
  return lines;
}

/**
 * The configuration of a brand-new project when Easy mode chooses for it: the best image model that fits the machine
 * and its highest level (within the card), and the best animation that fits, written as the project's animation
 * (so the scenes added later come animated). The project has no scenes yet, so a placeholder stands for them while
 * the plan is made and is then dropped. null when nothing can be chosen (no image model installed that fits).
 */
export function easyConfigForNewProject(cfg: ProjectConfig, catalog: CatalogEntry[], machine: AutoMachine): ProjectConfig | null {
  return easyPlanForNewProject(cfg, catalog, machine)?.config ?? null;
}

/** What the page tells a request that has speech: the model's audio goes with LTX 2.3, the engine that suits it. */
export interface EasyChoices {
  /** The engine the user picked; absent = automatic. */
  engine?: VideoChoiceId;
  /** The request carries words to say: automatic prefers LTX 2.3 and turns the model's audio on. */
  speech?: boolean;
  /** The look of the pictures the user asked for; absent = the project's (photorealistic when it says nothing). */
  style?: Style;
}

export interface EasyPlan {
  config: ProjectConfig;
  video: VideoChoice | null;
  /** The image model chosen. */
  imageEntry: CatalogEntry | null;
  /** Automatic took LTX 2.3 because of the speech. */
  speechPick: boolean;
  /** The request has speech and automatic could not take LTX 2.3 (not installed, or it does not fit here). */
  noSpeechEngine: boolean;
}

/** The same plan as `easyConfigForNewProject`, with the engine the user picked and what speech asks for. */
export function easyPlanForNewProject(cfg: ProjectConfig, catalog: CatalogEntry[], machine: AutoMachine, choices: EasyChoices = {}): EasyPlan | null {
  if (cfg.output.mode === 'music') return null;
  const draft: ProjectConfig = { ...cfg, scenes: [{ id: 'draft', prompt: 'draft', negative_prompt: '', tts_text: '', speed: 1, lora: '', silence_seconds: 2 }] };
  const animates = cfg.output.mode !== 'images';
  const ltxFits = animates && videoChoices(catalog, machine).choices.some((c) => c.id === 'ltx');
  const preferLtx = !choices.engine && !!choices.speech && ltxFits;
  const plan = planAuto(draft, catalog, machine, null, animates, choices.engine ?? (preferLtx ? 'ltx' : null), choices.style ?? null);
  if (!plan.imageEntry) return null;
  const config = { ...plan.config, scenes: cfg.scenes };
  const speechPick = preferLtx && plan.video?.id === 'ltx';
  if (speechPick && config.defaults.animate) config.defaults.animate = { ...config.defaults.animate, model_audio: true };
  return { config, video: plan.video, imageEntry: plan.imageEntry, speechPick, noSpeechEngine: !choices.engine && !!choices.speech && animates && !ltxFits };
}

/** The name of an engine and its level, for the lists the user picks from. */
export function videoChoiceLabel(c: VideoChoice): string {
  switch (c.id) {
    case 'h3-full':
      return 'MiniMax H3';
    case 'h3-draft':
      return $localize`:@@auto.labelH3Draft:MiniMax H3 (draft)`;
    case 'ltx':
      return 'LTX 2.3';
    case 'wan-high':
      return $localize`:@@auto.labelWanHigh:Wan (high quality)`;
    case 'wan-medium':
      return $localize`:@@auto.labelWanMedium:Wan (medium quality)`;
    case 'wan-low':
      return $localize`:@@auto.labelWanLow:Wan (low quality)`;
    case 'ad-high':
      return $localize`:@@auto.labelAdHigh:AnimateDiff (high)`;
    case 'ad-medium':
      return $localize`:@@auto.labelAdMedium:AnimateDiff (medium)`;
    default:
      return $localize`:@@auto.labelAdLow:AnimateDiff (low)`;
  }
}

export interface VideoOption {
  id: VideoChoiceId;
  video: VideoChoice;
  seconds: number;
}

/**
 * The engines a video request can be made with on this machine, in the planner's order, each timed on the
 * configuration it would write. Empty when nothing can animate. The automatic choice is not among them.
 */
export function videoOptionsFor(cfg: ProjectConfig, catalog: CatalogEntry[], machine: AutoMachine): VideoOption[] {
  const out: VideoOption[] = [];
  const { choices } = videoChoices(catalog, machine);
  for (const video of choices) {
    const plan = easyPlanForNewProject(cfg, catalog, machine, { engine: video.id });
    if (plan?.video?.id === video.id) out.push({ id: video.id, video, seconds: estimateSeconds(plan.config, catalog, machine.speed) });
  }
  return out;
}
