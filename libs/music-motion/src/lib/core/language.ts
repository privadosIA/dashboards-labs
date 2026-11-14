import { Injectable, inject } from '@angular/core';
import type { Lang } from '@lab/forms-kit';

import { MUSIC_MOTION_OPTIONS } from './options';

/** The language the host gave `provideMusicMotion`. Choosing it is the host's business: the library only reads it. */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  readonly lang: Lang = inject(MUSIC_MOTION_OPTIONS, { optional: true })?.lang ?? 'en';
}
