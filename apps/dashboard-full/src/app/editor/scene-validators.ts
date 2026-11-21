// Client-side mirror of the cheap, stable validation rules the Go loader
// enforces (design D4). The mirrored set stays deliberately small; the
// server remains authoritative and its message wins on disagreement.
import type { Part } from '@lab/motion-parts';

import { AnimateSettings, ProjectConfig } from '../core/api.models';
import {
  ANIMATEDIFF_MAX_FRAMES,
  MAX_MOTION_BPM,
  MIN_MOTION_BPM,
  ANIMATEDIFF_MIN_FRAMES,
  ANIMATEDIFF_SIDE,
  RESOLUTION_PATTERN,
  SceneErrors,
  WAN_SIDE,
  sceneErrors,
} from './scene-form/dynamic/validations';

export { MOTION_TYPES, RESOLUTION_PATTERN, WHITE_BALANCES, overlayProblem } from './scene-form/dynamic/validations';
export type { SceneErrors } from './scene-form/dynamic/validations';

export interface ConfigValidation {
  defaults: { resolution?: string; model?: string; modelSet?: string; animate?: string; transition?: string; motion?: string };
  output: { file?: string };
  scenes: SceneErrors[];
  /** true when nothing blocks a save. */
  valid: boolean;
}

/** `parts` are the catalog's, when it is known: what depends on it (a part that exists, a parameter inside its limits) is judged only then. */
export function validateConfig(cfg: ProjectConfig, parts?: readonly Part[]): ConfigValidation {
  const v: ConfigValidation = { defaults: {}, output: {}, scenes: [], valid: true };
  if (cfg.output.mode === 'music') {
    // Being switched to music: the scenes are about to leave the file, so their
    // rules no longer apply (the server judges the tracks on save).
    cfg.scenes.forEach((_, i) => (v.scenes[i] = {}));
    return v;
  }
  const videoMode = cfg.output.mode !== 'images';

  if (cfg.defaults.resolution && !RESOLUTION_PATTERN.test(cfg.defaults.resolution)) {
    v.defaults.resolution = $localize`:@@val.resolution:Resolution must be WIDTHxHEIGHT, e.g. 1280x720`;
  }
  if (videoMode && !cfg.output.file) {
    v.output.file = $localize`:@@val.outputFile:In video mode output.file is required (e.g. out/project.mp4)`;
  }

  v.defaults.model = modelError(cfg);
  v.defaults.modelSet = modelSetError(cfg);
  v.defaults.animate = animateError(cfg);
  const fade = cfg.defaults.transition_seconds;
  if (videoMode && fade !== undefined && (fade < 0 || fade > 2)) {
    v.defaults.transition = $localize`:@@val.transition:The fade goes from 0 to 2 seconds`;
  }

  v.defaults.motion = motionDefaultsError(cfg);

  const seen = new Map<string, number>();
  cfg.scenes.forEach((s, i) => {
    const e = sceneErrors(s, i, seen, cfg, videoMode, parts);
    if (Object.keys(e).length > 0) {
      v.valid = false;
    }
    v.scenes[i] = e;
  });

  if (
    v.defaults.resolution ||
    v.output.file ||
    v.defaults.model ||
    v.defaults.modelSet ||
    v.defaults.animate ||
    v.defaults.transition ||
    v.defaults.motion
  ) {
    v.valid = false;
  }
  return v;
}

/** The tempo and the colours of `defaults.motion`, as the server reads them: the contrast of the accent is the server's to judge. */
function motionDefaultsError(cfg: ProjectConfig): string | undefined {
  const m = cfg.defaults.motion;
  if (!m) return undefined;
  if (m.bpm !== undefined && !(m.bpm >= MIN_MOTION_BPM && m.bpm <= MAX_MOTION_BPM)) {
    return $localize`:@@val.motionDefaultsBpm:The project's tempo goes from ${MIN_MOTION_BPM}:min: to ${MAX_MOTION_BPM}:max:`;
  }
  for (const key of ['dark', 'light', 'accent'] as const) {
    const colour = m.design?.[key];
    if (colour !== undefined && !/^#[0-9a-fA-F]{6}$/.test(colour)) {
      return $localize`:@@val.motionDefaultsColour:The design colour «${key}:field:» must look like #aabbcc`;
    }
  }
  if (m.design?.concept !== undefined && m.design.concept.length > 200) {
    return $localize`:@@val.motionDefaultsConcept:The design concept can have up to 200 characters`;
  }
  return undefined;
}

function modelError(cfg: ProjectConfig): string | undefined {
  if (cfg.defaults.model && cfg.defaults.model_set) {
    return $localize`:@@val.modelBoth:defaults.model and defaults.model_set cannot be used together: choose a checkpoint or a model set`;
  }
  return undefined;
}

function modelSetError(cfg: ProjectConfig): string | undefined {
  const ms = cfg.defaults.model_set;
  if (!ms) return undefined;
  if (!ms.diffusion_model) {
    return $localize`:@@val.msDiffusion:defaults.model_set.diffusion_model is required`;
  }
  if (ms.edit && (ms.llm || ms.llm_vision)) {
    if (!ms.llm) return $localize`:@@val.msQwenLlm:defaults.model_set.llm (Qwen2.5-VL text model) is required in an editing model of the Qwen family`;
    if (!ms.llm_vision) return $localize`:@@val.msLlmVision:defaults.model_set.llm_vision (vision projector) is required in an editing model of the Qwen family`;
    if (ms.clip_l || ms.t5xxl) return $localize`:@@val.msFamilies:defaults.model_set: clip_l and t5xxl belong to the FLUX family; use one family`;
  } else if (ms.edit) {
    if (!ms.clip_l) return $localize`:@@val.msClipL:defaults.model_set.clip_l (CLIP-L encoder) is required in an editing model`;
    if (!ms.t5xxl) return $localize`:@@val.msT5:defaults.model_set.t5xxl (T5-XXL encoder) is required in an editing model`;
  } else if (!ms.llm) {
    return $localize`:@@val.msLlm:defaults.model_set.llm (text encoder) is required`;
  }
  if (!ms.vae) {
    return $localize`:@@val.msVae:defaults.model_set.vae is required`;
  }
  if (ms.cfg_scale != null && ms.cfg_scale < 0) {
    return $localize`:@@val.msCfg:defaults.model_set.cfg_scale cannot be negative`;
  }
  return undefined;
}

function animateDiffError(a: AnimateSettings): string | undefined {
  if (a.resolution) {
    const m = /^(\d+)x(\d+)$/.exec(a.resolution);
    const w = m ? +m[1] : 0;
    const h = m ? +m[2] : 0;
    if (!m || w <= 0 || h <= 0 || w % ANIMATEDIFF_SIDE !== 0 || h % ANIMATEDIFF_SIDE !== 0) {
      return $localize`:@@val.adResolution:defaults.animate.resolution must be WIDTHxHEIGHT with both sides multiples of 8`;
    }
  }
  if (a.frames != null && (!Number.isInteger(a.frames) || a.frames < ANIMATEDIFF_MIN_FRAMES || a.frames > ANIMATEDIFF_MAX_FRAMES)) {
    return $localize`:@@val.adFrames:defaults.animate.frames must be between 8 and 32 with AnimateDiff`;
  }
  if (a.fps != null && !(a.fps > 0)) {
    return $localize`:@@val.animFps:defaults.animate.fps must be positive`;
  }
  if (a.steps != null && !(a.steps > 0)) {
    return $localize`:@@val.animSteps:defaults.animate.steps must be positive`;
  }
  if (a.cfg_scale != null && a.cfg_scale < 0) {
    return $localize`:@@val.animCfg:defaults.animate.cfg_scale cannot be negative`;
  }
  if (a.strength != null && !(a.strength > 0 && a.strength <= 1)) {
    return $localize`:@@val.adStrength:defaults.animate.strength must be greater than 0 and at most 1`;
  }
  return undefined;
}

function animateError(cfg: ProjectConfig): string | undefined {
  const a = cfg.defaults.animate;
  if (!a) return undefined;
  if (a.engine === 'animatediff') return animateDiffError(a);
  if (a.engine === 'minimax-h3' || a.engine === 'ltx-2.3') return undefined; // their own grids are checked by the server
  if (a.model_audio) return $localize`:@@val.animModelAudio:defaults.animate.model_audio only applies to the minimax-h3 and ltx-2.3 engines`;
  if (a.resolution) {
    const m = /^(\d+)x(\d+)$/.exec(a.resolution);
    const w = m ? +m[1] : 0;
    const h = m ? +m[2] : 0;
    if (!m || w <= 0 || h <= 0 || w % WAN_SIDE !== 0 || h % WAN_SIDE !== 0) {
      return $localize`:@@val.animResolution:defaults.animate.resolution must be WIDTHxHEIGHT with both sides multiples of 16`;
    }
  }
  if (a.frames != null && (!Number.isInteger(a.frames) || a.frames < 1 || (a.frames - 1) % 4 !== 0)) {
    return $localize`:@@val.animFrames:defaults.animate.frames must be of the form 4n+1 (for example 33)`;
  }
  if (a.fps != null && !(a.fps > 0)) {
    return $localize`:@@val.animFps:defaults.animate.fps must be positive`;
  }
  if (a.steps != null && !(a.steps > 0)) {
    return $localize`:@@val.animSteps:defaults.animate.steps must be positive`;
  }
  if (a.cfg_scale != null && a.cfg_scale < 0) {
    return $localize`:@@val.animCfg:defaults.animate.cfg_scale cannot be negative`;
  }
  if (!a.high_noise_diffusion_model) {
    if (a.high_noise_steps != null || a.high_noise_cfg_scale != null) {
      return $localize`:@@val.animHighNoiseNeeds:high_noise_steps and high_noise_cfg_scale need defaults.animate.high_noise_diffusion_model`;
    }
  } else {
    if (a.high_noise_steps != null && !(a.high_noise_steps > 0)) {
      return $localize`:@@val.animHighNoiseSteps:defaults.animate.high_noise_steps must be positive`;
    }
    if (a.high_noise_cfg_scale != null && a.high_noise_cfg_scale < 0) {
      return $localize`:@@val.animHighNoiseCfg:defaults.animate.high_noise_cfg_scale cannot be negative`;
    }
  }
  return undefined;
}

/**
 * Maps a Go validation message onto the scene it names (`scene "id"`), so
 * the server's answer lands next to the offending field (design D4).
 */
export function sceneIdFromServerError(message: string): string | null {
  const m = /scene "([^"]+)"/.exec(message);
  return m ? m[1] : null;
}

