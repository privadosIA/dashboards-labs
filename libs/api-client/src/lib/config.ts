import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';

export interface ApiClientConfig {
  /** Where the server is, without a trailing slash (`http://127.0.0.1:4666`). Empty means the same origin. */
  baseUrl?: string;
  /** The server's bearer token, or a function that gives it on each call. Without one, no authorization header is sent. */
  token?: string | (() => string | null | undefined);
}

export const API_CLIENT_CONFIG = new InjectionToken<ApiClientConfig>('API_CLIENT_CONFIG', {
  providedIn: 'root',
  factory: () => ({}),
});

/** Configures the client. The application provides `HttpClient` itself (`provideHttpClient()`). */
export function provideApiClient(config: ApiClientConfig = {}): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: API_CLIENT_CONFIG, useValue: config }]);
}
