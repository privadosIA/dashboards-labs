import { EnvironmentProviders, inject, makeEnvironmentProviders } from '@angular/core';
import { ApiClient } from '@lab/api-client';
import { ASSIST_PROVIDERS, MemoryProviders, ServerProviders, provideAssistKit } from '@lab/assist-kit';
import { map } from 'rxjs';

import { InMemoryAnimation } from './animation/in-memory.adapter';
import { ServerAnimation } from './animation/server.adapter';
import { ANIMATION, IN_MEMORY_ANIMATION } from './animation/tokens';
import { MUSIC_MOTION_OPTIONS, type MusicMotionOptions } from './core/options';

/**
 * Provide it once, with the dashboard's language and the name it gives itself to the server. The screens then talk to the
 * server the person connected to (through `ApiClient`), or to pieces kept in the session storage when `memory` is set. It also provides the providers
 * of the assistant picker (`@lab/assist-kit`).
 */
export function provideMusicMotion(options: MusicMotionOptions): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: MUSIC_MOTION_OPTIONS, useValue: options },
    { provide: IN_MEMORY_ANIMATION, useFactory: () => (options.memory ? new InMemoryAnimation({ storage: sessionStorage }) : null) },
    { provide: ANIMATION, useFactory: () => inject(IN_MEMORY_ANIMATION) ?? new ServerAnimation(inject(ApiClient), { client: options.client }) },
    // The assistant picker of the screens that ask the assistant to write: the providers of the server, or the built-in one with no server.
    provideAssistKit({ lang: options.lang }),
    {
      provide: ASSIST_PROVIDERS,
      useFactory: () => {
        if (!options.memory) return new ServerProviders(inject(ApiClient));
        const animation = inject(ANIMATION);
        return new MemoryProviders(() => animation.assistModels().pipe(map((m) => m.models.map((x) => x.name))));
      },
    },
  ]);
}
