import type { EnvironmentProviders } from '@angular/core';
import { makeEnvironmentProviders } from '@angular/core';

import { ASSIST_OPTIONS, type AssistKitOptions } from './options';

/** The language of the picker. The providers port is the host's: `ASSIST_PROVIDERS` with `ServerProviders` or `MemoryProviders`, or `provideAssistProviders`. */
export function provideAssistKit(options: AssistKitOptions): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: ASSIST_OPTIONS, useValue: options }]);
}
