import { InjectionToken } from '@angular/core';
import type { Lang } from '@lab/forms-kit';

export interface BlenderSceneOptions {
  /** The language of every text of the block (the dashboard's own). */
  lang: Lang;
}

export const BLENDER_SCENE_OPTIONS = new InjectionToken<BlenderSceneOptions>('BLENDER_SCENE_OPTIONS');
