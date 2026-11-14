import { type Provider, inject } from '@angular/core';
import { ApiClient } from '@lab/api-client';
import { ASSIST_PROVIDERS, type AssistProviders, MemoryProviders, ServerProviders } from '@lab/assist-kit';
import { ANIMATION } from '@lab/music-motion';
import { map } from 'rxjs';

import { MOTION_EDIT_OPTIONS } from '../core/options';

/**
 * The providers of the flow: the server's, through the typed client, or the in-memory ones when the host chose memory (there is no server to ask). It is built where it is provided, not
 * at the root, because the pieces' port the memory one reads its models from is provided by the host's lazy routes.
 */
export const flowProviders: Provider = {
  provide: ASSIST_PROVIDERS,
  useFactory: (): AssistProviders => {
    if (inject(MOTION_EDIT_OPTIONS).memory) {
      const animation = inject(ANIMATION);
      return new MemoryProviders(() => animation.assistModels().pipe(map((m) => m.models.map((x) => x.name))));
    }
    return new ServerProviders(inject(ApiClient));
  },
};
