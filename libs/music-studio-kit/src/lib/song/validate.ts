import { GENERATORS } from './generators';
import type { GeneratorName } from './model';
import { parseTags } from './style';

/** The most characters of a title. */
export const TITLE_MAX = 80;
/** The most characters of an Easy prompt: what the server's assistant accepts. */
export const PROMPT_MAX = 2000;

export type Problem = 'title.required' | 'title.tooLong' | 'lyrics.required' | 'style.required' | 'prompt.required' | 'prompt.tooLong';

/**
 * What is wrong with the Custom form (empty when it can be generated). An instrumental song needs no lyrics; a generator
 * that reads tags (HeartMuLa, DiffRhythm2) needs at least one, as the server refuses a song without them.
 */
export function validateCustom(draft: { title: string; lyrics: string; instrumental?: boolean; style?: string; generator?: GeneratorName }): Problem[] {
  const problems: Problem[] = [];
  const title = draft.title.trim();
  if (!title) problems.push('title.required');
  else if ([...title].length > TITLE_MAX) problems.push('title.tooLong');
  if (!draft.instrumental && !draft.lyrics.trim()) problems.push('lyrics.required');
  if (draft.generator && GENERATORS[draft.generator].style === 'tags' && parseTags(draft.style ?? '').length === 0) problems.push('style.required');
  return problems;
}

/** What is wrong with the Easy form. */
export function validateEasy(draft: { prompt: string }): Problem[] {
  const prompt = draft.prompt.trim();
  if (!prompt) return ['prompt.required'];
  return [...prompt].length > PROMPT_MAX ? ['prompt.tooLong'] : [];
}
