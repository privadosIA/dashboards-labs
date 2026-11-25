import { type EnvironmentProviders, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { provideBlenderAvailable } from '@lab/blender-scene-kit';

import { EnvironmentStore } from './environment.store';

/**
 * No 3D anywhere unless the machine has Blender. The kits read the signal this provides, and it is false until the
 * environment report arrives; the report is asked for at the start without waiting for it, and a server that does not
 * answer just leaves 3D hidden.
 */
export function provideBlenderGate(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideBlenderAvailable(() => inject(EnvironmentStore).blenderReady),
    provideAppInitializer(() => {
      void inject(EnvironmentStore).ensureLoaded().catch(() => undefined);
    }),
  ]);
}
