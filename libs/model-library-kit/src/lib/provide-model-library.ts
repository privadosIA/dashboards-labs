import { type EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';

import { MODEL_LIBRARY_OPTIONS, type ModelLibraryOptions } from './core/options';

/** Provide it once with the dashboard's language. The ports (`MODEL_LIBRARY_PORT`, and `MODEL_PLACE_PORT` where there is a place for models) are the host's. */
export function provideModelLibrary(options: ModelLibraryOptions): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: MODEL_LIBRARY_OPTIONS, useValue: options }]);
}
