import type { Observable } from 'rxjs';

import type { EditRequest, EditResult, ImageModel } from './model';

/**
 * Everything the studio needs from whoever retouches an image, and nothing about how it is done. An adapter implements
 * this: the in-memory one lives in this dashboard; a real one will talk to the server once it has an operation for it.
 *
 * `edit` does its work when subscribed to and emits once, with as many results as variants were asked for. A refused
 * request errors with `EditRefused` and produces nothing.
 */
export interface ImageEditPort {
  /** The models, in a stable order, unavailable ones included (marked); the default is the first available one. Their identifiers are all different. */
  models(): Observable<readonly ImageModel[]>;
  edit(request: EditRequest): Observable<readonly EditResult[]>;
}
