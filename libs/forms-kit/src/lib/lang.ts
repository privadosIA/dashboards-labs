/** The languages a dashboard is written in. */
export type Lang = 'es' | 'en';
export const LANGS: readonly Lang[] = ['es', 'en'];
/** The language used when the active one has no file for a schema. */
export const FALLBACK_LANG: Lang = 'en';
