import type { DfFormSchema } from '@core/dynamic-forms';

import { FALLBACK_LANG, Lang } from './lang';

/** The schemas of a component, one per language (the JSON files of its `dynamic/` folder, imported). */
export type SchemaFiles = Partial<Record<Lang, unknown>>;

/**
 * The schema in the active language. When that language has no file, the English one is used and the miss is reported
 * (`console.warn` unless `report` says otherwise) naming the file that is missing. Throws when there is no English file.
 */
export function pickSchema(name: string, files: SchemaFiles, lang: Lang, report: (message: string) => void = (m) => console.warn(m)): DfFormSchema {
  const wanted = files[lang];
  if (wanted) return wanted as DfFormSchema;
  const fallback = files[FALLBACK_LANG];
  if (!fallback) {
    const tried = [...new Set([lang, FALLBACK_LANG])].map((l) => `${name}.${l}.json`).join(' nor ');
    throw new Error(`No schema for "${name}": ${tried} does not exist`);
  }
  report(`${name}.${lang}.json is missing: using ${name}.${FALLBACK_LANG}.json`);
  return fallback as DfFormSchema;
}
