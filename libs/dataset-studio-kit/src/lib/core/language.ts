import { Injectable, inject } from '@angular/core';
import type { Lang } from '@lab/forms-kit';

import { DATASET_STUDIO_OPTIONS } from './options';

/** The language of the studio, which is the host's: it chooses, saves and reloads, and gives the choice to `provideDatasetStudio`. The library only reads it. */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  readonly lang: Lang = inject(DATASET_STUDIO_OPTIONS, { optional: true })?.lang ?? 'en';
}
