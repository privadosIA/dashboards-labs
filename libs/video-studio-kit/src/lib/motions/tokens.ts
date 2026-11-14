import { InjectionToken } from '@angular/core';

import type { MotionLibraryPort } from './port';

/** What the studio injects. `app.config.ts` says which adapter provides it. */
export const MOTION_LIBRARY = new InjectionToken<MotionLibraryPort>('MOTION_LIBRARY');
