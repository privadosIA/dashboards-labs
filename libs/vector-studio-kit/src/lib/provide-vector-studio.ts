import { inject, makeEnvironmentProviders, provideEnvironmentInitializer, type EnvironmentProviders } from '@angular/core';
import { ApiClient } from '@lab/api-client';
import { ASSIST_PROVIDERS, MemoryProviders, ServerProviders } from '@lab/assist-kit';
import { ANIMATION } from '@lab/music-motion';
import { map } from 'rxjs';
import { provideVectorEditor } from '@lab/vector-editor';

import { VECTOR_STUDIO_OPTIONS, type VectorStudioOptions } from './core/options';

/**
 * Provide it once, **at the start of the application** (the root injector: the nav a host draws in its header and the language service read it from there), with the dashboard's language. The studio needs the port of the catalog of parts too, which the host provides where it
 * already does (`provideMusicMotion({ lang, client, memory })`, with the same `client` and `memory` it gives here): the library never
 * provides it itself, so a host that also shows Animation has one port with one client name. Without it the first call of the studio
 * would fail on a missing token, so this says so at once.
 */
export function provideVectorStudio(options: VectorStudioOptions): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: VECTOR_STUDIO_OPTIONS, useValue: options },
    provideVectorEditor({ lang: options.lang }),
    // The assistant picker of the describe dialog: the providers of the server, or the built-in one with no server. Its language comes from `provideMusicMotion`, which the host provides too.
    {
      provide: ASSIST_PROVIDERS,
      useFactory: () => {
        if (!options.memory) return new ServerProviders(inject(ApiClient));
        const animation = inject(ANIMATION);
        return new MemoryProviders(() => animation.assistModels().pipe(map((m) => m.models.map((x) => x.name))));
      },
    },
    provideEnvironmentInitializer(() => {
      if (!inject(ANIMATION, { optional: true })) {
        throw new Error('The Vector Studio needs the port of the catalog of parts: provide it with provideMusicMotion({ lang, client, memory }) where provideVectorStudio is provided, or above.');
      }
    }),
  ]);
}
