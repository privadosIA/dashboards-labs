import type { Observable } from 'rxjs';

import type { Motion, MotionRequest } from './model';

/**
 * Everything the studio needs from the library of motions, and nothing about how it is kept. `add` and `remove` do
 * their work when subscribed to and emit once; a refused video errors with `MotionRefused` and adds nothing.
 */
export interface MotionLibraryPort {
  /** The motions, newest first; emits again whenever one is added, changes (a processing one gets ready) or goes away. A library that cannot be read errors with `MotionsUnreadable`. */
  list(): Observable<readonly Motion[]>;
  /** Adds a motion made from a video; emits it as it was added (processing). */
  add(request: MotionRequest): Observable<Motion>;
  /** Removes a motion from the library. */
  remove(id: string): Observable<void>;
}
