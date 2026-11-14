import '@angular/localize/init';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { LOCALE_ID } from '@angular/core';
import { loadTranslations } from '@angular/localize';
import { TestBed } from '@angular/core/testing';

import { fakeStorage } from './app/core/storage-fake';
import es from './locale/messages.es.json';

// The texts are written in English; the unit tests check the Spanish UI (the other language the app ships), so the
// Spanish catalog is loaded before any module that evaluates a `$localize` text is imported.
loadTranslations(es as Record<string, string>);
// Numbers and dates in the tests are formatted as in the Spanish UI, like the app does when the person chose Spanish.
registerLocaleData(localeEs);

// Runs before every test: nothing a test leaves in the browser storage or in the globals it stubbed may reach the next
// one (the mode filter, for one, reads its choice from localStorage when it is created, and the connection settings
// live in both). The storages are in-memory ones, fresh for each test, because the real ones are not always usable
// (Node 25+) and are shared by the whole file.
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: 'es' }] });
  vi.stubGlobal('localStorage', fakeStorage());
  vi.stubGlobal('sessionStorage', fakeStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// vi.waitFor gives up after one second, which a slow runner (the CI under coverage) can exceed without anything being wrong.
const waitFor = vi.waitFor.bind(vi);
vi.waitFor = ((callback, options) =>
  waitFor(callback, typeof options === 'number' ? options : { timeout: 5000, interval: 20, ...options })) as typeof vi.waitFor;
