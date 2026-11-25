import type { ModelEntry } from '../core/api.models';

/** What is wrong with one entry, in words; an empty string is fine. The server decides what is valid: these are the rules its docs state, so that nothing it will refuse is sent. */
export interface EntryProblems {
  id: string;
  source: string;
  prompt: string;
  variants: string;
}

const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export const MAX_PROMPT = 1000;
export const MAX_VARIANTS = 4;

/** The entry's problems, given the other entries' ids (to find a repeated one). */
export function entryProblems(entry: ModelEntry, index: number, all: readonly ModelEntry[]): EntryProblems {
  const out: EntryProblems = { id: '', source: '', prompt: '', variants: '' };
  if (!ID.test(entry.id)) out.id = $localize`:@@m3p.errId:Lower case letters, digits, dots, underscores and hyphens, up to 64.`;
  else if (all.some((e, i) => i !== index && e.id === entry.id)) out.id = $localize`:@@m3p.errIdUsed:Another entry has this id.`;
  const hasPrompt = (entry.prompt ?? '').trim() !== '';
  const hasImage = (entry.image ?? '') !== '';
  if (hasPrompt && hasImage) out.source = $localize`:@@m3p.errBoth:Keep the text or the picture, not both.`;
  else if (!hasPrompt && !hasImage) out.source = $localize`:@@m3p.errNeither:Write the text of the object or choose a picture.`;
  if ((entry.prompt ?? '').length > MAX_PROMPT) out.prompt = $localize`:@@m3p.errLong:At most 1000 characters.`;
  const variants = entry.variants ?? 1;
  if (!Number.isInteger(variants) || variants < 1 || variants > MAX_VARIANTS) out.variants = $localize`:@@m3p.errVariants:From one to four variants.`;
  else if (hasImage && variants > 1) out.variants = $localize`:@@m3p.errVariantsPicture:An entry with its own picture makes one model.`;
  return out;
}

/** The problems of every entry, and whether any entry has one. */
export function validateEntries(entries: readonly ModelEntry[]): { problems: EntryProblems[]; ok: boolean } {
  const problems = entries.map((e, i) => entryProblems(e, i, entries));
  return { problems, ok: problems.every((p) => !p.id && !p.source && !p.prompt && !p.variants) };
}

/** The index of the entry a server refusal names (`models[2].id: ...`), or `-1`. */
export function entryOfRefusal(message: string): number {
  const m = /models\[(\d+)\]/.exec(message);
  return m ? Number(m[1]) : -1;
}
