import { InjectionToken } from '@angular/core';
import type { Lang } from '@lab/forms-kit';

export interface DatasetStudioOptions {
  /** The language of every text of the studio (the dashboard's own). */
  lang: Lang;
  /** The name the dashboard gives itself to the server on what it sends (`^[a-z0-9-]{1,32}$`); `dataset-studio` when none. The host gives the same one to `provideMusicMotion`. */
  client?: string;
  /** The in-memory adapters (the host gives the same flag to `provideMusicMotion` and `provideDatasetImport`): the studio works with no server at all. */
  memory?: boolean;
  /** How long the preview waits for the person to stop typing before it asks the server again (500 ms by default). */
  debounceMs?: number;
}

export const DATASET_STUDIO_OPTIONS = new InjectionToken<DatasetStudioOptions>('DATASET_STUDIO_OPTIONS');

/** Where the host mounted the routes (`''` at its root, `'/dataset'` under a section): the screens link to each other from it. */
export const DATASET_STUDIO_BASE = new InjectionToken<string>('DATASET_STUDIO_BASE', { providedIn: 'root', factory: () => '' });
