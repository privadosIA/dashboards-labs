import { InjectionToken } from '@angular/core';

import type { VideoGenerationPort } from './port';

/** What the studio injects. `app.config.ts` says which adapter provides it. */
export const VIDEO_GENERATION = new InjectionToken<VideoGenerationPort>('VIDEO_GENERATION');
