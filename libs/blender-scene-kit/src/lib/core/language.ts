import { Injectable, inject } from '@angular/core';
import type { Lang } from '@lab/forms-kit';

import { BLENDER_SCENE_OPTIONS } from './options';

/** The language of the block, which is the host's: it chooses, saves and reloads, and gives the choice to `provideBlenderScene`. The library only reads it. */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  readonly lang: Lang = inject(BLENDER_SCENE_OPTIONS, { optional: true })?.lang ?? 'en';
}
