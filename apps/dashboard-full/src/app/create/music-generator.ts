import type { MusicGeneratorName } from '../core/api.models';

/** What the card lets the user choose: a generator, or "Automatic" (the best one this machine can use). */
export type GeneratorChoice = 'auto' | MusicGeneratorName;

/** What each generator reads and can do; the card hides what a generator cannot use instead of failing later. */
export interface GeneratorInfo {
  /** The words of the style: a sentence (ACE-Step) or tags (the other two). */
  style: 'sentence' | 'tags';
  /** The tags come from the vocabulary (HeartMuLa) and are shown as chips; DiffRhythm2's are free words. */
  vocabulary: boolean;
  instrumental: boolean;
  reference: boolean;
  /** The lyrics can only be written in English. */
  englishLyrics: boolean;
}

export const GENERATORS: Record<MusicGeneratorName, GeneratorInfo> = {
  'ace-step': { style: 'sentence', vocabulary: false, instrumental: true, reference: true, englishLyrics: false },
  heartmula: { style: 'tags', vocabulary: true, instrumental: true, reference: false, englishLyrics: false },
  diffrhythm2: { style: 'tags', vocabulary: false, instrumental: false, reference: false, englishLyrics: true },
};

export const GENERATOR_LABELS: Record<MusicGeneratorName, string> = { 'ace-step': 'ACE-Step', heartmula: 'HeartMuLa', diffrhythm2: 'DiffRhythm2' };

/**
 * The generators this request can use, in the order "Automatic" prefers them: ACE-Step first (it has every
 * feature), then HeartMuLa, then DiffRhythm2. An audio reference leaves only the one that follows it.
 */
export function usableGenerators(have: { ace: boolean; heartmula: boolean; diffrhythm2: boolean }, withReference: boolean): MusicGeneratorName[] {
  const list: MusicGeneratorName[] = [];
  if (have.ace) list.push('ace-step');
  if (have.heartmula) list.push('heartmula');
  if (have.diffrhythm2) list.push('diffrhythm2');
  return withReference ? list.filter((g) => GENERATORS[g].reference) : list;
}

/** The generator a choice stands for: "Automatic" is the first usable one, ACE-Step when nothing is known. */
export function resolveGenerator(choice: GeneratorChoice, usable: readonly MusicGeneratorName[]): MusicGeneratorName {
  if (choice !== 'auto' && (usable.length === 0 || usable.includes(choice))) return choice;
  return usable[0] ?? 'ace-step';
}
