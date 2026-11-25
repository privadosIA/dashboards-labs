import { InjectionToken } from '@angular/core';
import type { Lang } from '@lab/forms-kit';

export interface ModelLibraryOptions {
  /** The language of every text of the library (the dashboard's own). */
  lang: Lang;
  /** How often an install is asked for its progress, in milliseconds (1000 by default: the server measured about a second a pack). */
  pollMs?: number;
  /** How many models the catalog shows on a page (12 by default). */
  pageSize?: number;
}

export const MODEL_LIBRARY_OPTIONS = new InjectionToken<ModelLibraryOptions>('MODEL_LIBRARY_OPTIONS');
