import { Injectable, inject } from '@angular/core';
import type { Lang } from '@lab/forms-kit';

import { ASSIST_OPTIONS } from './options';

/** The language of the picker, which is the host's: it chooses, saves and reloads, and gives the choice to `provideAssistKit`. The library only reads it. */
@Injectable({ providedIn: 'root' })
export class AssistLanguage {
  readonly lang: Lang = inject(ASSIST_OPTIONS, { optional: true })?.lang ?? 'en';
}
