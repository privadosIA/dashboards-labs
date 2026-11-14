import { BehaviorSubject, Observable, Subscription, defer, of, throwError, timer } from 'rxjs';

import { type Motion, type MotionRequest } from './model';
import type { MotionLibraryPort } from './port';
import { MotionRefused, validateMotion } from './validate';

const fileTitle = (name: string): string => name.replace(/\.[^.]+$/, '');

export interface InMemoryMotionOptions {
  /** Milliseconds a motion stays `processing`. 0 makes it ready on the next tick. */
  pace?: number;
  /** The address of the preview a motion gets; by default the object address of the video that was sent. */
  previewUrl?: (request: MotionRequest) => string;
}

/**
 * A library of motions that keeps them in memory: a motion is `processing` for a moment and then `ready`; a title with
 * `[fail]` ends `failed`. It starts empty, like the server's, and keeps nothing once the page closes.
 */
export class InMemoryMotionLibrary implements MotionLibraryPort {
  private readonly pace: number;
  private readonly previewUrl: (request: MotionRequest) => string;
  private readonly motions = new BehaviorSubject<readonly Motion[]>([]);
  private readonly timers = new Map<string, Subscription>();
  private counter = 0;

  constructor({ pace = 600, previewUrl = (r) => (r.video && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(r.video.blob) : r.source?.trim() ?? '') }: InMemoryMotionOptions = {}) {
    this.pace = pace;
    this.previewUrl = previewUrl;
  }

  list(): Observable<readonly Motion[]> {
    return this.motions.asObservable();
  }

  add(request: MotionRequest): Observable<Motion> {
    return defer(() => {
      const problems = validateMotion(request);
      if (problems.length) return throwError(() => new MotionRefused(problems));
      const title = request.title?.trim() || fileTitle(request.video?.name ?? request.source?.trim().split('?')[0].split('/').filter(Boolean).pop() ?? 'motion');
      const motion: Motion = { id: `mem-motion-${++this.counter}`, title, tags: [...(request.tags ?? [])], duration: 6, people: 1, state: 'processing', preview: this.previewUrl(request) };
      this.motions.next([motion, ...this.motions.value]);
      this.timers.set(
        motion.id,
        timer(this.pace).subscribe(() => {
          this.timers.delete(motion.id);
          const settled: Motion = title.includes('[fail]') ? { ...motion, state: 'failed', error: 'Simulated failure: nobody appears in the video' } : { ...motion, state: 'ready' };
          this.motions.next(this.motions.value.map((m) => (m.id === motion.id ? settled : m)));
        }),
      );
      return of(motion);
    });
  }

  remove(id: string): Observable<void> {
    return defer(() => {
      this.timers.get(id)?.unsubscribe();
      this.timers.delete(id);
      this.motions.next(this.motions.value.filter((m) => m.id !== id));
      return of(undefined);
    });
  }
}
