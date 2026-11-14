import { InjectionToken } from '@angular/core';
import type { Lang } from '@lab/forms-kit';

export interface MusicMotionOptions {
  /** The language of every text of the screens (the dashboard's own). */
  lang: Lang;
  /** The name the dashboard gives itself to the server on the pieces it makes (`^[a-z0-9-]{1,32}$`). */
  client: string;
  /** The in-memory adapter, which needs no server and keeps the pieces in the session storage, instead of the server's. */
  memory?: boolean;
}

export const MUSIC_MOTION_OPTIONS = new InjectionToken<MusicMotionOptions>('MUSIC_MOTION_OPTIONS');
