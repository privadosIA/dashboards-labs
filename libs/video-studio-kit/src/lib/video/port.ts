import type { Observable } from 'rxjs';

import type { Estimate, Generation, GenerationSettings, VideoModel } from './model';

/**
 * Everything the studio needs from whoever makes the videos, and nothing about how it is done. An adapter implements
 * this: the in-memory one lives in this dashboard; a real one will talk to the server once it has an operation for it.
 *
 * `create`, `repeat` and `remove` do their work when subscribed to and emit once. A refused request errors with
 * `GenerationRefused` and creates nothing.
 */
export interface VideoGenerationPort {
  /** The models, in a stable order, unavailable ones included (marked); the default is the first available one. Their identifiers are all different. */
  models(): Observable<readonly VideoModel[]>;
  /** What the settings would cost; changes nothing. */
  estimate(settings: GenerationSettings): Estimate;
  /** The generations, newest first; emits again whenever one is added, changes or goes away. */
  list(): Observable<readonly Generation[]>;
  /** Asks for a generation; emits it as it was created (queued). */
  create(settings: GenerationSettings): Observable<Generation>;
  /** A new generation with the settings of `id`; the original is left alone. */
  repeat(id: string): Observable<Generation>;
  /** Removes `id`, cancelling it first when it is running. */
  remove(id: string): Observable<void>;
  /**
   * Each change of one generation, starting with its current state, until it finishes (the last emission is `done` or
   * `failed`). Unsubscribing stops it; removing the generation ends it without a further emission.
   */
  follow(id: string): Observable<Generation>;
}
