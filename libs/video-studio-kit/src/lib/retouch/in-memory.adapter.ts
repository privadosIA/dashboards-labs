import { Observable, defer, map, of, throwError, timer } from 'rxjs';

import type { EditRequest, EditResult, ImageModel } from './model';
import type { ImageEditPort } from './port';
import { EditRefused, validateEdit } from './validate';

export interface InMemoryEditOptions {
  /** Milliseconds the adapter waits before answering. 0 answers on the next tick. */
  pace?: number;
}

/** Models of demonstration: the adapter edits nothing, so these only give the choice something to choose from. */
export const DEMO_IMAGE_MODELS: readonly ImageModel[] = [
  { id: 'balanced', name: 'Balanced', description: 'Demonstration model: a middle ground between fidelity and change.', available: true, strength: true, negativePrompt: true, maxVariants: 4 },
  { id: 'detailed', name: 'Detailed', description: 'Demonstration model: keeps fine detail, slower.', available: true, strength: true, negativePrompt: true, maxVariants: 8 },
  { id: 'creative', name: 'Creative', description: 'Demonstration model: changes the picture by the prompt alone, one result.', available: true, strength: false, negativePrompt: false, maxVariants: 1 },
  { id: 'restore', name: 'Restore', description: 'Demonstration model: restores old pictures, which this demonstration cannot run.', available: false, reason: 'Demonstration only: it needs a server', strength: true, negativePrompt: false, maxVariants: 2 },
];

/**
 * An image edit port that edits nothing: it lists demonstration models, waits, then gives the original image once per variant, each with its own
 * seed, and sends nothing anywhere. It exists to build and try the studio without a server, not to stand in for one.
 */
export class InMemoryImageEdit implements ImageEditPort {
  private readonly pace: number;
  private seeds = 0;

  constructor({ pace = 800 }: InMemoryEditOptions = {}) {
    this.pace = pace;
  }

  models(): Observable<readonly ImageModel[]> {
    return of(DEMO_IMAGE_MODELS);
  }

  edit(request: EditRequest): Observable<readonly EditResult[]> {
    return defer(() => {
      const problems = validateEdit(request, DEMO_IMAGE_MODELS);
      if (problems.length) return throwError(() => new EditRefused(problems, DEMO_IMAGE_MODELS.find((m) => m.id === request.model)?.maxVariants));
      return timer(this.pace).pipe(map(() => Array.from({ length: request.variants }, () => ({ seed: ++this.seeds, image: request.image }))));
    });
  }
}
