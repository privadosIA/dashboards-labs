import { Injectable, inject } from '@angular/core';
import type { Lang } from '@lab/forms-kit';

import { MUSIC_STUDIO_OPTIONS } from './options';

export type { Lang };

/** The language the host gave `provideMusicStudio`. Choosing it is the host's business: the library only reads it. */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  readonly lang: Lang = inject(MUSIC_STUDIO_OPTIONS, { optional: true })?.lang ?? 'en';
}
