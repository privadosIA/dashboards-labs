import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';

import type { MotionPartsLang } from './texts';

export interface MotionPartsOptions {
  /** The language of the form's texts (the dashboard's own). */
  lang: MotionPartsLang;
}

export const MOTION_PARTS_LANG = new InjectionToken<MotionPartsLang>('MOTION_PARTS_LANG');

/** Provide it once, with the dashboard's language. Without it the form speaks English. */
export function provideMotionParts(options: MotionPartsOptions): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: MOTION_PARTS_LANG, useValue: options.lang }]);
}
