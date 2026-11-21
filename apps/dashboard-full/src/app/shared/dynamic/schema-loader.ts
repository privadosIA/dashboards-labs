import { DfFormSchema } from '@core/dynamic-forms';

import { Lang, activeLang } from '../../core/language';

/** One schema per language the dashboard offers (`dynamic/forms.<lang>.json`, `dynamic/tables.<lang>.json`). */
export type SchemasByLang = Record<Lang, unknown>;

/**
 * The schema of the language the page was started in. Changing the language
 * reloads the page (see `chooseLang`), so the choice is read once, when the
 * component builds its schema.
 */
export function schemaFor(byLang: SchemasByLang, lang: Lang = activeLang()): DfFormSchema {
  return byLang[lang] as DfFormSchema;
}
