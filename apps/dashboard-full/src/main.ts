/// <reference types="@angular/localize" />

import { setActiveLang, storedLang } from './app/core/language';

/**
 * The app code is imported only after the language is settled: the compiled
 * templates and `$localize` texts read the translations when their modules
 * are evaluated, so the Spanish catalog must be loaded first (English is the
 * source language of the texts and needs nothing).
 */
async function start(): Promise<void> {
  const lang = storedLang();
  if (lang === 'es') {
    const [{ loadTranslations }, es, { registerLocaleData }, esLocale] = await Promise.all([
      import('@angular/localize'),
      import('./locale/messages.es.json'),
      import('@angular/common'),
      import('@angular/common/locales/es'),
    ]);
    loadTranslations(es.default as Record<string, string>);
    registerLocaleData(esLocale.default);
  }
  setActiveLang(lang);
  document.documentElement.lang = lang;

  const [{ bootstrapApplication }, { appConfig }, { App }] = await Promise.all([
    import('@angular/platform-browser'),
    import('./app/app.config'),
    import('./app/app'),
  ]);
  await bootstrapApplication(App, appConfig);
}

start().catch((err) => {
  console.error(err);
  // Rethrown outside the promise so the page's own error notice (index.html) can show it.
  setTimeout(() => {
    throw err;
  });
});
