import { InjectionToken } from '@angular/core';

import type { VideoEditPort } from './port';

/** What the studio injects. `app.config.ts` says which adapter provides it. */
export const VIDEO_EDIT = new InjectionToken<VideoEditPort>('VIDEO_EDIT');
