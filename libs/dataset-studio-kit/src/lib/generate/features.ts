import type { AnimationPort } from '@lab/animation-core';
import { type Observable, catchError, map, of } from 'rxjs';

/** What the server lists, beyond the base: the catalog's `features` (where `plan` and `svg` already are). */
export const FEATURE_PLAN = 'plan';
/** The one-sentence dataset writer (`POST /api/assist/dataset`, requested). */
export const FEATURE_DATASET = 'dataset';
/** `examples` accepted on the assistant calls (requested). */
export const FEATURE_EXAMPLES = 'examples';

/** The features the server lists, read from the catalog; none when it does not answer (a server without the catalog has none of them). */
export function readFeatures(animation: Pick<AnimationPort, 'catalog'>): Observable<readonly string[]> {
  return animation.catalog().pipe(
    map((c) => c.features),
    catchError(() => of([] as readonly string[])),
  );
}
