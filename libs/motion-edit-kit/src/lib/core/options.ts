import { InjectionToken } from '@angular/core';
import type { Lang } from '@lab/forms-kit';

export interface MotionEditOptions {
  /** The language of every text of the editor (the dashboard's own). */
  lang: Lang;
  /** The name the dashboard gives itself to the server on what it sends (`^[a-z0-9-]{1,32}$`); `motion-edit` when none. The host gives the same one to `provideMusicMotion`. */
  client?: string;
  /** The in-memory adapters (the host gives the same flag to `provideMusicMotion`): the editor works with no server at all. */
  memory?: boolean;
}

export const MOTION_EDIT_OPTIONS = new InjectionToken<MotionEditOptions>('MOTION_EDIT_OPTIONS');

/** Where the host mounted the routes (`''` at its root, `'/motion-edit'` under a section): the list and the editor link to each other from it. */
export const MOTION_EDIT_BASE = new InjectionToken<string>('MOTION_EDIT_BASE', { providedIn: 'root', factory: () => '' });
