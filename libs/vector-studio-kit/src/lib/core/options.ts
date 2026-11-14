import { InjectionToken } from '@angular/core';
import type { Lang } from '@lab/forms-kit';

export interface VectorStudioOptions {
  /** The language of every text of the studio (the dashboard's own). */
  lang: Lang;
  /** The name the dashboard gives itself to the server on what it sends (`^[a-z0-9-]{1,32}$`); `vector-studio` when none. The host gives the same one to `provideMusicMotion`. */
  client?: string;
  /** The in-memory adapters (the host gives the same flag to `provideMusicMotion`): the studio works with no server at all. */
  memory?: boolean;
}

export const VECTOR_STUDIO_OPTIONS = new InjectionToken<VectorStudioOptions>('VECTOR_STUDIO_OPTIONS');

/** Where the host mounted the routes (`''` at its root, `'/vector'` under a section): the screens link to each other from it. */
export const VECTOR_STUDIO_BASE = new InjectionToken<string>('VECTOR_STUDIO_BASE', { providedIn: 'root', factory: () => '' });
