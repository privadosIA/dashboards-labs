import { Injectable, inject } from '@angular/core';
import type { Lang } from '@lab/forms-kit';

import { MODEL_LIBRARY_OPTIONS } from './options';

/** The language of the library, which is the host's: it chooses, saves and reloads, and gives the choice to `provideModelLibrary`. The library only reads it. */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  readonly lang: Lang = inject(MODEL_LIBRARY_OPTIONS, { optional: true })?.lang ?? 'en';
}
