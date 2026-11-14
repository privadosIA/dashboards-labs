import type { TagVocabulary, VocalGender } from './model';

/** The voice tags of the vocabulary; one is missing when the server does not list it. */
export interface VoiceTags {
  female?: string;
  male?: string;
}

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
const join = (tags: readonly string[]): string => tags.join(', ');

/** The tags of a style written as `a, b, c`: trimmed, without empties and without repeats (ignoring case). */
export function parseTags(style: string): string[] {
  const out: string[] = [];
  for (const raw of style.split(',')) {
    const tag = raw.trim();
    if (tag && !out.some((t) => same(t, tag))) out.push(tag);
  }
  return out;
}

export const hasTag = (style: string, tag: string): boolean => parseTags(style).some((t) => same(t, tag));

/** The style with `tag` added at the end, or taken out when it was there. */
export function toggleTag(style: string, tag: string): string {
  const tags = parseTags(style);
  return join(tags.some((t) => same(t, tag)) ? tags.filter((t) => !same(t, tag)) : [...tags, tag]);
}

/** The style with the combination taken out when all its tags are there, else with every tag it lacks added (as `applyCombo`). */
export function toggleCombo(style: string, combo: readonly string[]): string {
  const tags = parseTags(style);
  if (combo.length && combo.every((tag) => tags.some((t) => same(t, tag)))) return join(tags.filter((t) => !combo.some((tag) => same(t, tag))));
  return applyCombo(style, combo);
}

/** The style with every tag of a combination that it lacks added at the end. */
export function applyCombo(style: string, combo: readonly string[]): string {
  const tags = parseTags(style);
  for (const tag of combo) if (!tags.some((t) => same(t, tag))) tags.push(tag);
  return join(tags);
}

/** The two voice tags: the female and the male entry of the `vocal` category. */
export function voiceTagsOf(vocabulary: TagVocabulary): VoiceTags {
  const tags = vocabulary.categories.find((c) => c.id === 'vocal')?.tags ?? [];
  const female = tags.find((t) => /^female\b/i.test(t));
  const male = tags.find((t) => /^male\b/i.test(t));
  return { ...(female ? { female } : {}), ...(male ? { male } : {}) };
}

/** The style with the voice tag of `gender` (and not the other one); random leaves neither. A tag the server lacks changes nothing. */
export function setVocalGender(style: string, gender: VocalGender, voice: VoiceTags): string {
  const wanted = gender === 'random' ? undefined : voice[gender];
  if (gender !== 'random' && !wanted) return style;
  const rest = parseTags(style).filter((t) => !(voice.female && same(t, voice.female)) && !(voice.male && same(t, voice.male)));
  return join(wanted ? [...rest, wanted] : rest);
}

/** The gender a style carries. */
export function vocalGenderOf(style: string, voice: VoiceTags): VocalGender {
  if (voice.female && hasTag(style, voice.female)) return 'female';
  if (voice.male && hasTag(style, voice.male)) return 'male';
  return 'random';
}

const words = (text: string): string => ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

/** The most tags a style captured from a sentence keeps. */
export const MAX_CAPTURED_TAGS = 8;

/** The tags of the vocabulary that a sentence mentions, in the order of the vocabulary (hyphens, spaces and case do not matter), not taken from the middle of a word. */
export function tagsInText(text: string, vocabulary: TagVocabulary): string[] {
  const sentence = words(text);
  if (sentence.trim() === '') return [];
  return vocabulary.categories
    .flatMap((c) => c.tags)
    .filter((tag) => sentence.includes(words(tag)))
    .slice(0, MAX_CAPTURED_TAGS);
}
