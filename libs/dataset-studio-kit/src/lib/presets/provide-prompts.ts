import { type EnvironmentProviders, inject, makeEnvironmentProviders } from '@angular/core';
import { ApiClient } from '@lab/api-client';

import { FallbackPrompts, LocalPrompts, ServerPrompts } from './adapters';
import { IndexedDbPresetStore, MemoryPresetStore } from './own-store';
import { PROMPTS } from './port';

/**
 * The library of presets: with `memory`, the bundled sample plus the person's own for the life of the page; otherwise the server's store (`/api/prompts`) when it has one, and, when it does not,
 * the bundled sample plus the person's own and the imported ones in the browser's IndexedDB.
 */
export function providePrompts(options: { memory?: boolean } = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: PROMPTS,
      useFactory: () => (options.memory ? new LocalPrompts(new MemoryPresetStore()) : new FallbackPrompts(new ServerPrompts(inject(ApiClient)), new LocalPrompts(new IndexedDbPresetStore()))),
    },
  ]);
}
