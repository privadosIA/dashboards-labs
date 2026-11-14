import { inject, makeEnvironmentProviders, provideEnvironmentInitializer, type EnvironmentProviders } from '@angular/core';
import { ApiClient } from '@lab/api-client';
import { ANIMATION } from '@lab/animation-core';
import { ASSIST_PROVIDERS, MemoryProviders, ServerProviders, provideAssistKit } from '@lab/assist-kit';
import { DATASET_PORT } from '@lab/dataset-import';
import { map } from 'rxjs';

import { DATASET_STUDIO_OPTIONS, type DatasetStudioOptions } from './core/options';
import { InMemoryEngines } from './engines/in-memory';
import { ENGINES } from './engines/port';
import { ServerEngines } from './engines/server.adapter';
import { MemoryWriter, ServerWriter, WRITER } from './generate/writer';
import { providePrompts } from './presets/provide-prompts';

/**
 * Provide it once, **at the start of the application** (the root injector: the nav a host draws in its header and the language service read it from there), with the dashboard's language.
 * It provides what is the studio's own: the engines it reads, the assistant it writes with, the library of presets and the assistant picker's language and providers. The ports its host provides where it already
 * does, with the same `client` and `memory` it gives here, are `provideMusicMotion({ lang, client, memory })` (the catalog and the animated piece) and `provideDatasetImport({ lang, mode, memory })` (the server's preview
 * and the creation); this says so at once when one is missing.
 */
export function provideDatasetStudio(options: DatasetStudioOptions): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: DATASET_STUDIO_OPTIONS, useValue: options },
    provideAssistKit({ lang: options.lang }),
    providePrompts({ memory: options.memory }),
    { provide: ENGINES, useFactory: () => (options.memory ? new InMemoryEngines() : new ServerEngines(inject(ApiClient), inject(ANIMATION), options.lang)) },
    { provide: WRITER, useFactory: () => (options.memory ? new MemoryWriter() : new ServerWriter(inject(ApiClient))) },
    {
      provide: ASSIST_PROVIDERS,
      useFactory: () => {
        if (!options.memory) return new ServerProviders(inject(ApiClient));
        const animation = inject(ANIMATION);
        return new MemoryProviders(() => animation.assistModels().pipe(map((m) => m.models.map((x) => x.name))));
      },
    },
    provideEnvironmentInitializer(() => {
      if (!inject(ANIMATION, { optional: true })) throw new Error('The dataset studio needs the port of the catalog: provide it with provideMusicMotion({ lang, client, memory }) where provideDatasetStudio is provided, or above.');
      if (!inject(DATASET_PORT, { optional: true })) throw new Error('The dataset studio needs the dataset import: provide it with provideDatasetImport({ lang, mode, memory }) where provideDatasetStudio is provided, or above.');
    }),
  ]);
}
