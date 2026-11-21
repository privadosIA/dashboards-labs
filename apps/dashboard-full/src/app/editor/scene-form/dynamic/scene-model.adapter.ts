import { Scene, SceneOverlay } from '../../../core/api.models';

/** How the scene's picture is made; the five modes exclude each other. */
export type PictureMode = 'ai' | 'own' | 'clip' | 'motion' | 'part';

/**
 * Facts about the scene and the project that decide which blocks of the form
 * exist. The form gets them as its `[context]`, so the schema's
 * `ctx.*` conditions can read them; they are never part of the model.
 */
export type SceneContext = {
  video: boolean;
  images: boolean;
  /** The picture is drawn from a prompt (not the scene's own picture, clip or motion graphic). */
  generated: boolean;
  /** The scene is drawn by the part `auto`: the model chooses it from the description. */
  autoPart: boolean;
  qualityOn: boolean;
  cameraOn: boolean;
  overlayBlock: boolean;
  animateImagesNote: boolean;
  /** The scene animates (so its own animation settings apply). */
  animates: boolean;
  /** The voice in use has several speakers. */
  hasSpeakers: boolean;
  /** The speaker the scene is narrated with when it names none (shown, never written). */
  effectiveSpeaker: number;
};

/**
 * What the scene form edits: the scene's own fields plus the choices the scene
 * only implies (picture mode, narrate or stay silent, camera preset, the
 * overlay on or off). Flat names where the scene nests, so every control is one key.
 */
export interface SceneFormModel {
  id: string;
  prompt: string;
  negative_prompt: string;
  seed?: number | null;
  variants?: number | null;
  lora: string;
  pictureMode: PictureMode;
  image?: string;
  clip?: string;
  clip_start?: number | null;
  clip_end?: number | null;
  clip_speed?: number | null;
  motion_graphic?: string;
  /** The part of the catalog that draws the scene (`auto`: the model chooses), its parameters, one line of text and its tempo. */
  motion_part?: string;
  motion_params?: Record<string, unknown>;
  motion_text?: string | null;
  motion_bpm?: number | null;
  init_image?: string | null;
  strength?: number | null;
  narration: 'tts' | 'silence';
  tts_text: string;
  silence_seconds?: number | null;
  speed: number;
  voice: string;
  speaker?: number | null;
  motionType: string;
  motionIntensity: number;
  grain: number;
  whiteBalance: string;
  animate: boolean;
  motion_prompt?: string;
  transition: string;
  transition_seconds?: number | null;
  render: { resolution?: string; steps?: number | null; cfg_scale?: number | null };
  animation: { resolution?: string; frames?: number | null; steps?: number | null };
  overlayOn: boolean;
  overlay: { text?: string; start?: number | null; end?: number | null; position?: string };
}

const CLIP_KEYS = ['clip', 'clip_start', 'clip_end', 'clip_speed'] as const;

/** A number the user typed, or undefined when the box is empty or not a number. */
export function numberOrUndefined(value: unknown): number | undefined {
  if (value === '' || value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function text(value: unknown): string | undefined {
  const t = typeof value === 'string' ? value.trim() : '';
  return t === '' ? undefined : t;
}

export function pictureModeOf(scene: Scene): PictureMode {
  // A part named `auto` also has the description the model chooses from, so this goes first.
  if (scene.motion_part !== undefined) return 'part';
  if (scene.motion_graphic !== undefined) return 'motion';
  if (scene.clip !== undefined) return 'clip';
  if (scene.image !== undefined) return 'own';
  return 'ai';
}

/** The scene as the form shows it. */
export function toFormModel(scene: Scene, ctx?: SceneContext): SceneFormModel {
  return {
    id: scene.id,
    prompt: scene.prompt,
    negative_prompt: scene.negative_prompt,
    seed: scene.seed ?? null,
    variants: scene.variants ?? null,
    lora: scene.lora,
    pictureMode: pictureModeOf(scene),
    image: scene.image,
    clip: scene.clip,
    clip_start: scene.clip_start ?? null,
    clip_end: scene.clip_end ?? null,
    clip_speed: scene.clip_speed ?? null,
    motion_graphic: scene.motion_graphic,
    motion_part: scene.motion_part,
    motion_params: scene.motion_params,
    motion_text: scene.motion_text ?? null,
    motion_bpm: scene.motion_bpm ?? null,
    init_image: scene.init_image ?? null,
    strength: scene.strength ?? null,
    narration: scene.silence_seconds != null ? 'silence' : 'tts',
    tts_text: scene.tts_text,
    silence_seconds: scene.silence_seconds ?? null,
    speed: scene.speed || 1,
    voice: scene.voice ?? '',
    speaker: scene.speaker ?? ctx?.effectiveSpeaker ?? null,
    motionType: scene.motion?.type ?? 'static',
    motionIntensity: scene.motion?.intensity ?? 0.5,
    grain: scene.look?.grain ?? 0,
    whiteBalance: scene.look?.white_balance ?? 'neutral',
    animate: !!scene.animate,
    motion_prompt: scene.motion_prompt,
    transition: scene.transition ?? '',
    transition_seconds: scene.transition_seconds ?? null,
    render: {
      resolution: scene.render?.resolution,
      steps: scene.render?.steps ?? null,
      cfg_scale: scene.render?.cfg_scale ?? null,
    },
    animation: {
      resolution: scene.animation?.resolution,
      frames: scene.animation?.frames ?? null,
      steps: scene.animation?.steps ?? null,
    },
    overlayOn: scene.overlay !== undefined,
    overlay: {
      text: scene.overlay?.text,
      start: scene.overlay?.start ?? null,
      end: scene.overlay?.end ?? null,
      position: scene.overlay?.position ?? (scene.overlay ? 'bottom' : undefined),
    },
  };
}

/** The scene that the form model describes, starting from the scene it came from. */
export function fromFormModel(scene: Scene, model: SceneFormModel): Scene {
  const next: Scene = { ...scene };

  next.id = model.id ?? scene.id;
  next.prompt = model.prompt ?? scene.prompt;
  next.negative_prompt = model.negative_prompt ?? scene.negative_prompt;
  next.lora = model.lora ?? scene.lora;
  next.seed = numberOrUndefined(model.seed);
  next.variants = numberOrUndefined(model.variants);

  // The picture: its own, its clip, a motion graphic or a generated one never go together.
  const mode = model.pictureMode ?? pictureModeOf(scene);
  if (mode === 'own') next.image = model.image ?? '';
  if (mode === 'clip') next.clip = model.clip ?? '';
  if (mode === 'motion') next.motion_graphic = model.motion_graphic ?? '';
  if (mode === 'part') {
    next.motion_part = model.motion_part ?? scene.motion_part ?? '';
    next.motion_params = model.motion_params ?? scene.motion_params;
    next.motion_text = text(model.motion_text);
    next.motion_bpm = numberOrUndefined(model.motion_bpm);
    // `auto` is described like an animated graphic, from which the model chooses the part; a named part needs no description.
    next.motion_graphic = next.motion_part === 'auto' ? (model.motion_graphic ?? scene.motion_graphic ?? '') : undefined;
  }
  if (mode === 'clip' || model.animate) {
    next.clip_start = numberOrUndefined(model.clip_start);
    next.clip_end = numberOrUndefined(model.clip_end);
    next.clip_speed = numberOrUndefined(model.clip_speed);
  }

  // img2img: the starting picture and its strength go together.
  if (model.init_image === null || model.init_image === undefined) {
    next.init_image = undefined;
    next.strength = undefined;
  } else {
    next.init_image = model.init_image;
    next.strength = numberOrUndefined(model.strength);
  }

  // Narration: the scene narrates or stays silent, never both.
  if (model.narration === 'silence') {
    next.silence_seconds = numberOrUndefined(model.silence_seconds) ?? scene.silence_seconds ?? 2.0;
    next.tts_text = scene.silence_seconds == null ? '' : (model.tts_text ?? '');
  } else {
    next.silence_seconds = undefined;
    next.tts_text = model.tts_text ?? scene.tts_text;
  }
  next.speed = numberOrUndefined(model.speed) ?? scene.speed;
  next.voice = text(model.voice);
  // Choosing another voice forgets the speaker of the previous one.
  next.speaker = next.voice !== scene.voice ? undefined : numberOrUndefined(model.speaker);

  // Camera and look are presets only.
  next.motion =
    !model.motionType || model.motionType === 'static'
      ? undefined
      : { type: model.motionType, intensity: numberOrUndefined(model.motionIntensity) ?? scene.motion?.intensity ?? 0.5 };
  const grain = numberOrUndefined(model.grain) ?? scene.look?.grain ?? 0;
  const whiteBalance = model.whiteBalance || scene.look?.white_balance || 'neutral';
  const lookChanged = grain !== (scene.look?.grain ?? 0) || whiteBalance !== (scene.look?.white_balance ?? 'neutral');
  next.look = lookChanged ? { grain, white_balance: whiteBalance } : scene.look;

  // Animation: «false» is written as such, and the part of the animation chosen goes with it.
  if (model.animate) next.animate = true;
  else if (scene.animate === true) {
    next.animate = false;
    for (const k of ['clip_start', 'clip_end', 'clip_speed'] as const) next[k] = undefined;
  }
  next.motion_prompt = model.motion_prompt === undefined ? scene.motion_prompt : model.motion_prompt;

  next.transition = text(model.transition);
  const fade = numberOrUndefined(model.transition_seconds);
  next.transition_seconds = fade === undefined ? undefined : Math.round(fade * 100) / 100;

  next.render = compact({
    resolution: text(model.render?.resolution),
    steps: numberOrUndefined(model.render?.steps),
    cfg_scale: numberOrUndefined(model.render?.cfg_scale),
  });
  next.animation = compact({
    resolution: text(model.animation?.resolution),
    frames: numberOrUndefined(model.animation?.frames),
    steps: numberOrUndefined(model.animation?.steps),
  });

  next.overlay = model.overlayOn
    ? ({
        ...scene.overlay,
        text: model.overlay?.text ?? scene.overlay?.text ?? '',
        start: numberOrUndefined(model.overlay?.start),
        end: numberOrUndefined(model.overlay?.end),
        // Shown as «bottom» when the scene names none: only a different choice is written.
        position: (model.overlay?.position === (scene.overlay?.position ?? 'bottom') ? scene.overlay?.position : text(model.overlay?.position)) as SceneOverlay['position'],
      } as SceneOverlay)
    : undefined;

  // Switching the picture mode clears what the new mode cannot have, whatever the other controls said.
  if (mode !== pictureModeOf(scene)) applyPictureMode(next, scene, mode);

  return next;
}

/**
 * Only what the user changed, ready for `EditorStore.updateScene` (a removed
 * key is `undefined`). `base` is the model the form was given: a control the
 * user did not touch keeps what the scene says, so a value the form only shows
 * (the speaker in use, a placeholder) is never written back.
 */
export function toScenePatch(scene: Scene, model: SceneFormModel, base?: SceneFormModel): Partial<Scene> {
  const own = toFormModel(scene);
  const edited = base ? mergeChanged(own as unknown as Record<string, unknown>, model as unknown as Record<string, unknown>, base as unknown as Record<string, unknown>) : model;
  const next = fromFormModel(scene, edited as unknown as SceneFormModel) as unknown as Record<string, unknown>;
  // What an untouched form would write (a speed shown as 1 for a scene that stores 0): not an edit.
  const untouched = fromFormModel(scene, own) as unknown as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(untouched), ...Object.keys(next)])) {
    if (JSON.stringify(untouched[key]) !== JSON.stringify(next[key])) patch[key] = next[key];
  }
  return patch as Partial<Scene>;
}

/** `own` with the keys of `model` that differ from `base` laid over it (blocks such as `render` key by key). */
function mergeChanged(own: Record<string, unknown>, model: Record<string, unknown>, base: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...own };
  for (const key of Object.keys(model)) {
    const m = model[key];
    const b = base[key];
    const o = own[key];
    if (isPlain(m) && isPlain(o)) out[key] = mergeChanged(o, m, isPlain(b) ? b : {});
    else if (JSON.stringify(m) !== JSON.stringify(b)) out[key] = m;
  }
  return out;
}

function isPlain(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** An emptied block is not kept. */
function compact<T extends object>(block: T): T | undefined {
  const entries = Object.entries(block).filter(([, v]) => v !== undefined);
  return entries.length ? (Object.fromEntries(entries) as T) : undefined;
}

/** The fields of a scene that a part of the catalog draws. */
const PART_KEYS = ['motion_part', 'motion_params', 'motion_text', 'motion_bpm'] as const;

/** What switching the picture mode clears (the exclusions the editor always applied). */
function applyPictureMode(next: Scene, scene: Scene, mode: PictureMode): void {
  next.motion_graphic = undefined;
  for (const k of PART_KEYS) next[k] = undefined;
  if (mode === 'part') {
    // Choosing the part way keeps what the scene already said of one ('' = chosen, not picked yet); the exclusions are the animated graphic's.
    next.motion_part = scene.motion_part ?? '';
    next.motion_params = scene.motion_params;
    next.motion_text = scene.motion_text;
    next.motion_bpm = scene.motion_bpm;
    next.motion_graphic = next.motion_part === 'auto' ? (scene.motion_graphic ?? '') : undefined;
    Object.assign(next, { image: undefined, clip: undefined, clip_start: undefined, clip_end: undefined, clip_speed: undefined });
    Object.assign(next, { init_image: undefined, strength: undefined, animate: undefined, motion_prompt: undefined, animation: undefined, render: undefined });
  } else if (mode === 'motion') {
    next.motion_graphic = scene.motion_graphic ?? '';
    Object.assign(next, { image: undefined, clip: undefined, clip_start: undefined, clip_end: undefined, clip_speed: undefined });
    Object.assign(next, { init_image: undefined, strength: undefined, animate: undefined, motion_prompt: undefined, animation: undefined, render: undefined });
  } else if (mode === 'clip') {
    Object.assign(next, { clip: scene.clip ?? '', image: undefined, init_image: undefined, strength: undefined, animate: undefined, motion_prompt: undefined, animation: undefined, render: undefined });
  } else if (mode === 'own') {
    Object.assign(next, { image: scene.image ?? '', clip: undefined, init_image: undefined, strength: undefined });
    for (const k of CLIP_KEYS) next[k] = undefined;
  } else {
    Object.assign(next, { image: undefined, clip: undefined });
    for (const k of CLIP_KEYS) next[k] = undefined;
  }
}

/** What choosing a picture mode writes: the modes exclude each other, so the ones the new mode cannot have are cleared. */
export function pictureModePatch(scene: Scene, mode: PictureMode): Partial<Scene> {
  return toScenePatch(scene, { ...toFormModel(scene), pictureMode: mode });
}
