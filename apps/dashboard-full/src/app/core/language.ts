/**
 * UI language. The templates are compiled in English (the source language of
 * the catalog); Spanish is loaded at start-up with `loadTranslations` (see
 * main.ts). The choice lives in localStorage; English is the default and an
 * unreadable storage means English.
 */
export type Lang = 'en' | 'es';

export const LANG_KEY = 'mo.lang';
export const LANGS: readonly Lang[] = ['en', 'es'];

/** The language the page was started in; Spanish until main.ts says otherwise (unit tests run in Spanish: test-setup.ts loads the Spanish catalog). */
let active: Lang = 'es';

export function activeLang(): Lang {
  return active;
}

export function setActiveLang(lang: Lang): void {
  active = lang;
}

/** The remembered choice: English unless Spanish was chosen. */
export function storedLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === 'es' ? 'es' : 'en';
  } catch {
    return 'en';
  }
}

/** Remembers the choice and reloads the page on the same route, which starts it in that language. */
export function chooseLang(lang: Lang): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // the page reloads in English if the choice cannot be kept
  }
  location.reload();
}
