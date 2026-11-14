import type { EngineStatus, GeneratorName } from './model';

/** What each generator reads and can do; the form hides what the chosen one cannot use instead of failing later. */
export interface GeneratorInfo {
  /** The words of the style: tags (HeartMuLa, DiffRhythm2) or a sentence (ACE-Step). */
  style: 'tags' | 'sentence';
  /** The tags come from the server's vocabulary and are shown as chips. */
  vocabulary: boolean;
  /** It can make a song without a voice. */
  instrumental: boolean;
  /** The lyrics can only be written in English. */
  englishLyrics: boolean;
}

export const GENERATORS: Record<GeneratorName, GeneratorInfo> = {
  heartmula: { style: 'tags', vocabulary: true, instrumental: true, englishLyrics: false },
  'ace-step': { style: 'sentence', vocabulary: false, instrumental: true, englishLyrics: false },
  diffrhythm2: { style: 'tags', vocabulary: false, instrumental: false, englishLyrics: true },
};

export const GENERATOR_LABELS: Record<GeneratorName, string> = { heartmula: 'HeartMuLa', 'ace-step': 'ACE-Step', diffrhythm2: 'DiffRhythm2' };

/** The order they are offered in. */
export const GENERATOR_ORDER: readonly GeneratorName[] = ['heartmula', 'ace-step', 'diffrhythm2'];

/** A generator whose container is only stopped: it can be offered, and started from the screen. */
export const isStopped = (engine: EngineStatus | undefined): boolean => engine?.available === false && engine.reason === 'not_running';

/** HeartMuLa when the server can use it (or only has to start it), else the first that it can; HeartMuLa when none, so the screen can say why. */
export function defaultGenerator(engines: readonly EngineStatus[]): GeneratorName {
  const usable = (name: GeneratorName): boolean => engines.some((e) => e.generator === name && (e.available || isStopped(e)));
  return GENERATOR_ORDER.find(usable) ?? 'heartmula';
}
