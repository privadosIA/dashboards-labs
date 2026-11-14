import { EnvironmentProviders, InjectionToken, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { API_CLIENT_CONFIG } from '@lab/api-client';

import { ConnectionService } from './connection.service';
import type { ConnectionLang } from './texts';

export interface ServerConnectionOptions {
  /** The language of the dialog and the button (the dashboard's own). */
  lang: ConnectionLang;
}

export const SERVER_CONNECTION_LANG = new InjectionToken<ConnectionLang>('SERVER_CONNECTION_LANG');

/**
 * Provide it once instead of `provideApiClient`: the API client then talks to the saved server with the saved token
 * (the page is reloaded when they change, so reading them at start is enough), and nothing else gets the token. When
 * nothing was saved, a `config.json` next to the page gives the server and the token to start with.
 */
export function provideServerConnection(options: ServerConnectionOptions): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: SERVER_CONNECTION_LANG, useValue: options.lang },
    // A deployment's config.json is known before the first call to the API, which is made after the initializers.
    provideAppInitializer(() => inject(ConnectionService).loadDefaults()),
    {
      provide: API_CLIENT_CONFIG,
      useFactory: () => {
        const connection = inject(ConnectionService);
        return { baseUrl: connection.server(), token: () => connection.token() };
      },
    },
  ]);
}
