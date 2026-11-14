import { CatalogEntry } from './api.models';
import { activeLang } from './language';

/** The catalog texts come from the server in Spanish with an English version: show the one of the UI language. */
export function catalogName(e: CatalogEntry): string {
  return activeLang() === 'en' && e.name_en ? e.name_en : e.name;
}

export function catalogDescription(e: CatalogEntry): string {
  return activeLang() === 'en' && e.description_en ? e.description_en : e.description;
}

export function catalogPromptHint(e: CatalogEntry): string {
  return activeLang() === 'en' && e.prompt_hint_en ? e.prompt_hint_en : (e.prompt_hint ?? '');
}

export function catalogCommercialNote(e: CatalogEntry): string {
  return activeLang() === 'en' && e.commercial_note_en ? e.commercial_note_en : (e.commercial_note ?? '');
}
