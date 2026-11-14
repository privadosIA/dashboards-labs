import { AssetEntry, CatalogEntry, ProjectConfig, RequestKind, RequestPlan, Scene, Track } from '../core/api.models';
import type { EditEngine, StyleChoice } from '../editor/quality-tiers';
import { applyEditEntry, editEngineOf } from '../editor/quality-tiers';
import { AutoMachine, EasyPlan, VideoChoiceId, editEntryFor, easyPlanForNewProject, estimateSeconds } from '../editor/auto-plan';
import { planMusicAuto, planSettings } from '../music/music-auto-plan';
import type { MusicSettings } from '../core/api.models';
import { MOBILE_PREFIX } from '../core/mode-filter.store';
import { GENERATORS, GeneratorChoice, resolveGenerator } from './music-generator';

/** What the user confirmed on the card: the plan's texts as they were left, plus the files attached. */
export interface RequestDraft {
  kind: RequestKind;
  title: string;
  imagePrompt: string;
  motionPrompt: string;
  caption: string;
  lyrics: string;
  tags: string;
  /** The generator of a song: the one the user picked or 'auto' (callers resolve it before sending or saving). */
  generator: GeneratorChoice;
  /** The user changed the style, the tags or the lyrics since the last suggestion: asking again asks first. */
  suggestionEdited: boolean;
  instrumental: boolean;
  /** The length of a song, in seconds. */
  seconds: number;
  /** A file of the project's sources folder the generation starts from (a picture) or follows (a song). */
  picture?: string;
  audio?: string;
  /** The engine of a video: the one the user picked, or 'auto' (the best the machine allows, LTX 2.3 when there is speech). */
  engine: 'auto' | VideoChoiceId;
  /** The words a video has to say; empty = none. */
  speech: string;
  /**
   * The look of the pictures: a model of that style, 'edit' (retouch the picture attached: the words are an
   * instruction), or 'auto' (the usual model; a picture attached then starts a generation, img2img).
   */
  style: 'auto' | StyleChoice;
  /** The engine of Retouch when both are installed; absent means the fast one. */
  editEngine?: EditEngine;
  /** How far an img2img generation may depart from the picture, 0.1 to 1. */
  strength: number;
  /** How big or good the result is: a level, or 'auto' (the best the machine allows). */
  resolution: LevelChoice;
  /** A video made by animating a picture (with the engine chosen) or an animated graphic (a page rendered with Chrome). */
  animation: 'image' | 'graphic';
  /** The size of the picture attached, when the page could read it; the edit keeps its shape. */
  pictureSize?: { width: number; height: number };
}

/** The levels of the card: "auto" is the best the machine allows, the others make it smaller and faster. */
export type LevelChoice = 'auto' | 'draft' | 'normal' | 'high';
export const LEVELS: readonly LevelChoice[] = ['auto', 'draft', 'normal', 'high'];

/** Draft on a narrow screen (a phone: cheap and quick), and always for a song; automatic elsewhere. */
export function defaultLevel(kind: RequestKind): LevelChoice {
  if (kind === 'music') return 'draft';
  return window.matchMedia?.('(max-width: 599px)').matches ? 'draft' : 'auto';
}

/** The size a level makes a resolution: draft is half the sides, normal three quarters, in multiples of 32 (never below 256, never above the original). */
export function scaleResolution(resolution: string, level: LevelChoice): string {
  const factor = level === 'draft' ? 0.5 : level === 'normal' ? 0.75 : 1;
  const [w, h] = resolution.split('x').map(Number);
  if (factor === 1 || !w || !h) return resolution;
  const snap = (n: number, original: number) => Math.min(original, Math.max(256, Math.round((n * factor) / 32) * 32));
  return `${snap(w, w)}x${snap(h, h)}`;
}

/** The strength the generator uses when none is written. */
export const DEFAULT_STRENGTH = 0.6;

/** The lengths a song can be asked for on the card, in seconds. */
export const SONG_LENGTHS = { short: 60, normal: 120, long: 180 } as const;
export type SongLength = keyof typeof SONG_LENGTHS;

/** The closest card length to what the request named (0 or absent: the normal one). */
export function lengthFor(seconds: number | undefined): SongLength {
  if (!seconds) return 'normal';
  return (Object.keys(SONG_LENGTHS) as SongLength[]).reduce((best, k) => (Math.abs(SONG_LENGTHS[k] - seconds) < Math.abs(SONG_LENGTHS[best] - seconds) ? k : best), 'normal' as SongLength);
}

/** The draft a plan starts as; the card edits it. */
export function draftFromPlan(plan: RequestPlan): RequestDraft {
  return {
    kind: plan.kind,
    title: plan.title,
    imagePrompt: plan.image_prompt ?? '',
    motionPrompt: plan.motion_prompt ?? '',
    caption: plan.caption ?? '',
    lyrics: plan.lyrics ?? '',
    tags: plan.tags ?? '',
    generator: 'auto',
    suggestionEdited: false,
    resolution: defaultLevel(plan.kind),
    animation: 'image',
    instrumental: plan.instrumental,
    seconds: SONG_LENGTHS[lengthFor(plan.seconds)],
    engine: 'auto',
    speech: plan.kind === 'video' ? (plan.speech ?? '') : '',
    style: 'auto',
    strength: DEFAULT_STRENGTH,
  };
}

/** The draft of a request the assistant could not interpret: the user's words are the prompt. */
export function draftFromText(text: string, kind: RequestKind, title: string): RequestDraft {
  return {
    kind,
    title,
    imagePrompt: kind === 'music' ? '' : text,
    motionPrompt: '',
    caption: kind === 'music' ? text : '',
    lyrics: '',
    tags: '',
    generator: 'auto',
    suggestionEdited: false,
    resolution: defaultLevel(kind),
    animation: 'image',
    instrumental: false,
    seconds: SONG_LENGTHS.normal,
    engine: 'auto',
    speech: '',
    style: 'auto',
    strength: DEFAULT_STRENGTH,
  };
}

/** A project id from the title: `mobile-20261020-1532-gato-en-la-azotea`; the server takes [A-Za-z0-9._-], 64 characters. */
export function projectIdFor(title: string, now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36)
    .replace(/-+$/g, '');
  return slug ? `mobile-${stamp}-${slug}` : `mobile-${stamp}`;
}

/** The title a project made by this page had, read back from its id; the date when the title was empty. */
export function titleFromProjectId(id: string): string {
  const m = /^mobile-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(?:-(.*))?$/.exec(id);
  if (!m) return id;
  const words = (m[6] ?? '').replace(/-\d+$/, '').replace(/-+/g, ' ').trim();
  return words || `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
}

/** The prefix of the projects this page creates, so the page can list them again. */
export const REQUEST_PREFIX = MOBILE_PREFIX;

/** A file name that the server takes for a source: `[A-Za-z0-9._-]`, the extension kept in lower case. */
export function sourceNameFor(original: string, now: number, fallbackExt: string): string {
  const dot = original.lastIndexOf('.');
  const ext = (dot > 0 ? original.slice(dot + 1) : fallbackExt).toLowerCase().replace(/[^a-z0-9]/g, '') || fallbackExt;
  const stem = (dot > 0 ? original.slice(0, dot) : original)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${stem || 'archivo'}-${now.toString(36)}.${ext}`;
}

/** A starter scene for the draft. A picture the user supplied is the scene's own (video) or its start (image). */
function sceneFor(d: RequestDraft): Scene {
  const base: Scene = {
    id: d.kind === 'image' ? 'imagen_1' : 'escena_1',
    prompt: d.imagePrompt.trim() || d.title,
    negative_prompt: '',
    tts_text: '',
    speed: 1,
    lora: '',
    silence_seconds: 5,
  };
  if (d.kind === 'video') {
    base.animate = true;
    if (d.motionPrompt.trim()) base.motion_prompt = d.motionPrompt.trim();
    if (d.picture) base.image = d.picture;
  } else if (d.picture) {
    base.init_image = d.picture;
    if (d.style !== 'edit' && d.strength !== DEFAULT_STRENGTH) base.strength = d.strength;
  }
  return base;
}

/**
 * A starter like the server's, for timing a request before its project exists. The planner replaces the model,
 * the resolution and the steps; only the shape matters.
 */
export function previewStarter(): ProjectConfig {
  return {
    project: 'preview',
    output: { mode: 'video', file: 'out/preview.mp4', contact_sheet: false },
    defaults: { model: '', voice: '', resolution: '1280x720', sampler: 'euler', steps: 30, fps: 30, subject_prompt: '', negative_prompt: '', lora_model_dir: '' },
    scenes: [],
  };
}

/** Seconds a line takes to say: about 2.5 words a second, plus a breath at each end. */
export function speechSeconds(speech: string): number {
  const words = speech.trim().split(/\s+/).filter(Boolean).length;
  return words === 0 ? 0 : words / 2.5 + 1;
}

/** LTX 2.3 frames (8k+1, at 24 fps) for a line of speech, no fewer than the preset and no more than the card can hold. */
export function ltxFramesFor(speech: string, presetFrames: number, vramMb: number): number {
  const cap = vramMb >= 14000 ? 97 : 73;
  const wanted = 8 * Math.ceil((speechSeconds(speech) * 24) / 8) + 1;
  return Math.min(cap, Math.max(presetFrames, wanted));
}

/** The size an edit is made at: the picture's own shape in about the pixels the entry was measured at, in multiples of 16. */
export function editResolution(size: { width: number; height: number } | undefined, preset: string | undefined): string {
  const [pw, ph] = (preset ?? '1024x576').split('x').map(Number);
  const budget = (pw || 1024) * (ph || 576);
  if (!size || size.width <= 0 || size.height <= 0) return `${pw || 1024}x${ph || 576}`;
  const ratio = size.width / size.height;
  const h = Math.max(16, Math.round(Math.sqrt(budget / ratio) / 16) * 16);
  const w = Math.max(16, Math.round((h * ratio) / 16) * 16);
  return `${w}x${h}`;
}

/** Writes the editing model on a configuration, at the shape of the picture, one picture per scene. */
function withEditModel(cfg: ProjectConfig, entry: CatalogEntry, d: RequestDraft): ProjectConfig {
  const c = applyEditEntry(cfg, entry);
  c.defaults.resolution = editResolution(d.pictureSize, entry.preset?.resolution);
  for (const s of c.scenes) s.variants = 1;
  return c;
}

/** What a video or an image request is made with: the configuration, and the engine and who says the speech. */
export interface VideoRequestPlan extends EasyPlan {
  /** Who says the speech: the model itself (LTX 2.3), the narration voice, or nobody. */
  speechBy: 'model' | 'narration' | '';
  /** The picture is edited by the editing model (the words are the instruction). */
  editing?: boolean;
  /** The engine that edits it, to say which one was used. */
  editEngine?: EditEngine;
  /** The video is an animated graphic: no engine and no picture model. */
  graphic?: boolean;
}

/**
 * The project's configuration for a video or an image: the server's starter, one scene and the engine the user
 * picked, or else the best the machine allows. A video's speech is said by LTX 2.3 itself (written in its movement
 * prompt, with the frames it needs and its audio on) and by the narration voice with any other engine.
 */
export function videoRequestPlan(starter: ProjectConfig, d: RequestDraft, catalog: CatalogEntry[], machine: AutoMachine): VideoRequestPlan | null {
  const plan = d.kind === 'video' && d.animation === 'graphic' ? graphicRequestPlan(starter, d) : modelRequestPlan(starter, d, catalog, machine);
  if (!plan) return null;
  const resolution = scaleResolution(plan.config.defaults.resolution, d.resolution);
  return resolution === plan.config.defaults.resolution ? plan : { ...plan, config: { ...plan.config, defaults: { ...plan.config.defaults, resolution } } };
}

/** An animated graphic: one motion-graphic scene written by the language model and drawn by Chrome; no picture model, no engine. */
function graphicRequestPlan(starter: ProjectConfig, d: RequestDraft): VideoRequestPlan {
  const text = d.imagePrompt.trim() || d.title;
  const speech = d.speech.trim();
  const scene: Scene = { id: 'escena_1', prompt: text, negative_prompt: '', tts_text: speech, speed: 1, lora: '', silence_seconds: 5, motion_graphic: text };
  const defaults = { ...starter.defaults };
  delete defaults.animate;
  const config: ProjectConfig = { ...starter, output: { ...starter.output, mode: 'video' }, defaults, scenes: [scene] };
  return { config, video: null, imageEntry: null, speechPick: false, noSpeechEngine: false, speechBy: speech ? 'narration' : '', graphic: true };
}

function modelRequestPlan(starter: ProjectConfig, d: RequestDraft, catalog: CatalogEntry[], machine: AutoMachine): VideoRequestPlan | null {
  const speech = d.kind === 'video' ? d.speech.trim() : '';
  const withScene: ProjectConfig = {
    ...starter,
    output: { ...starter.output, mode: d.kind === 'image' ? 'images' : 'video' },
    scenes: [sceneFor(d)],
  };
  const plan = easyPlanForNewProject(withScene, catalog, machine, { engine: d.engine === 'auto' ? undefined : d.engine, speech: !!speech, style: d.style === 'auto' || d.style === 'edit' ? undefined : d.style });
  if (!plan) return null;
  // A picture to edit goes to the editing model when it is installed and fits; otherwise it starts a generation.
  const editModel = d.kind === 'image' && d.picture && d.style === 'edit' ? editEntryFor(catalog, machine, d.editEngine) : null;
  if (editModel) {
    const config = withEditModel(plan.config, editModel, d);
    // The scene is an edit: no strength, and the instruction is what the user said.
    for (const s of config.scenes) delete s.strength;
    return { ...plan, config, speechBy: '', editing: true, editEngine: editEngineOf(editModel) };
  }
  if (!speech) return { ...plan, speechBy: '' };
  const config = structuredClone(plan.config);
  const scene = config.scenes[0];
  const animate = config.defaults.animate;
  if (plan.video?.engine === 'ltx-2.3' && animate) {
    const motion = (scene.motion_prompt || scene.prompt).trim();
    scene.motion_prompt = `${motion}${/[.!?]$/.test(motion) ? '' : '.'} The person says clearly: "${speech}"`;
    animate.model_audio = true;
    animate.model_audio_speech = true;
    animate.frames = ltxFramesFor(speech, animate.frames ?? 49, machine.vramMb);
    return { ...plan, config, speechBy: 'model' };
  }
  scene.tts_text = speech;
  return { ...plan, config, speechBy: 'narration' };
}

/** The configuration alone, for callers that do not need to know the engine. */
export function videoOrImageConfig(starter: ProjectConfig, d: RequestDraft, catalog: CatalogEntry[], machine: AutoMachine): ProjectConfig | null {
  return videoRequestPlan(starter, d, catalog, machine)?.config ?? null;
}

/** The track of a song request. */
export function trackFor(d: RequestDraft): Track {
  const t: Track = { id: 'pista_1', prompt: d.caption.trim() || d.title, duration_seconds: d.seconds, title: d.title, variants: 1 };
  if (d.instrumental) t.instrumental = true;
  else if (d.lyrics.trim()) t.lyrics = d.lyrics.trim();
  if (d.tags.trim() && GENERATORS[resolveGenerator(d.generator, [])].style === 'tags') t.tags = d.tags.trim();
  if (d.audio) t.reference = d.audio;
  return t;
}

/** The project's configuration for a song: one track at the best level the machine can make, one version. */
export function musicConfig(starter: ProjectConfig, d: RequestDraft, installed: readonly AssetEntry[], machine: AutoMachine): ProjectConfig {
  const cfg: ProjectConfig = { ...starter, output: { ...starter.output, mode: 'music' }, scenes: [], tracks: [trackFor(d)] };
  // HeartMuLa and DiffRhythm2 have no quality levels to plan: the project only names the generator.
  const generator = resolveGenerator(d.generator, []);
  if (generator !== 'ace-step') return { ...cfg, defaults: { ...cfg.defaults, music: { ...(cfg.defaults.music ?? {}), generator } } };
  const plan = planMusicAuto(cfg, installed, machine, null, null, d.resolution);
  if (!plan) return cfg;
  const patch = planSettings(plan);
  const music: MusicSettings = { ...(cfg.defaults.music ?? {}), ...patch };
  for (const key of Object.keys(patch) as (keyof MusicSettings)[]) if (music[key] === undefined) delete music[key];
  return { ...cfg, defaults: { ...cfg.defaults, music } };
}

/** The estimate of a video or an image, in seconds, from the configuration the page will save. */
export function estimateFor(cfg: ProjectConfig, catalog: CatalogEntry[], machine: AutoMachine): number {
  return estimateSeconds(cfg, catalog, machine.speed);
}
