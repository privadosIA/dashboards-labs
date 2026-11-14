import { EnvironmentProviders, inject, makeEnvironmentProviders } from '@angular/core';
import { ApiClient } from '@lab/api-client';

import { VIDEO_STUDIO_OPTIONS, type VideoStudioOptions } from './core/options';
import { InMemoryMotionLibrary } from './motions/in-memory.adapter';
import { ServerMotionLibrary } from './motions/server.adapter';
import { MOTION_LIBRARY } from './motions/tokens';
import { InMemoryImageEdit } from './retouch/in-memory.adapter';
import { ServerImageEdit } from './retouch/server.adapter';
import { IMAGE_EDIT } from './retouch/tokens';
import { InMemoryVideoEdit } from './video-edit/in-memory.adapter';
import { ServerVideoEdit } from './video-edit/server.adapter';
import { VIDEO_EDIT } from './video-edit/tokens';
import { InMemoryVideoGeneration } from './video/in-memory.adapter';
import { ServerVideoGeneration } from './video/server.adapter';
import { VIDEO_GENERATION } from './video/tokens';

/**
 * Provide it once, with the dashboard's language and the name it gives itself to the server. The studio then talks to the
 * server the person connected to (through `ApiClient`), or to adapters that keep their history in the session storage when
 * `memory` is set.
 */
export function provideVideoStudio(options: VideoStudioOptions): EnvironmentProviders {
  const { client, memory } = options;
  return makeEnvironmentProviders([
    { provide: VIDEO_STUDIO_OPTIONS, useValue: options },
    { provide: IMAGE_EDIT, useFactory: () => (memory ? new InMemoryImageEdit() : new ServerImageEdit(inject(ApiClient), { client })) },
    { provide: MOTION_LIBRARY, useFactory: () => (memory ? new InMemoryMotionLibrary() : new ServerMotionLibrary(inject(ApiClient))) },
    { provide: VIDEO_EDIT, useFactory: () => (memory ? new InMemoryVideoEdit() : new ServerVideoEdit(inject(ApiClient), { client })) },
    { provide: VIDEO_GENERATION, useFactory: () => (memory ? new InMemoryVideoGeneration({ storage: sessionStorage }) : new ServerVideoGeneration(inject(ApiClient), { client })) },
  ]);
}
