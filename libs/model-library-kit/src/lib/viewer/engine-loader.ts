import { InjectionToken } from '@angular/core';

/** What the viewer needs of the engine module: loaded when a model is first opened, so that a host that never opens one does not carry three.js. */
export type EngineModule = Pick<typeof import('./viewer-engine'), 'ViewerEngine' | 'webglAvailable'>;

/** How the engine is loaded: the default is a dynamic `import()`, and a spec gives one that answers an engine that draws nothing. */
export const VIEWER_ENGINE = new InjectionToken<() => Promise<EngineModule>>('VIEWER_ENGINE', {
  providedIn: 'root',
  factory: () => () => import('./viewer-engine'),
});
