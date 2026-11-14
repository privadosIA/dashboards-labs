import { InjectionToken } from '@angular/core';
import type { Lang } from '@lab/forms-kit';

export interface MusicStudioOptions {
  /** The language of every text of the studio (the dashboard's own). */
  lang: Lang;
  /** The name the dashboard gives itself to the server on every song it makes (`^[a-z0-9-]{1,32}$`); `music-studio` when none. */
  client?: string;
  /** The in-memory adapter, which needs no server and keeps the history in the session storage, instead of the server's. */
  memory?: boolean;
}

export const MUSIC_STUDIO_OPTIONS = new InjectionToken<MusicStudioOptions>('MUSIC_STUDIO_OPTIONS');
