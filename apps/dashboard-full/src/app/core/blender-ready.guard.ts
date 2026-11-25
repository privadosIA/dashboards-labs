import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';

import { EnvironmentStore } from './environment.store';

/**
 * The 3D screens exist only on a machine with Blender. The guard waits for the environment report (a reload on a 3D address
 * with Blender must not bounce), and sends the person to the start page when Blender is missing or the report does not arrive.
 */
export const blenderReadyGuard: CanActivateFn = async () => {
  const env = inject(EnvironmentStore);
  const router = inject(Router);
  try {
    await env.ensureLoaded();
  } catch {
    // the server does not answer: no 3D
  }
  return env.blenderReady() || router.parseUrl('/');
};
