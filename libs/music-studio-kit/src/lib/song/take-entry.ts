import type { Injector } from '@angular/core';

import { GENERATORS } from './generators';

/** A song described by a dataset: a title (maybe none), what it is about and its lyrics. */
export interface SongEntry {
  readonly title: string;
  readonly style: string;
  /** Style tags the dataset gave, separated by commas (empty when none). */
  readonly tags: string;
  readonly lyrics: string;
}

/**
 * Puts a song into the Custom form, replacing what was written there, and shows that form. The style is the tags when the generator reads tags (and the
 * dataset gave some), else the description: ACE-Step reads a sentence. The draft is loaded when it is needed: a dashboard that
 * only imports a dataset does not carry the form in the weight of its first page.
 */
export async function takeEntry(injector: Injector, entry: SongEntry): Promise<void> {
  const [{ SongDraftStore }, { titleFromPrompt }] = await Promise.all([import('./draft.store'), import('./request')]);
  const draft = injector.get(SongDraftStore);
  const style = GENERATORS[draft.generator()].style === 'tags' ? entry.tags || entry.style : entry.style || entry.tags;
  draft.setTitle(entry.title || titleFromPrompt(entry.style || entry.tags).replace(/[\s,;:.]+$/, ''));
  draft.setStyle(style);
  draft.setLyrics(entry.lyrics);
  draft.setMode('custom');
}
