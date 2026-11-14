import { InjectionToken } from '@angular/core';

import type { AnimationPort } from './port';

/** What the screens inject. `app.config.ts` says which adapter provides it. */
export const ANIMATION = new InjectionToken<AnimationPort>('ANIMATION');
