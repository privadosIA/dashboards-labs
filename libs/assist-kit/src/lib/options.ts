import { InjectionToken } from '@angular/core';
import type { Lang } from '@lab/forms-kit';

export interface AssistKitOptions {
  /** The language of every text of the picker (the dashboard's own). */
  lang: Lang;
}

export const ASSIST_OPTIONS = new InjectionToken<AssistKitOptions>('ASSIST_OPTIONS');
