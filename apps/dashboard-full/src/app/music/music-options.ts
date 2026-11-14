import { AssetEntry, MusicSettings, MusicTask } from '../core/api.models';

/** Vocal languages the model is documented to sing; an empty value means automatic: the server deduces it from the lyrics (English when there are none). */
export const VOCAL_LANGUAGES: readonly { value: string; label: string }[] = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'it', label: 'Italiano' },
  { value: 'pt', label: 'Português' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'zh', label: '中文' },
  { value: 'ru', label: 'Русский' },
];

/** Voices the caption can ask for (`vocals` in scenes.yaml); an empty value leaves the choice to the model. The engine takes it as a hint, so only the voices that came out in listening tests are offered. */
export const VOCAL_STYLES: readonly { value: string; label: string }[] = [
  { value: 'female', label: $localize`:@@music.vocals.woman:Woman` },
  { value: 'male', label: $localize`:@@music.vocals.man:Man` },
  { value: 'duet', label: $localize`:@@music.vocals.duet:Duet (man and woman)` },
  { value: 'child', label: $localize`:@@music.vocals.child:Boy or girl` },
  { value: 'choir', label: $localize`:@@music.vocals.choir:Choir` },
  { value: 'deep', label: $localize`:@@music.vocals.deep:Deep voice` },
];

/** The quality levels of a song: which synthesis model, with how many steps. */
export type MusicTierId = 'fast' | 'normal' | 'max';

export interface MusicTier {
  id: MusicTierId;
  label: string;
  hint: string;
  /** The synthesis model file this level needs ('' is the project's default, the XL turbo). */
  model: string;
  /** Settings it writes; undefined removes the key (the engine's default). */
  synth_model?: string;
  inference_steps?: number;
  shift?: number;
}

/** The default synthesis model (config.DefaultMusicSynth on the server). */
export const DEFAULT_SYNTH_MODEL = 'acestep-v15-xl-turbo-Q8_0.gguf';
const TURBO_MODEL = 'acestep-v15-turbo-Q8_0.gguf';
const SFT_MODEL = 'acestep-v15-sft-Q8_0.gguf';

/**
 * The quality levels. Times are those measured for a two-minute song with the
 * same lyrics and seed: the turbo synthesises in about 6 s, the XL in 7 to 9 s
 * and the SFT, with its 50 steps, in 10 to 11 s.
 */
export const MUSIC_TIERS: readonly MusicTier[] = [
  { id: 'fast', label: $localize`:@@music.tier.fast:Fast`, hint: $localize`:@@music.tier.fastHint:The turbo model: the fastest (about 6 s per two-minute song) and the lightest.`, model: TURBO_MODEL, synth_model: TURBO_MODEL },
  { id: 'normal', label: $localize`:@@music.tier.normal:Normal`, hint: $localize`:@@music.tier.normalHint:The XL turbo, the default: better sound quality with the same steps (7 to 9 s).`, model: DEFAULT_SYNTH_MODEL },
  { id: 'max', label: $localize`:@@music.tier.max:Maximum`, hint: $localize`:@@music.tier.maxHint:The SFT model with 50 steps: the highest quality (10 to 11 s) and the one needed to extract vocals and instruments.`, model: SFT_MODEL, synth_model: SFT_MODEL, inference_steps: 50, shift: 1 },
];

const asFile = (name: string | undefined): string => (name ? (name.endsWith('.gguf') ? name : `${name}.gguf`) : '');

/** The level the synthesis settings amount to, or null when they are a custom mix of model, steps and shift. */
export function currentTier(s: Pick<MusicSettings, 'synth_model' | 'inference_steps' | 'shift'>): MusicTierId | null {
  const model = asFile(s.synth_model) || DEFAULT_SYNTH_MODEL;
  return (
    MUSIC_TIERS.find((t) => t.model === model && (t.inference_steps ?? undefined) === s.inference_steps && (t.shift ?? undefined) === s.shift)?.id ?? null
  );
}

/** The settings a level writes: every key it governs, with undefined for the ones it clears. */
export function tierSettings(id: MusicTierId): Pick<MusicSettings, 'synth_model' | 'inference_steps' | 'shift'> {
  const t = MUSIC_TIERS.find((x) => x.id === id)!;
  return { synth_model: t.synth_model, inference_steps: t.inference_steps, shift: t.shift };
}

export interface ModelOption {
  value: string;
  /** The configured value is not among the installed files. */
  missing: boolean;
}

/** Installed language models (acestep-5Hz-lm-*). */
export function languageModels(files: readonly AssetEntry[]): string[] {
  return files.map((f) => f.name).filter((n) => /-lm-/i.test(n)).sort();
}

/** Installed synthesis models (acestep-v15-*). */
export function synthesisModels(files: readonly AssetEntry[]): string[] {
  return files.map((f) => f.name).filter((n) => /^acestep-v\d/i.test(n)).sort();
}

/**
 * Options of a model select: the installed files plus, when the project names
 * one that is not installed, that value flagged as missing — so it stays
 * visible instead of being silently replaced. A name without the `.gguf`
 * suffix matches its file, as the server accepts both.
 */
export function modelOptions(installed: readonly string[], configured: string | undefined): ModelOption[] {
  const options = installed.map((value) => ({ value, missing: false }));
  if (configured) {
    const file = configured.endsWith('.gguf') ? configured : `${configured}.gguf`;
    if (!installed.includes(file)) options.push({ value: configured, missing: true });
  }
  return options;
}

/**
 * Options of an adapter select: the installed adapters plus, when the project
 * names one that is not installed, that name flagged as missing so it stays
 * visible instead of being silently replaced.
 */
export function adapterOptions(installed: readonly string[], configured: string | undefined): ModelOption[] {
  const options = installed.map((value) => ({ value, missing: false }));
  if (configured && !installed.includes(configured)) options.push({ value: configured, missing: true });
  return options;
}

/** The option value that stands for a configured name: the file it matches, if installed. */
export function selectedModel(installed: readonly string[], configured: string | undefined): string {
  if (!configured) return '';
  const file = configured.endsWith('.gguf') ? configured : `${configured}.gguf`;
  return installed.includes(file) ? file : configured;
}

/** True when two lyrics differ in content, ignoring line-ending and surrounding whitespace. */
export function lyricsDiffer(requested: string | undefined, sung: string | undefined): boolean {
  const norm = (s?: string) => (s ?? '').replace(/\r\n/g, '\n').trim();
  return norm(requested) !== '' && norm(requested) !== norm(sung);
}

/** "2:05" for a length in seconds; empty when unknown. */
export function clock(seconds: number | undefined): string {
  if (seconds == null || !(seconds >= 0)) return '';
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** What a track can do with an existing song. An empty value is a new song. */
export const TASKS: readonly { value: MusicTask | ''; label: string; hint: string }[] = [
  { value: '', label: $localize`:@@music.task.new:New song`, hint: '' },
  { value: 'cover', label: $localize`:@@music.task.cover:Remix`, hint: $localize`:@@music.task.coverHint:A remix (cover) of another song in a different style; the model reinterprets it freely.` },
  { value: 'cover-nofsq', label: $localize`:@@music.task.coverClose:Faithful remix`, hint: $localize`:@@music.task.coverCloseHint:Like the remix, but it stays close to the original melody and structure.` },
  { value: 'repaint', label: $localize`:@@music.task.repaint:Repaint`, hint: $localize`:@@music.task.repaintHint:Redoes a section of the song and keeps the rest.` },
  { value: 'extract', label: $localize`:@@music.task.extract:Extract`, hint: $localize`:@@music.task.extractHint:Isolates the voice or an instrument. Needs the SFT model, not the turbo.` },
];

/** The instruments and voices the engine can isolate. */
export const STEMS: readonly { value: string; label: string }[] = [
  { value: 'vocals', label: $localize`:@@music.stem.vocals:Vocals` },
  { value: 'backing_vocals', label: $localize`:@@music.stem.backing:Backing vocals` },
  { value: 'drums', label: $localize`:@@music.stem.drums:Drums` },
  { value: 'bass', label: $localize`:@@music.stem.bass:Bass` },
  { value: 'guitar', label: $localize`:@@music.stem.guitar:Guitar` },
  { value: 'keyboard', label: $localize`:@@music.stem.keyboard:Keyboards` },
  { value: 'percussion', label: $localize`:@@music.stem.percussion:Percussion` },
  { value: 'strings', label: $localize`:@@music.stem.strings:Strings` },
  { value: 'synth', label: $localize`:@@music.stem.synth:Synthesizer` },
  { value: 'fx', label: $localize`:@@music.stem.fx:Effects` },
  { value: 'brass', label: $localize`:@@music.stem.brass:Brass` },
  { value: 'woodwinds', label: $localize`:@@music.stem.woodwinds:Woodwinds` },
];

/** The label of a task, for the results. */
export function taskLabel(task: MusicTask): string {
  return TASKS.find((t) => t.value === task)?.label ?? task;
}
