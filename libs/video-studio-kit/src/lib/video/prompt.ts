import type { GenerationSettings } from './model';

/** What the server accepts of a prompt (its `GenerationRequest.prompt`), in characters. */
export const PROMPT_MAX = 2000;

/**
 * The prompt the request carries: the person's prompt and, when the sound is wanted (Audio on, and a model that writes
 * it), the sound as one more sentence after it. The contract has a single prompt and no audio prompt, so this is the
 * only place that says how the two are joined; the length check and the request use it, so they cannot disagree.
 */
export function fullPrompt(settings: GenerationSettings, canSound = true): string {
  const sound = settings.audio && canSound ? (settings.sound ?? '').trim() : '';
  return [settings.prompt.trim(), sound && `Sound: ${sound}`].filter(Boolean).join(' ');
}
