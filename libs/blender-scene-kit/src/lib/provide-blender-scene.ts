import { type EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';

import { BLENDER_SCENE_OPTIONS, type BlenderSceneOptions } from './core/options';

/** Provide it once with the dashboard's language. The port the block talks to (`BLENDER_SCENE_PORT`) is the host's: a project's scene and a single request keep their descriptions in different places. */
export function provideBlenderScene(options: BlenderSceneOptions): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: BLENDER_SCENE_OPTIONS, useValue: options }]);
}
