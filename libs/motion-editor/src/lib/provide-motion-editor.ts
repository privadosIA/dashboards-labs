import { InjectionToken, makeEnvironmentProviders, type EnvironmentProviders } from '@angular/core';

import type { MotionEditorLang } from './texts';

/** The language the editor's components speak. */
export const MOTION_EDITOR_LANG = new InjectionToken<MotionEditorLang>('MOTION_EDITOR_LANG');

export interface MotionEditorOptions {
  readonly lang: MotionEditorLang;
}

/** What a dashboard that mounts the editor's components provides once. */
export function provideMotionEditor(options: MotionEditorOptions): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: MOTION_EDITOR_LANG, useValue: options.lang }]);
}
