import { Injectable, inject } from '@angular/core';
import type { Lang } from '@lab/forms-kit';

import { MOTION_EDIT_OPTIONS } from './options';

/**
 * The language of the editor, which is the host's: it chooses, saves and reloads, and gives the choice to `provideMotionEdit`. The library
 * only reads it, so it is a field as the shell's own service has it.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  readonly lang: Lang = inject(MOTION_EDIT_OPTIONS, { optional: true })?.lang ?? 'en';
}
