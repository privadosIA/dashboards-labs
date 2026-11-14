import { InjectionToken } from '@angular/core';
import type { Lang } from '@lab/forms-kit';

export interface VideoStudioOptions {
  /** The language of every text of the studio (the dashboard's own). */
  lang: Lang;
  /** The name the dashboard gives itself to the server on what it generates, edits and retouches (`^[a-z0-9-]{1,32}$`). */
  client?: string;
  /** The in-memory adapters, which need no server and keep the history in the session storage, instead of the server's. */
  memory?: boolean;
}

export const VIDEO_STUDIO_OPTIONS = new InjectionToken<VideoStudioOptions>('VIDEO_STUDIO_OPTIONS');
