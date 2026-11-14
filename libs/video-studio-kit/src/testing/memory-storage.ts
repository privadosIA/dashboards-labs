import { TestBed } from '@angular/core/testing';

import { VIDEO_STUDIO_OPTIONS } from '../lib/core/options';

/**
 * Installs an in-memory `localStorage` for the test that calls it (undo with `vi.unstubAllGlobals()`). The tests do not
 * rely on the environment's own: Node 25+ ships a `localStorage` global that is not usable without a file.
 *
 * The library takes its language from `provideVideoStudio`, not from a storage, so the tests that used to choose it with
 * `'video-studio.lang'` keep saying it that way and this gives the language to the test module (English when it says none).
 */
export function stubStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  const storage: Storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
  vi.stubGlobal('localStorage', storage);
  const lang = initial['video-studio.lang'] === 'es' ? 'es' : 'en';
  TestBed.configureTestingModule({ providers: [{ provide: VIDEO_STUDIO_OPTIONS, useValue: { lang } }] });
  return storage;
}
