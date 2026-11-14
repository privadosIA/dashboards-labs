import { InjectionToken } from '@angular/core';

import type { SongPort } from './port';

/** What the dashboard injects. `app.config.ts` says which adapter provides it. */
export const SONGS = new InjectionToken<SongPort>('SONGS');
