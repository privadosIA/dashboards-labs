import { InjectionToken } from '@angular/core';

import type { ImageEditPort } from './port';

/** What the studio injects. `app.config.ts` says which adapter provides it. */
export const IMAGE_EDIT = new InjectionToken<ImageEditPort>('IMAGE_EDIT');
