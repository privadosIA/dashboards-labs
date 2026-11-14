import { InjectionToken, makeEnvironmentProviders, type EnvironmentProviders } from '@angular/core';

import type { VectorLang } from './texts';

/** The language the editor's components speak. */
export const VECTOR_EDITOR_LANG = new InjectionToken<VectorLang>('VECTOR_EDITOR_LANG');

export interface VectorEditorOptions {
  readonly lang: VectorLang;
}

/** What a dashboard that mounts the editor's components provides once. */
export function provideVectorEditor(options: VectorEditorOptions): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: VECTOR_EDITOR_LANG, useValue: options.lang }]);
}
