import { EnvironmentProviders, inject, makeEnvironmentProviders } from '@angular/core';
import { ApiClient } from '@lab/api-client';

import { MUSIC_STUDIO_OPTIONS, type MusicStudioOptions } from './core/options';
import { InMemorySongs } from './song/in-memory.adapter';
import { ServerSongs } from './song/server.adapter';
import { SONGS } from './song/tokens';

/**
 * Provide it once, with the dashboard's language and the name it gives itself to the server. The studio then makes its songs
 * through the server the person connected to (through `ApiClient`), or with an adapter that keeps its history in the session
 * storage when `memory` is set.
 */
export function provideMusicStudio(options: MusicStudioOptions): EnvironmentProviders {
  const { client, memory } = options;
  return makeEnvironmentProviders([
    { provide: MUSIC_STUDIO_OPTIONS, useValue: options },
    { provide: SONGS, useFactory: () => (memory ? new InMemorySongs({ storage: sessionStorage }) : new ServerSongs(inject(ApiClient), { client })) },
  ]);
}
