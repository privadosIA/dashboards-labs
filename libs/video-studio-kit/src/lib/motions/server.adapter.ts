import { ApiError, type ApiClient, type components } from '@lab/api-client';
import { BehaviorSubject, EMPTY, Observable, Subscription, catchError, defer, map, switchMap, tap, throwError, timer } from 'rxjs';

import { isMotionSettled, type Motion, type MotionRequest } from './model';
import type { MotionLibraryPort } from './port';
import { MotionRefused, MotionsUnreadable, validateMotion } from './validate';

type ServerMotion = components['schemas']['Motion'];

/** What the adapter uses of the API client. */
export type MotionApi = Pick<ApiClient, 'get' | 'postForm' | 'delete' | 'urlOf'>;

export interface ServerMotionOptions {
  /** Milliseconds between two reads of the server while a motion is processing. */
  pollMs?: number;
}

const toMotion = (m: ServerMotion, urlOf: (address: string) => string): Motion => ({
  id: m.id,
  title: m.title,
  tags: m.tags,
  duration: m.duration,
  people: m.people,
  state: m.state,
  preview: urlOf(m.preview),
  ...(m.error ? { error: m.error } : {}),
});

/** The request as a form: the JSON in a `request` part (with `source` when there is an address) and the video as the `video` file, if any. */
export function motionForm(request: MotionRequest): FormData {
  const form = new FormData();
  const source = request.source?.trim();
  form.set(
    'request',
    JSON.stringify({ ...(request.title ? { title: request.title } : {}), ...(request.tags?.length ? { tags: request.tags } : {}), ...(source ? { source } : {}) }),
  );
  if (request.video && !source) form.set('video', request.video.blob, request.video.name);
  return form;
}

/** A library of motions kept by the server (`/api/motions`): the adapter holds a copy that it refreshes while a motion is processing. */
export class ServerMotionLibrary implements MotionLibraryPort {
  private readonly pollMs: number;
  private readonly motions = new BehaviorSubject<readonly Motion[]>([]);
  private poller?: Subscription;

  constructor(
    private readonly api: MotionApi,
    { pollMs = 1500 }: ServerMotionOptions = {},
  ) {
    this.pollMs = pollMs;
  }

  /** Reads the library every time it is asked for (the list is short and it may have changed), then follows what is processing. */
  list(): Observable<readonly Motion[]> {
    return defer(() => this.refresh()).pipe(switchMap(() => this.motions.asObservable()));
  }

  add(request: MotionRequest): Observable<Motion> {
    return defer(() => {
      const problems = validateMotion(request);
      if (problems.length) return throwError(() => new MotionRefused(problems));
      return this.api.postForm('/api/motions', motionForm(request)).pipe(
        catchError((e) => throwError(() => (e instanceof ApiError && (e.status === 422 || e.status === 503) ? new MotionRefused([e.message]) : e))),
        map((made) => toMotion(made, (a) => this.api.urlOf(a))),
        tap((added) => {
          this.motions.next([added, ...this.motions.value.filter((m) => m.id !== added.id)]);
          this.schedule();
        }),
      );
    });
  }

  remove(id: string): Observable<void> {
    return defer(() => this.api.delete('/api/motions/{id}', { path: { id } })).pipe(
      map(() => {
        this.motions.next(this.motions.value.filter((m) => m.id !== id));
      }),
    );
  }

  private refresh(): Observable<void> {
    return defer(() => this.api.get('/api/motions')).pipe(
      catchError((e) => throwError(() => new MotionsUnreadable(e instanceof Error ? e.message : String(e)))),
      map((list) => {
        this.motions.next(list.map((m) => toMotion(m, (a) => this.api.urlOf(a))));
        this.schedule();
      }),
    );
  }

  private schedule(): void {
    const pending = this.motions.value.some((m) => !isMotionSettled(m));
    if (pending && !this.poller) {
      this.poller = timer(this.pollMs, this.pollMs)
        .pipe(switchMap(() => this.refresh().pipe(catchError(() => EMPTY))))
        .subscribe();
    } else if (!pending && this.poller) {
      this.poller.unsubscribe();
      this.poller = undefined;
    }
  }
}
