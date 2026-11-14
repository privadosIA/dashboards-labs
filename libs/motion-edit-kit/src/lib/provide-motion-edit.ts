import { makeEnvironmentProviders, type EnvironmentProviders } from '@angular/core';

import { MOTION_EDIT_OPTIONS, type MotionEditOptions } from './core/options';

/**
 * Provide it once, **at the start of the application** (the root injector: the nav a host draws in its header and the language service read it from there), with the dashboard's
 * language. It holds only the options, so that what a host loads to start stays small: the editor's own providers (its language and the check for the port) travel with the route table, which a
 * host loads when the first screen opens. The editor needs the port of pieces and the parts' library, which the host provides where it already does (`provideMusicMotion({ lang, client, memory })` and
 * `provideMotionParts({ lang })`, with the same `client` and `memory` it gives here), at the start or in the route that mounts the library: it never provides them itself, so a host that also shows
 * Animation has one port with one client name.
 */
export function provideMotionEdit(options: MotionEditOptions): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: MOTION_EDIT_OPTIONS, useValue: options }]);
}
