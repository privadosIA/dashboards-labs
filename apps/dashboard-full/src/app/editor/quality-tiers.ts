import { catalogName } from '../core/catalog-text';
import { AnimateEngine, AnimateSettings, CatalogEntry, CatalogPreset, ProjectConfig, Scene, SceneAnimation, SceneRender } from '../core/api.models';

/** What an image model is good for; the catalog declares it per entry. */
/** A look: the three built-in ones, or any other a catalog entry declares in `styles` (they show only when installed). */
export type Style = string;
export type Tier = 'low' | 'medium' | 'high';

export const STYLES: Style[] = ['photo', 'anime', 'general'];

/** The built-in looks, then the others the installed image models declare, in alphabetical order. */
export function stylesOf(catalog: CatalogEntry[]): Style[] {
  const extra = new Set<string>();
  for (const e of catalog) {
    if (e.kind !== 'model' || e.edit || !e.installed) continue;
    for (const s of e.styles ?? []) if (!STYLES.includes(s)) extra.add(s);
  }
  return [...STYLES, ...[...extra].sort()];
}
/** What the user picks as a project's look: a style, or editing his own pictures by instruction. */
export type StyleChoice = Style | 'edit';
export const TIERS: Tier[] = ['low', 'medium', 'high'];

/** Values of a level the user can change (an absent field means "the derived value"). */
export interface TierOverride {
  resolution?: string;
  steps?: number;
  variants?: number;
  /** An installed LoRA written to every scene that generates its picture; empty = leave the scenes alone. */
  lora?: string;
  wanResolution?: string;
  wanFrames?: number;
  wanSteps?: number;
  /** The same three, for a project that animates with AnimateDiff. */
  adResolution?: string;
  adFrames?: number;
  adSteps?: number;
}
export type TierOverrides = Partial<Record<Tier, TierOverride>>;

/**
 * What a level writes, once derived and overridden. `wanResolution`, `wanFrames`
 * and `wanSteps` are the animation values of the project's engine (Wan, or
 * AnimateDiff when it animates with that).
 */
export interface TierValues {
  resolution: string;
  steps: number;
  variants: number;
  lora: string;
  wanResolution: string;
  wanFrames: number;
  wanSteps: number;
}

/** What a level overwrote, so "Undo" restores exactly that. */
export interface TierUndo {
  steps: number;
  resolution: string;
  cfg_scale?: number;
  /** The animation fields overwritten; `{}` when the block did not exist, null when the animation was not touched. */
  animate: Partial<AnimateSettings> | null;
  scenes: { index: number; id: string; lora: string; variants?: number }[];
}

export interface TierResult {
  config: ProjectConfig;
  /** What was written, one short phrase each, for the note. */
  note: string[];
  undo: TierUndo;
}

const FACTORS: Record<Tier, { res: number; steps: number; variants: number; frames: number }> = {
  low: { res: 0.75, steps: 0.5, variants: 1, frames: 17 },
  medium: { res: 1, steps: 1, variants: 2, frames: 33 },
  high: { res: 1.25, steps: 1.5, variants: 4, frames: 49 },
};

/** Without a catalog preset the levels start from sd's own defaults. */
const FALLBACK_BASE = { resolution: '512x512', steps: 20 };
const WAN_BASE = { resolution: '832x480', steps: 20, twoExpertSteps: 10 };

/** AnimateDiff's levels: 16 frames is what the motion module was trained on; sides are multiples of 8. */
const ANIMATEDIFF_LEVELS: Record<Tier, { resolution: string; frames: number; steps: number }> = {
  low: { resolution: '384x384', frames: 8, steps: 12 },
  medium: { resolution: '512x512', frames: 16, steps: 25 },
  high: { resolution: '640x640', frames: 24, steps: 38 },
};

/** The engine a project animates with: Wan unless `defaults.animate.engine` says AnimateDiff, MiniMax-H3 or LTX-2.3. */
export function animateEngine(cfg: ProjectConfig | null | undefined): AnimateEngine {
  const e = cfg?.defaults.animate?.engine;
  return e === 'animatediff' || e === 'minimax-h3' || e === 'ltx-2.3' ? e : 'wan';
}

/** Scales both sides of WIDTHxHEIGHT and rounds each to a multiple (at least one multiple). */
export function scaleResolution(res: string, factor: number, multiple: number): string {
  const m = /^(\d+)x(\d+)$/.exec(res);
  if (!m) return res;
  const round = (n: number) => Math.max(multiple, Math.round((n * factor) / multiple) * multiple);
  return `${round(+m[1])}x${round(+m[2])}`;
}

const pixelsOf = (res: string): number => {
  const m = /^(\d+)x(\d+)$/.exec(res);
  return m ? +m[1] * +m[2] : 0;
};

/** The biggest resolution of the same shape, in multiples of 64, that stays within the pixels; unchanged when it already does. */
export function fitResolution(res: string, maxPx: number): string {
  if (pixelsOf(res) <= maxPx) return res;
  let factor = Math.sqrt(maxPx / pixelsOf(res));
  let out = scaleResolution(res, factor, 64);
  while (pixelsOf(out) > maxPx && factor > 0.2) {
    factor -= 0.02;
    out = scaleResolution(res, factor, 64);
  }
  return out;
}

/** Values of a level derived from a base, before any customization. */
export function derivedTier(
  tier: Tier,
  preset: CatalogPreset | null | undefined,
  twoExpert = false,
  engine: AnimateEngine = 'wan',
): TierValues {
  const f = FACTORS[tier];
  const ad = ANIMATEDIFF_LEVELS[tier];
  const baseRes = preset?.resolution ?? FALLBACK_BASE.resolution;
  const baseSteps = preset?.steps ?? FALLBACK_BASE.steps;
  const wanSteps = twoExpert ? WAN_BASE.twoExpertSteps : WAN_BASE.steps;
  return {
    resolution: scaleResolution(baseRes, f.res, 64),
    steps: Math.max(4, Math.round(baseSteps * f.steps)),
    variants: f.variants,
    lora: '',
    wanResolution: engine === 'animatediff' ? ad.resolution : scaleResolution(WAN_BASE.resolution, f.res, 16),
    wanFrames: engine === 'animatediff' ? ad.frames : f.frames,
    wanSteps: engine === 'animatediff' ? ad.steps : Math.max(4, Math.round(wanSteps * f.steps)),
  };
}

/** Derived values with the user's customizations on top; an empty field means the derived value. */
export function tierValues(
  tier: Tier,
  preset: CatalogPreset | null | undefined,
  overrides: TierOverrides = {},
  twoExpert = false,
  engine: AnimateEngine = 'wan',
): TierValues {
  const d = derivedTier(tier, preset, twoExpert, engine);
  const o = overrides[tier] ?? {};
  const animation =
    engine === 'animatediff'
      ? {
          wanResolution: o.adResolution || d.wanResolution,
          wanFrames: o.adFrames || d.wanFrames,
          wanSteps: o.adSteps || d.wanSteps,
        }
      : {
          wanResolution: o.wanResolution || d.wanResolution,
          wanFrames: o.wanFrames || d.wanFrames,
          wanSteps: o.wanSteps || d.wanSteps,
        };
  return {
    resolution: o.resolution || d.resolution,
    steps: o.steps || d.steps,
    variants: o.variants || d.variants,
    lora: o.lora ?? d.lora,
    ...animation,
  };
}

// --- catalog lookups ----------------------------------------------------------

const baseName = (path?: string): string => (path ? (path.split('/').pop() ?? '') : '');

/** Catalog entry whose `model` file is the given file name. */
export function entryForFile(catalog: CatalogEntry[], file: string): CatalogEntry | null {
  if (!file) return null;
  // A file with no role is the checkpoint itself (SD 1.5 and SDXL are a single file with no role in the catalog).
  return catalog.find((e) => e.files.some((f) => (f.role === 'model' || !f.role) && f.name === file)) ?? null;
}

/** The model the project is set to use: the set's diffusion model, else the checkpoint. */
export function chosenModelEntry(cfg: ProjectConfig, catalog: CatalogEntry[]): CatalogEntry | null {
  const d = cfg.defaults;
  return entryForFile(catalog, baseName(d.model_set ? d.model_set.diffusion_model : d.model));
}

/** The installed model for a style with the lowest `style_rank`; null when none is installed. */
export function pickStyleEntry(catalog: CatalogEntry[], style: Style): CatalogEntry | null {
  const candidates = catalog
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.kind === 'model' && e.installed && e.styles?.includes(style));
  candidates.sort((a, b) => (a.e.style_rank || 99) - (b.e.style_rank || 99) || a.i - b.i);
  return candidates[0]?.e ?? null;
}

/** Whether any installed model serves the style. */
export function styleAvailable(catalog: CatalogEntry[], style: Style): boolean {
  return pickStyleEntry(catalog, style) !== null;
}

/**
 * The installed Wan bundle for a level: the one declaring it, else the nearest
 * installed level (the lower one on a tie). `used` is the level actually found.
 */
export function pickWanEntry(catalog: CatalogEntry[], tier: Tier): { entry: CatalogEntry; used: Tier } | null {
  const installed = catalog.filter((e) => e.kind === 'video' && e.installed && e.quality);
  const want = TIERS.indexOf(tier);
  const ranked = installed
    .map((entry) => ({ entry, used: entry.quality as Tier }))
    .sort((a, b) => {
      const da = Math.abs(TIERS.indexOf(a.used) - want);
      const db = Math.abs(TIERS.indexOf(b.used) - want);
      return da - db || TIERS.indexOf(a.used) - TIERS.indexOf(b.used);
    });
  return ranked[0] ?? null;
}

const fileOf = (e: CatalogEntry, role: string): string =>
  // A checkpoint that is the entry's only file has no role in the catalog (SD 1.5, SDXL): it is the model.
  (e.files.find((f) => f.role === role) ?? (role === 'model' ? e.files.find((f) => !f.role) : undefined))?.name ?? '';

// --- applying -----------------------------------------------------------------

/**
 * Writes the model of a catalog entry (a model set when it has a text encoder
 * and a VAE, a single checkpoint otherwise) and its recommended settings.
 * The input is not modified.
 */
export function applyStyleEntry(cfg: ProjectConfig, entry: CatalogEntry): ProjectConfig {
  const c = structuredClone(cfg);
  const model = fileOf(entry, 'model');
  const llm = fileOf(entry, 'text_encoder');
  const vae = fileOf(entry, 'vae');
  if (llm && vae) {
    c.defaults.model = '';
    c.defaults.model_set = { ...c.defaults.model_set, diffusion_model: `models/${model}`, llm: `models/${llm}`, vae: `models/${vae}` };
  } else {
    c.defaults.model = `models/${model}`;
    delete c.defaults.model_set;
  }
  if (entry.adult) c.adult = true;
  const p = entry.preset;
  if (p) {
    if (p.steps !== undefined) c.defaults.steps = p.steps;
    if (p.resolution !== undefined) c.defaults.resolution = p.resolution;
    if (p.cfg_scale !== undefined && c.defaults.model_set) c.defaults.model_set.cfg_scale = p.cfg_scale;
  }
  return c;
}

/**
 * Writes a quality level: resolution, steps and cfg (model set only), the
 * scenes' variants (images mode) and LoRA, and in video mode the installed Wan
 * with its settings. The input is not modified.
 */
export function applyTier(
  cfg: ProjectConfig,
  tier: Tier,
  catalog: CatalogEntry[],
  overrides: TierOverrides = {},
  maxPx: number | null = null,
): TierResult {
  const c = structuredClone(cfg);
  const preset = chosenModelEntry(c, catalog)?.preset;
  const images = c.output.mode === 'images';
  const video = !images;
  const engine = animateEngine(c);
  // With AnimateDiff the engine and its files stay as chosen: no Wan is picked.
  const wan = video && engine === 'wan' ? pickWanEntry(catalog, tier) : null;
  const twoExpert = !!(wan && fileOf(wan.entry, 'high_noise_model'));
  const v = tierValues(tier, preset, overrides, twoExpert, engine);
  // The card must hold the picture: a level can ask for more than the model can do there.
  if (maxPx !== null) v.resolution = fitResolution(v.resolution, maxPx);

  const undo: TierUndo = {
    steps: c.defaults.steps,
    resolution: c.defaults.resolution,
    cfg_scale: c.defaults.model_set?.cfg_scale,
    animate: null,
    scenes: [],
  };
  const note: string[] = [];

  c.defaults.resolution = v.resolution;
  c.defaults.steps = v.steps;
  note.push(v.resolution, $localize`:@@tier.noteSteps:${v.steps} steps`);
  if (preset?.cfg_scale !== undefined && c.defaults.model_set) {
    c.defaults.model_set.cfg_scale = preset.cfg_scale;
  }

  c.scenes.forEach((s, index) => {
    if (s.image !== undefined) return; // brings its own picture: nothing is generated
    const setLora = v.lora !== '';
    if (!setLora && !images) return;
    undo.scenes.push({ index, id: s.id, lora: s.lora, variants: s.variants });
    if (setLora) s.lora = v.lora;
    if (images) s.variants = v.variants;
  });
  if (images) note.push($localize`:@@tier.noteVariants:${v.variants} variants`);
  if (v.lora) note.push(`lora ${v.lora}`);

  if (video && engine === 'ltx-2.3') {
    // Its files and settings (768x416, 8k+1 frames, fixed 24 fps) are chosen in the engine selector or the YAML.
    note.push($localize`:@@tier.noteLtx:LTX 2.3: the animation was left untouched`);
  } else if (video && engine === 'minimax-h3') {
    // Its files and settings (864x480, 17k+5 frames, fixed 24 fps) are chosen in the YAML.
    note.push($localize`:@@tier.noteMiniMax:MiniMax-H3: the animation was left untouched`);
  } else if (video && engine === 'animatediff') {
    const a = c.defaults.animate as AnimateSettings;
    undo.animate = { resolution: a.resolution, frames: a.frames, steps: a.steps };
    a.resolution = v.wanResolution;
    a.frames = v.wanFrames;
    a.steps = v.wanSteps;
    note.push(`AnimateDiff ${v.wanResolution} · ${v.wanFrames} f · ${v.wanSteps}`);
  } else if (video) {
    if (wan) {
      const prev = c.defaults.animate;
      undo.animate = prev
        ? {
            diffusion_model: prev.diffusion_model,
            high_noise_diffusion_model: prev.high_noise_diffusion_model,
            t5xxl: prev.t5xxl,
            vae: prev.vae,
            resolution: prev.resolution,
            frames: prev.frames,
            steps: prev.steps,
            high_noise_steps: prev.high_noise_steps,
            high_noise_cfg_scale: prev.high_noise_cfg_scale,
          }
        : {};
      const a: AnimateSettings = (c.defaults.animate ??= { diffusion_model: '', t5xxl: '', vae: '' });
      a.diffusion_model = `models/video/${fileOf(wan.entry, 'model')}`;
      a.t5xxl = `models/video/${fileOf(wan.entry, 'text_encoder')}`;
      a.vae = `models/video/${fileOf(wan.entry, 'vae')}`;
      if (twoExpert) {
        a.high_noise_diffusion_model = `models/video/${fileOf(wan.entry, 'high_noise_model')}`;
      } else {
        delete a.high_noise_diffusion_model;
        delete a.high_noise_steps;
        delete a.high_noise_cfg_scale;
      }
      a.resolution = v.wanResolution;
      a.frames = v.wanFrames;
      a.steps = v.wanSteps;
      note.push(`Wan: ${catalogName(wan.entry)}`);
      if (wan.used !== tier) {
        note.push($localize`:@@tier.noteWanFallback:the Wan ${tierLabel(tier)} tier is not installed; ${tierLabel(wan.used)} was used`);
      }
    } else {
      note.push($localize`:@@tier.noteNoWan:no Wan is installed: the animation was left untouched`);
    }
  }
  return { config: c, note, undo };
}

/**
 * The level the project is at: the one whose values the project already has
 * (resolution, steps and, when it animates with Wan or AnimateDiff, the
 * animation's), or null when none of them matches.
 */
export function activeTier(cfg: ProjectConfig, catalog: CatalogEntry[], overrides: TierOverrides = {}, maxPx: number | null = null): Tier | null {
  const same = (a: ProjectConfig, b: ProjectConfig): boolean =>
    a.defaults.resolution === b.defaults.resolution &&
    a.defaults.steps === b.defaults.steps &&
    (a.defaults.animate?.resolution === b.defaults.animate?.resolution || !b.defaults.animate) &&
    (a.defaults.animate?.frames === b.defaults.animate?.frames || !b.defaults.animate) &&
    (a.defaults.animate?.steps === b.defaults.animate?.steps || !b.defaults.animate);
  return TIERS.find((tier) => same(cfg, applyTier(cfg, tier, catalog, overrides, maxPx).config)) ?? null;
}

/** Restores exactly what `applyTier` overwrote. The input is not modified. */
export function undoTier(cfg: ProjectConfig, undo: TierUndo): ProjectConfig {
  const c = structuredClone(cfg);
  c.defaults.steps = undo.steps;
  c.defaults.resolution = undo.resolution;
  if (c.defaults.model_set) c.defaults.model_set.cfg_scale = undo.cfg_scale;
  if (undo.animate) {
    if (Object.keys(undo.animate).length === 0) {
      delete c.defaults.animate;
    } else if (c.defaults.animate) {
      const a = c.defaults.animate as unknown as Record<string, unknown>;
      for (const [k, val] of Object.entries(undo.animate)) {
        if (val === undefined) delete a[k];
        else a[k] = val;
      }
    }
  }
  for (const s of undo.scenes) {
    const sc = c.scenes[s.index];
    if (!sc || sc.id !== s.id) continue; // the scene moved or went away: leave it
    sc.lora = s.lora;
    if (s.variants === undefined) delete sc.variants;
    else sc.variants = s.variants;
  }
  return c;
}

export function tierLabel(t: Tier): string {
  return t === 'low'
    ? $localize`:@@tier.low:Low`
    : t === 'medium'
      ? $localize`:@@tier.medium:Medium`
      : $localize`:@@tier.high:High`;
}

/** What a choice of look is, in one line, for the places that ask the user to pick one. */
export function styleHelp(s: StyleChoice | 'auto'): string {
  switch (s) {
    case 'photo':
      return $localize`:@@styleHelp.photo:Realistic photos of people, places and things.`;
    case 'anime':
      return $localize`:@@styleHelp.anime:Drawing, illustration and anime.`;
    case 'general':
      return $localize`:@@styleHelp.general:A general-purpose model with no marked style.`;
    case 'auto':
      return $localize`:@@styleHelp.auto:The usual one: the model that best fits your machine.`;
    case 'edit':
      return $localize`:@@styleHelp.edit:Retouch a picture of yours with an instruction ("put a red cap on him"): it only changes what you say. It needs your picture.`;
    default:
      return $localize`:@@styleHelp.other:Specialised models of this style, installed on your machine.`;
  }
}

export function editLabel(): string {
  return $localize`:@@style.edit:Retouch (edit pictures)`;
}

/** The engines of Retoque: Fast (FLUX.1 Kontext) and Precise (Qwen-Image-Edit). */
export type EditEngine = 'fast' | 'precise';

/** Which engine an editing catalog entry is: the Qwen family has a vision projector, FLUX.1 Kontext has not. */
export function editEngineOf(entry: CatalogEntry): EditEngine {
  return entry.files.some((f) => f.role === 'llm_vision') ? 'precise' : 'fast';
}

/** Which engine the project's editing model set is, or null when the project does not edit. */
export function editEngineOfSet(cfg: ProjectConfig | null): EditEngine | null {
  const ms = cfg?.defaults.model_set;
  if (!ms?.edit) return null;
  return ms.llm_vision ? 'precise' : 'fast';
}

export function editEngineLabel(e: EditEngine): string {
  return e === 'precise' ? $localize`:@@editEngine.precise:Precise (Qwen-Image-Edit)` : $localize`:@@editEngine.fast:Fast (FLUX.1 Kontext)`;
}

/** What sets an engine of Retoque apart, in one line (the times are the ones measured on a 12 GB card). */
export function editEngineHelp(e: EditEngine): string {
  return e === 'precise'
    ? $localize`:@@editEngineHelp.precise:Slower (about 2 min per picture) and with a licence that allows commercial use.`
    : $localize`:@@editEngineHelp.fast:The fastest (about 40 s per picture); its licence does not allow commercial use.`;
}

/** The installed editing entry for an engine; without one asked, the fast one, or the only one there is. */
export function pickEditEntry(entries: CatalogEntry[], engine?: EditEngine | null): CatalogEntry | null {
  const edits = entries.filter((e) => e.kind === 'model' && e.edit && e.installed);
  return (engine ? edits.find((e) => editEngineOf(e) === engine) : undefined) ?? edits.find((e) => editEngineOf(e) === 'fast') ?? edits[0] ?? null;
}

/**
 * Writes an editing model (FLUX.1 Kontext or Qwen-Image-Edit) as the project's image model: its four files, its settings and no
 * strength (a scene's starting picture is then the picture to edit). The input is not modified.
 */
export function applyEditEntry(cfg: ProjectConfig, entry: CatalogEntry): ProjectConfig {
  const c = structuredClone(cfg);
  const file = (role: string) => `models/${fileOf(entry, role)}`;
  c.defaults.model = '';
  c.defaults.model_set =
    editEngineOf(entry) === 'precise'
      ? { edit: true, diffusion_model: file('model'), vae: file('vae'), llm: file('llm'), llm_vision: file('llm_vision'), cfg_scale: entry.preset?.cfg_scale ?? 2.5 }
      : { edit: true, diffusion_model: file('model'), vae: file('vae'), clip_l: file('clip_l'), t5xxl: file('t5xxl'), cfg_scale: entry.preset?.cfg_scale ?? 1 };
  c.defaults.steps = entry.preset?.steps ?? 20;
  c.defaults.sampler = 'euler';
  for (const s of c.scenes) delete s.strength;
  return c;
}

export function styleLabel(s: Style): string {
  return s === 'photo'
    ? $localize`:@@style.photo:Photorealism`
    : s === 'anime'
      ? $localize`:@@style.anime:Illustration and anime`
      : s === 'general'
        ? $localize`:@@style.general:General`
        : s.toUpperCase();
}

// --- customizations (per browser) ---------------------------------------------

const STORAGE_KEY = 'mo.qualityTiers';

export function loadOverrides(): TierOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as TierOverrides) : {};
  } catch {
    return {};
  }
}

export function saveOverrides(o: TierOverrides): void {
  try {
    if (Object.keys(o).length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
  } catch {
    // no storage: the levels keep working with their derived values
  }
}

// --- one scene's quality ---------------------------------------------------------

/** What a scene had before a level (or "Como el proyecto") changed it. */
export interface SceneTierUndo {
  index: number;
  id: string;
  render?: SceneRender;
  animation?: SceneAnimation;
  variants?: number;
  lora: string;
}

export interface SceneTierResult {
  config: ProjectConfig;
  note: string[];
  undo: SceneTierUndo;
}

/** The values a level gives one scene, from the project's model preset (never from the scene's current values). */
export function sceneTierValues(cfg: ProjectConfig, tier: Tier, catalog: CatalogEntry[], overrides: TierOverrides = {}): TierValues {
  const preset = chosenModelEntry(cfg, catalog)?.preset ?? null;
  return tierValues(tier, preset, overrides, !!cfg.defaults.animate?.high_noise_diffusion_model, animateEngine(cfg));
}

const snapshot = (s: Scene, index: number): SceneTierUndo => ({
  index,
  id: s.id,
  render: s.render ? { ...s.render } : undefined,
  animation: s.animation ? { ...s.animation } : undefined,
  variants: s.variants,
  lora: s.lora,
});

/**
 * Gives one scene a quality level: its own `render` (resolution and steps) and,
 * when it animates, its own `animation`; in images mode also its variants, and
 * the level's LoRA when it names one. The project's defaults and the other
 * scenes are not touched. The input is not modified.
 */
export function applySceneTier(
  cfg: ProjectConfig,
  index: number,
  tier: Tier,
  catalog: CatalogEntry[],
  overrides: TierOverrides = {},
  maxPx: number | null = null,
): SceneTierResult | null {
  const c = structuredClone(cfg);
  const scene = c.scenes[index];
  if (!scene) return null;
  const v = sceneTierValues(c, tier, catalog, overrides);
  if (maxPx !== null) v.resolution = fitResolution(v.resolution, maxPx);
  const undo = snapshot(scene, index);
  const note: string[] = [v.resolution, $localize`:@@tier.noteSteps:${v.steps} steps`];

  scene.render = { ...scene.render, resolution: v.resolution, steps: v.steps };
  if (c.output.mode === 'images') {
    scene.variants = v.variants;
    note.push($localize`:@@tier.noteVariants:${v.variants} variants`);
  }
  if (v.lora && scene.image === undefined) {
    scene.lora = v.lora;
    note.push(`lora ${v.lora}`);
  }
  if (c.output.mode !== 'images' && scene.animate) {
    scene.animation = { ...scene.animation, resolution: v.wanResolution, frames: v.wanFrames, steps: v.wanSteps };
    note.push(`${animateEngine(c) === 'animatediff' ? 'AnimateDiff' : 'Wan'} ${v.wanResolution} · ${v.wanFrames} f · ${v.wanSteps}`);
  }
  return { config: c, note, undo };
}

/**
 * The level a scene is at: the one whose values the scene has of its own, or null
 * when it follows the project (or has settings that are none of the levels).
 */
export function activeSceneTier(cfg: ProjectConfig, index: number, catalog: CatalogEntry[], overrides: TierOverrides = {}, maxPx: number | null = null): Tier | null {
  const scene = cfg.scenes[index];
  if (!scene?.render) return null;
  return (
    TIERS.find((tier) => {
      const next = applySceneTier(cfg, index, tier, catalog, overrides, maxPx)?.config.scenes[index];
      if (!next) return false;
      const own = (scene.render?.resolution === next.render?.resolution && scene.render?.steps === next.render?.steps);
      if (!own) return false;
      return !scene.animate || cfg.output.mode === 'images' || (scene.animation?.resolution === next.animation?.resolution && scene.animation?.frames === next.animation?.frames && scene.animation?.steps === next.animation?.steps);
    }) ?? null
  );
}

/** Removes a scene's own render and animation settings: it goes back to the project's. */
export function clearSceneQuality(cfg: ProjectConfig, index: number): SceneTierResult | null {
  const c = structuredClone(cfg);
  const scene = c.scenes[index];
  if (!scene) return null;
  const undo = snapshot(scene, index);
  delete scene.render;
  delete scene.animation;
  return { config: c, note: [$localize`:@@sceneTier.noteCleared:same as project`], undo };
}

/** Restores what a scene had. The scene is found by its id first (it may have moved). */
export function undoSceneTier(cfg: ProjectConfig, undo: SceneTierUndo): ProjectConfig {
  const c = structuredClone(cfg);
  const scene = c.scenes[undo.index]?.id === undo.id ? c.scenes[undo.index] : c.scenes.find((s) => s.id === undo.id);
  if (!scene) return c;
  if (undo.render) scene.render = undo.render;
  else delete scene.render;
  if (undo.animation) scene.animation = undo.animation;
  else delete scene.animation;
  if (undo.variants === undefined) delete scene.variants;
  else scene.variants = undo.variants;
  scene.lora = undo.lora;
  return c;
}

// --- the animation engine ---------------------------------------------------------

/** The animation keys that choosing an engine overwrites; `undefined` means the key was absent. */
export type AnimateEngineUndo = Partial<Record<keyof AnimateSettings, unknown>>;

const ENGINE_KEYS: (keyof AnimateSettings)[] = [
  'engine',
  'checkpoint',
  'motion_module',
  'diffusion_model',
  't5xxl',
  'vae',
  'llm',
  'audio_vae',
  'connectors',
  'lora',
  'first_frame',
  'model_audio',
  'model_audio_speech',
  'high_noise_diffusion_model',
  'high_noise_steps',
  'high_noise_cfg_scale',
  'resolution',
  'frames',
  'fps',
  'steps',
  'cfg_scale',
];

/** The catalog entry of the AnimateDiff motion module (installed or not): the one with a `motion_module` file. */
export function animateDiffEntry(catalog: CatalogEntry[]): CatalogEntry | null {
  return catalog.find((e) => e.kind === 'video' && e.files.some((f) => f.role === 'motion_module')) ?? null;
}

/** Whether a catalog entry is the first-frame (FL2VA) bundle of MiniMax-H3: its DiT is the fl2va file. */
export function isFirstFrameEntry(e: CatalogEntry): boolean {
  return e.files.some((f) => f.role === 'model' && /fl2va/i.test(f.name));
}

/** Whether a catalog entry is the LTX-2.3 bundle: the only video one with a `connectors` file. */
export function isLtxEntry(e: CatalogEntry): boolean {
  return e.kind === 'video' && e.files.some((f) => f.role === 'connectors');
}

/** The catalog entry of the LTX-2.3 bundle (installed or not). */
export function ltxEntry(catalog: CatalogEntry[]): CatalogEntry | null {
  return catalog.find(isLtxEntry) ?? null;
}

/** A MiniMax-H3 bundle: a video entry with an `audio_vae` file that is not LTX's (LTX has audio too, and `connectors`). */
function isMiniMaxBundle(e: CatalogEntry): boolean {
  return e.kind === 'video' && e.files.some((f) => f.role === 'audio_vae') && !isLtxEntry(e);
}

/** The catalog entry of the MiniMax-H3 Ref2VA bundle (installed or not): the one with an `audio_vae` file that is not the first-frame one. */
export function miniMaxEntry(catalog: CatalogEntry[]): CatalogEntry | null {
  return catalog.find((e) => isMiniMaxBundle(e) && !isFirstFrameEntry(e)) ?? null;
}

/** The catalog entry of the MiniMax-H3 first-frame bundle (installed or not). */
export function miniMaxFirstFrameEntry(catalog: CatalogEntry[]): CatalogEntry | null {
  return catalog.find((e) => isMiniMaxBundle(e) && isFirstFrameEntry(e)) ?? null;
}

/**
 * Switches MiniMax-H3 between using the picture as a reference (Ref2VA) and as the first frame of the clip (FL2VA):
 * `first_frame` and the DiT are the ones of the matching bundle, and a LoRA, if there is one, is that bundle's (the
 * turbo LoRAs of the two are not interchangeable); a LoRA also brings back the engine's default steps. The input is
 * not modified; `missing` says the bundle is not completely installed.
 */
export function applyMiniMaxMode(cfg: ProjectConfig, firstFrame: boolean, catalog: CatalogEntry[]): { config: ProjectConfig; missing: boolean } {
  const c = structuredClone(cfg);
  const a = c.defaults.animate;
  const entry = firstFrame ? miniMaxFirstFrameEntry(catalog) : miniMaxEntry(catalog);
  if (!a || a.engine !== 'minimax-h3') return { config: c, missing: false };
  if (firstFrame) a.first_frame = true;
  else delete a.first_frame;
  if (entry) {
    const model = fileOf(entry, 'model');
    if (model) a.diffusion_model = `models/video/${model}`;
    if (a.lora) {
      const lora = fileOf(entry, 'lora');
      if (lora) a.lora = `models/video/${lora}`;
      else delete a.lora;
      delete a.steps;
    }
  }
  return { config: c, missing: !entry?.installed };
}

/** The installed SD 1.5 checkpoint of the catalog (the AnimateDiff base), as a project path; '' when it is not installed. */
export function installedSd15(catalog: CatalogEntry[]): string {
  const e = catalog.find((c) => c.id === 'sd-1-5' && c.installed);
  const file = e ? fileOf(e, 'model') || e.files[0]?.name : '';
  return file ? `models/${file}` : '';
}

export interface AnimateEngineResult {
  config: ProjectConfig;
  note: string[];
  undo: AnimateEngineUndo;
  /** True when the module of AnimateDiff is not installed (the panel points to the Video tab). */
  moduleMissing: boolean;
  /** True when the MiniMax-H3 bundle is not completely installed (the panel points to the Video tab). */
  miniMaxMissing: boolean;
  /** True when the LTX-2.3 bundle is not completely installed (the panel points to the Video tab). */
  ltxMissing: boolean;
}

/**
 * Chooses the animation engine in one edit. AnimateDiff writes the engine, the
 * motion module (the catalog's file, flagged missing when it is not installed),
 * the installed SD 1.5 checkpoint, and the catalog preset's steps, cfg and
 * resolution; frames and fps go back to the engine's defaults, because the
 * values left by the other engine (33 frames) do not hold for this one. Wan
 * writes `engine: wan` and clears the shared fields the same way; the files of
 * either engine are kept. The input is not modified.
 */
export function applyAnimateEngine(cfg: ProjectConfig, engine: AnimateEngine, catalog: CatalogEntry[]): AnimateEngineResult {
  const c = structuredClone(cfg);
  const prev = c.defaults.animate;
  const undo: AnimateEngineUndo = {};
  const a = prev ? c.defaults.animate! : (c.defaults.animate = {});
  for (const k of ENGINE_KEYS) undo[k] = prev ? (prev as unknown as Record<string, unknown>)[k] : undefined;
  const note: string[] = [];
  let moduleMissing = false;
  let miniMaxMissing = false;
  let ltxMissing = false;
  // The files of H3 and LTX are not Wan's nor each other's: leaving either clears the shared ones.
  const leavingBundle = (prev?.engine === 'minimax-h3' || prev?.engine === 'ltx-2.3') && engine !== prev.engine;

  a.engine = engine;
  delete a.resolution;
  delete a.frames;
  delete a.fps;
  delete a.steps;
  delete a.cfg_scale;

  if (engine === 'animatediff') {
    const entry = animateDiffEntry(catalog);
    const module = entry ? fileOf(entry, 'motion_module') : '';
    if (module) {
      a.motion_module = `models/video/${module}`;
      moduleMissing = !entry?.installed;
    }
    const sd15 = installedSd15(catalog);
    if (sd15) a.checkpoint = sd15;
    const p = entry?.preset;
    if (p?.resolution !== undefined) a.resolution = p.resolution;
    if (p?.steps !== undefined) a.steps = p.steps;
    if (p?.cfg_scale !== undefined) a.cfg_scale = p.cfg_scale;
    note.push('AnimateDiff');
    if (a.motion_module) note.push(a.motion_module.split('/').pop() ?? '');
    if (a.checkpoint) note.push(a.checkpoint.split('/').pop() ?? '');
    if (p) note.push([p.resolution, p.steps !== undefined ? $localize`:@@tier.noteSteps:${p.steps} steps` : ''].filter(Boolean).join(' · '));
  } else if (engine === 'minimax-h3') {
    // MiniMax-H3 shares `diffusion_model` and `vae` with Wan, so they are overwritten (Undo restores them);
    // frames and fps stay unset (24 fps is fixed, 56 frames the default).
    // The first-frame bundle when it is installed (the shot starts exactly from the picture); else the reference one.
    const ffEntry = miniMaxFirstFrameEntry(catalog);
    const entry = ffEntry?.installed ? ffEntry : miniMaxEntry(catalog);
    if (entry && entry === ffEntry) a.first_frame = true;
    else delete a.first_frame;
    const path = (role: string): string => {
      const f = entry ? fileOf(entry, role) : '';
      return f ? `models/video/${f}` : '';
    };
    const files: [keyof AnimateSettings, string][] = [
      ['diffusion_model', path('model')],
      ['llm', path('text_encoder')],
      ['vae', path('vae')],
      ['audio_vae', path('audio_vae')],
    ];
    for (const [k, v] of files) if (v) (a as Record<string, unknown>)[k] = v;
    delete a.t5xxl;
    delete a.high_noise_diffusion_model;
    delete a.high_noise_steps;
    delete a.high_noise_cfg_scale;
    miniMaxMissing = !entry?.installed;
    const p = entry?.preset;
    if (p?.resolution !== undefined) a.resolution = p.resolution;
    if (p?.steps !== undefined) a.steps = p.steps;
    if (p?.cfg_scale !== undefined) a.cfg_scale = p.cfg_scale;
    note.push('MiniMax H3');
    if (a.diffusion_model) note.push(a.diffusion_model.split('/').pop() ?? '');
    if (p) note.push([p.resolution, p.steps !== undefined ? $localize`:@@tier.noteSteps:${p.steps} steps` : ''].filter(Boolean).join(' · '));
  } else if (engine === 'ltx-2.3') {
    // LTX-2.3 shares `diffusion_model`, `vae`, `audio_vae` and `llm` with the others, so they are overwritten
    // (Undo restores them); frames and fps stay unset (24 fps is fixed, 49 frames the default). It has no LoRA and
    // no first-frame mode: the picture is always the first frame.
    const entry = ltxEntry(catalog);
    const path = (role: string): string => {
      const f = entry ? fileOf(entry, role) : '';
      return f ? `models/video/${f}` : '';
    };
    const files: [keyof AnimateSettings, string][] = [
      ['diffusion_model', path('model')],
      ['llm', path('text_encoder')],
      ['vae', path('vae')],
      ['audio_vae', path('audio_vae')],
      ['connectors', path('connectors')],
    ];
    for (const [k, v] of files) if (v) (a as Record<string, unknown>)[k] = v;
    delete a.t5xxl;
    delete a.high_noise_diffusion_model;
    delete a.high_noise_steps;
    delete a.high_noise_cfg_scale;
    delete a.lora;
    delete a.first_frame;
    ltxMissing = !entry?.installed;
    const p = entry?.preset;
    if (p?.resolution !== undefined) a.resolution = p.resolution;
    if (p?.steps !== undefined) a.steps = p.steps;
    if (p?.cfg_scale !== undefined) a.cfg_scale = p.cfg_scale;
    note.push('LTX 2.3');
    if (a.diffusion_model) note.push(a.diffusion_model.split('/').pop() ?? '');
    if (p) note.push([p.resolution, p.steps !== undefined ? $localize`:@@tier.noteSteps:${p.steps} steps` : ''].filter(Boolean).join(' · '));
  } else {
    note.push('Wan');
  }
  if (engine !== 'ltx-2.3') delete a.connectors;
  if (engine !== 'ltx-2.3' && engine !== 'minimax-h3') delete a.model_audio;
  if (engine !== 'ltx-2.3') delete a.model_audio_speech;
  if (leavingBundle) {
    // Its files are not Wan's (nor AnimateDiff's): leave the shared ones for the user to choose.
    delete a.diffusion_model;
    delete a.vae;
    delete a.llm;
    delete a.audio_vae;
    delete a.lora;
    delete a.first_frame;
  }
  return { config: c, note, undo, moduleMissing, miniMaxMissing, ltxMissing };
}

/** Restores exactly what `applyAnimateEngine` overwrote. The input is not modified. */
export function undoAnimateEngine(cfg: ProjectConfig, undo: AnimateEngineUndo, hadBlock: boolean): ProjectConfig {
  const c = structuredClone(cfg);
  if (!hadBlock) {
    delete c.defaults.animate;
    return c;
  }
  const a = (c.defaults.animate ??= {}) as unknown as Record<string, unknown>;
  for (const k of ENGINE_KEYS) {
    if (undo[k] === undefined) delete a[k];
    else a[k] = undo[k];
  }
  return c;
}
