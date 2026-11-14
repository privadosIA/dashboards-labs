// The rules of one scene, mirrored from the Go loader (design D4): the same
// functions feed the editor's save gate and the validators the scene form's
// schema cites by name. The server stays authoritative and its message wins.
import type { Part } from '@lab/motion-parts';
import { DfValidatorDefinition } from '@core/dynamic-forms';

import { ProjectConfig, Scene } from '../../../core/api.models';

export const RESOLUTION_PATTERN = /^\d+x\d+$/;
export const MOTION_TYPES = ['static', 'zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'handheld', 'rotate_cw', 'rotate_ccw'];
export const WHITE_BALANCES = ['neutral', 'warm', 'cool', 'fluorescent'];

/** The limits the server puts on the fields of a scene drawn by a part. */
export const MAX_MOTION_TEXT = 120;
export const MIN_MOTION_BPM = 40;
export const MAX_MOTION_BPM = 240;

export interface SceneErrors {
  id?: string;
  prompt?: string;
  image?: string;
  clip?: string;
  /** The part of the clip chosen is empty or negative. */
  clipTrim?: string;
  /** The speed of the scene's video is out of range. */
  clipSpeed?: string;
  /** The crossfade into the scene is out of range. */
  transition?: string;
  init?: string;
  narration?: string;
  motion?: string;
  look?: string;
  variants?: string;
  animate?: string;
  /** The scene's own render or animation settings are wrong. */
  quality?: string;
  /** The description of a motion graphic is empty. */
  motionGraphic?: string;
  /** The overlay's text, position or range is wrong. */
  overlay?: string;
  /** The part of the catalog is not chosen or is not one the catalog has. */
  part?: string;
  /** A parameter of the part is not one of its own or is outside its limits. */
  partParams?: string;
  /** The line of text of the part is too long. */
  partText?: string;
  /** The tempo of the part is outside 40 to 240. */
  partBpm?: string;
}

/** Wan resolution sides must be positive multiples of 16. */
export const WAN_SIDE = 16;
export const ANIMATEDIFF_SIDE = 8;
export const ANIMATEDIFF_MIN_FRAMES = 8;
export const ANIMATEDIFF_MAX_FRAMES = 32;

/** Everything wrong with one scene; `seen` holds the ids of the scenes before it. */
export function sceneErrors(s: Scene, i: number, seen: Map<string, number>, cfg: ProjectConfig, videoMode: boolean, parts?: readonly Part[]): SceneErrors {
  const e: SceneErrors = {};
  if (!s.id) {
    e.id = $localize`:@@val.idEmpty:The scene needs an id`;
  } else if (seen.has(s.id)) {
    e.id = $localize`:@@val.idDup:Duplicate id: already used by scene ${seen.get(s.id)! + 1}:index:`;
  } else {
    seen.set(s.id, i);
  }
  if (s.image === '') {
    e.image = $localize`:@@val.imageEmpty:Choose or upload an image, or generate it again with a prompt`;
  } else if (!s.prompt && s.image === undefined && s.clip === undefined && s.motion_graphic === undefined && s.motion_part === undefined) {
    e.prompt = $localize`:@@val.promptEmpty:The prompt cannot be empty`;
  }
  if (s.motion_graphic !== undefined && s.motion_graphic.trim() === '') {
    e.motionGraphic = $localize`:@@val.motionGraphicEmpty:Describe what the graphic shows, or go back to generating the scene from a prompt`;
  }
  Object.assign(e, partErrors(s, parts));
  const overlayError = overlayProblem(s);
  if (overlayError) e.overlay = overlayError;
  if (s.clip === '') {
    e.clip = $localize`:@@val.clipEmpty:Choose or upload a video, or generate the scene from a prompt again`;
  }
  if ((s.clip !== undefined || s.animate) && ((s.clip_start ?? 0) < 0 || (s.clip_end !== undefined && s.clip_end <= (s.clip_start ?? 0)))) {
    e.clipTrim = $localize`:@@val.clipTrim:The end of the clip must be greater than the start, and the start cannot be negative`;
  }
  if (s.clip_speed !== undefined && (s.clip_speed < 0.25 || s.clip_speed > 4)) {
    e.clipSpeed = $localize`:@@val.clipSpeed:The speed goes from 0.25 to 4`;
  }
  if (s.transition_seconds !== undefined && (s.transition_seconds < 0 || s.transition_seconds > 2)) {
    e.transition = $localize`:@@val.transition:The fade goes from 0 to 2 seconds`;
  }
  if (s.init_image === '') {
    e.init = $localize`:@@val.initEmpty:Choose or upload the starting image, or remove it`;
  }
  Object.assign(e, narrationError(s, videoMode));
  if (s.motion) {
    if (!MOTION_TYPES.includes(s.motion.type || 'static')) {
      e.motion = $localize`:@@val.motionType:Unknown motion type`;
    } else if (
      s.motion.intensity != null &&
      (s.motion.intensity < 0 || s.motion.intensity > 1)
    ) {
      e.motion = $localize`:@@val.motionIntensity:Intensity ranges from 0.0 to 1.0`;
    }
  }
  if (s.look) {
    if (s.look.grain < 0 || s.look.grain > 1) {
      e.look = $localize`:@@val.grain:Grain ranges from 0.0 to 1.0`;
    } else if (s.look.white_balance && !WHITE_BALANCES.includes(s.look.white_balance)) {
      e.look = $localize`:@@val.wb:Unknown white balance`;
    }
  }
  if (s.variants != null && s.variants < 1) {
    e.variants = $localize`:@@val.variants:variants must be an integer ≥ 1`;
  }
  const q = sceneQualityError(s, cfg.defaults.animate?.engine === 'animatediff', cfg.defaults.animate?.engine === 'minimax-h3' || cfg.defaults.animate?.engine === 'ltx-2.3');
  if (q) e.quality = $localize`:@@val.sceneQuality:Scene “${s.id}:id:”: ${q}:problem:`;
  if (videoMode && s.animate && !animateFilesComplete(cfg)) {
    e.animate =
      cfg.defaults.animate?.engine === 'animatediff'
        ? $localize`:@@val.animateNoDefaultsAD:The scene animates but defaults.animate is not configured: the SD 1.5 model and the AnimateDiff motion module are required`
        : $localize`:@@val.animateNoDefaults:The scene animates but defaults.animate is not configured: the Wan model, text encoder and VAE are required`;
  }
  return e;
}

/** A scene's own render and animation settings, with the rules of the project's (the first problem found). */
function sceneQualityError(s: Scene, animateDiff = false, miniMax = false): string | undefined {
  const r = s.render;
  if (r) {
    if (r.resolution != null && r.resolution !== '' && !RESOLUTION_PATTERN.test(r.resolution)) {
      return $localize`:@@val.sceneRenderResolution:The scene's render.resolution must be WIDTHxHEIGHT, e.g. 1280x704`;
    }
    if (r.steps != null && !(r.steps >= 1)) {
      return $localize`:@@val.sceneRenderSteps:The scene's render.steps must be at least 1`;
    }
    if (r.cfg_scale != null && r.cfg_scale < 0) {
      return $localize`:@@val.sceneRenderCfg:The scene's render.cfg_scale cannot be negative`;
    }
  }
  const a = s.animation;
  // MiniMax-H3 and LTX-2.3 have their own grids (sides x32; 17k+5 and 8k+1 frames): the server checks them.
  if (a && !miniMax) {
    if (a.resolution != null && a.resolution !== '') {
      const m = /^(\d+)x(\d+)$/.exec(a.resolution);
      const w = m ? +m[1] : 0;
      const h = m ? +m[2] : 0;
      const side = animateDiff ? ANIMATEDIFF_SIDE : WAN_SIDE;
      if (!m || w <= 0 || h <= 0 || w % side !== 0 || h % side !== 0) {
        return animateDiff
          ? $localize`:@@val.sceneAdResolution:The scene's animation.resolution must be WIDTHxHEIGHT with both sides multiples of 8`
          : $localize`:@@val.sceneAnimResolution:The scene's animation.resolution must be WIDTHxHEIGHT with both sides multiples of 16`;
      }
    }
    if (animateDiff) {
      if (a.frames != null && (!Number.isInteger(a.frames) || a.frames < ANIMATEDIFF_MIN_FRAMES || a.frames > ANIMATEDIFF_MAX_FRAMES)) {
        return $localize`:@@val.sceneAdFrames:The scene's animation.frames must be between 8 and 32 with AnimateDiff`;
      }
    } else if (a.frames != null && (!Number.isInteger(a.frames) || a.frames < 1 || (a.frames - 1) % 4 !== 0)) {
      return $localize`:@@val.sceneAnimFrames:The scene's animation.frames must be of the form 4n+1 (for example 33)`;
    }
    if (a.steps != null && !(a.steps >= 1)) {
      return $localize`:@@val.sceneAnimSteps:The scene's animation.steps must be at least 1`;
    }
  }
  return undefined;
}

function animateFilesComplete(cfg: ProjectConfig): boolean {
  const a = cfg.defaults.animate;
  if (a?.engine === 'animatediff') return !!a.checkpoint && !!a.motion_module;
  if (a?.engine === 'minimax-h3') return !!a.diffusion_model && !!a.vae && !!a.audio_vae && !!a.llm;
  if (a?.engine === 'ltx-2.3') return !!a.diffusion_model && !!a.vae && !!a.audio_vae && !!a.llm && !!a.connectors;
  return !!a && !!a.diffusion_model && !!a.t5xxl && !!a.vae;
}

function narrationError(s: Scene, videoMode: boolean): SceneErrors {
  const hasText = !!s.tts_text;
  const silent = s.silence_seconds != null;
  if (hasText && silent) {
    return {
      narration: $localize`:@@val.narrationBoth:tts_text and silence_seconds are mutually exclusive: a scene either narrates or stays silent`,
    };
  }
  if (silent && s.silence_seconds! <= 0) {
    return { narration: $localize`:@@val.silencePositive:silence_seconds must be > 0` };
  }
  if (videoMode && !hasText && !silent) {
    return {
      narration: $localize`:@@val.narrationMissing:In video mode the scene needs tts_text or silence_seconds`,
    };
  }
  return {};
}

/** The rules the server applies to a scene's overlay, mirrored. */
export function overlayProblem(s: Scene): string | undefined {
  const o = s.overlay;
  if (!o) return undefined;
  if (!o.text || o.text.trim() === '') return $localize`:@@val.overlayText:Write the overlay text or describe it`;
  if (o.start !== undefined && o.start < 0) return $localize`:@@val.overlayStart:The overlay start cannot be negative`;
  if (o.end !== undefined && o.end <= (o.start ?? 0)) return $localize`:@@val.overlayEnd:The overlay end must be after its start`;
  const length = s.silence_seconds;
  if (length != null && o.start !== undefined && o.start >= length) return $localize`:@@val.overlayBeyond:The overlay starts after the end of the scene`;
  if (length != null && o.end !== undefined && o.end > length) return $localize`:@@val.overlayBeyond:The overlay starts after the end of the scene`;
  return undefined;
}

/**
 * The errors of the scene on screen, as the editor's validation computed them
 * (it knows the whole project: duplicate ids, the engine, the output mode). The
 * scene form sets it before the controls are checked again; the schema cites it
 * with `{ "name": "sceneRule", "args": { "rule": "id" } }`.
 */
export const sceneRuleState: { errors: SceneErrors } = { errors: {} };

/** The validators the scene form's schema cites by name. */
export const SCENE_VALIDATORS: DfValidatorDefinition[] = [
  {
    name: 'sceneRule',
    validate: (_control, args) => !sceneRuleState.errors[String(args?.['rule']) as keyof SceneErrors],
    message: (args) => sceneRuleState.errors[String(args?.['rule']) as keyof SceneErrors] ?? '',
  },
];


const PART_EXCLUDES = ['image', 'init_image', 'clip', 'animate', 'motion_prompt', 'animation', 'render'] as const;

/** What is wrong with a scene drawn by a part of the catalog, as the server judges it: the part, its parameters, text and tempo. */
function partErrors(s: Scene, parts: readonly Part[] | undefined): SceneErrors {
  const e: SceneErrors = {};
  if (s.motion_part === undefined) {
    if (s.motion_params !== undefined || s.motion_text !== undefined || s.motion_bpm !== undefined) {
      e.part = $localize`:@@val.partOrphan:The parameters, text and tempo of a part need a part`;
    }
    return e;
  }
  if (PART_EXCLUDES.some((k) => s[k] !== undefined && s[k] !== false)) {
    e.part = $localize`:@@val.partCombo:A part of the catalog cannot be combined with your own picture, a clip, a starting picture, animation or render settings`;
  } else if (s.motion_part === '') {
    e.part = $localize`:@@val.partEmpty:Choose a part of the catalog, or let the model choose`;
  } else if (s.motion_part === 'auto') {
    if ((s.motion_graphic ?? '').trim() === '') {
      return { motionGraphic: $localize`:@@val.partAutoEmpty:Describe what the scene has to show so the model can choose the part` };
    }
  } else if (parts) {
    const part = parts.find((p) => p.name === s.motion_part);
    if (!part) e.part = $localize`:@@val.partUnknown:The part «${s.motion_part}:part:» is not in the catalog`;
    else {
      const problem = partParamsProblem(part, s.motion_params ?? {});
      if (problem) e.partParams = problem;
    }
  }
  if (s.motion_text !== undefined && s.motion_text.length > MAX_MOTION_TEXT) {
    e.partText = $localize`:@@val.partTextLong:The text can have up to ${MAX_MOTION_TEXT}:max: characters`;
  }
  if (s.motion_bpm !== undefined && !(s.motion_bpm >= MIN_MOTION_BPM && s.motion_bpm <= MAX_MOTION_BPM)) {
    e.partBpm = $localize`:@@val.partBpm:The tempo goes from ${MIN_MOTION_BPM}:min: to ${MAX_MOTION_BPM}:max:`;
  }
  return e;
}

/** The first thing wrong with the parameters a scene gives a part, judged by what the catalog says of that part; '' when fine. */
export function partParamsProblem(part: Part, params: Readonly<Record<string, unknown>>): string {
  for (const [name, value] of Object.entries(params)) {
    const q = part.params.find((x) => x.name === name);
    if (!q) return $localize`:@@val.partParamUnknown:The part «${part.name}:part:» has no parameter «${name}:param:»`;
    if (q.type === 'int' || q.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value) || (q.type === 'int' && !Number.isInteger(value))) {
        return q.type === 'int'
          ? $localize`:@@val.partParamWhole:The parameter «${name}:param:» must be a whole number`
          : $localize`:@@val.partParamNumber:The parameter «${name}:param:» must be a number`;
      }
      if ((q.min !== undefined && value < q.min) || (q.max !== undefined && value > q.max)) {
        return $localize`:@@val.partParamRange:The parameter «${name}:param:» must be between ${q.min ?? '…'}:min: and ${q.max ?? '…'}:max:`;
      }
    } else if (q.type === 'bool') {
      if (typeof value !== 'boolean') return $localize`:@@val.partParamBool:The parameter «${name}:param:» must be true or false`;
    } else if (q.type === 'enum') {
      if (typeof value !== 'string' || !(q.options ?? []).includes(value)) {
        return $localize`:@@val.partParamOption:The parameter «${name}:param:» must be one of: ${(q.options ?? []).join(', ')}:options:`;
      }
    } else if (typeof value !== 'string' || (q.maxLength !== undefined && value.length > q.maxLength)) {
      return $localize`:@@val.partParamLength:The parameter «${name}:param:» must be a text of up to ${q.maxLength ?? 0}:max: characters`;
    }
  }
  return '';
}
