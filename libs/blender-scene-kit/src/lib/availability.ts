import { type EnvironmentProviders, InjectionToken, type Signal, makeEnvironmentProviders, signal } from '@angular/core';

/**
 * Whether Blender is ready on the machine: the environment report is known and lists `blender` as present. Every kit with a
 * 3D surface reads this signal and offers nothing 3D while it is false, so a host that does not provide it shows no 3D.
 */
export const BLENDER_AVAILABLE = new InjectionToken<Signal<boolean>>('BLENDER_AVAILABLE', { providedIn: 'root', factory: () => signal(false) });

/** The host gives the signal its own environment report feeds (an app's store, or `signal(true)` for the in-memory hosts). */
export function provideBlenderAvailable(source: () => Signal<boolean>): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: BLENDER_AVAILABLE, useFactory: source }]);
}
