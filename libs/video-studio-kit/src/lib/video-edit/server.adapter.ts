import { ApiError, type ApiClient } from '@lab/api-client';
import { BehaviorSubject, EMPTY, Observable, Subscription, catchError, defer, distinctUntilChanged, map, of, switchMap, takeWhile, tap, throwError, timer } from 'rxjs';

import { isEditFinished, type EditToolInfo, type VideoEdit, type VideoEditRequest } from './model';
import type { VideoEditPort } from './port';
import { toEdit, toServerRequest, toTool, type ServerEdit } from './server-mapping';
import { ToolsUnreadable, VideoEditRefused, validateEdit } from './validate';

/** What the adapter uses of the API client: the typed calls it makes and the address of a file. */
export type VideoEditApi = Pick<ApiClient, 'get' | 'postForm' | 'delete' | 'urlOf'>;

export interface ServerVideoEditOptions {
  /** Milliseconds between two reads of the server while an edit is unfinished. */
  pollMs?: number;
  /** The name the host gives itself to the server (`client` in the API); the studio's own when left out. */
  client?: string;
}

/** The request as a form: the JSON in a `request` part, the video, and the image when the tool takes one. */
export function editForm(request: VideoEditRequest, client?: string): FormData {
  const form = new FormData();
  form.set('request', JSON.stringify(toServerRequest(request, client)));
  if (request.video) form.set('video', request.video.blob, request.video.name);
  if (request.image) form.set('image', request.image.blob, request.image.name);
  return form;
}

/**
 * A video edit port that edits through the server (`/api/video-edits`). The server owns the state, so the adapter keeps
 * only a copy of the list that it refreshes while anything is unfinished.
 */
export class ServerVideoEdit implements VideoEditPort {
  private readonly pollMs: number;
  private readonly client?: string;
  private loaded?: readonly EditToolInfo[];
  private readonly edits = new BehaviorSubject<readonly VideoEdit[]>([]);
  private started = false;
  private poller?: Subscription;

  constructor(
    private readonly api: VideoEditApi,
    { pollMs = 1500, client }: ServerVideoEditOptions = {},
  ) {
    this.pollMs = pollMs;
    this.client = client;
  }

  /** Read once it works; a failure is not remembered, so a retry asks again. */
  tools(): Observable<readonly EditToolInfo[]> {
    return defer(() => (this.loaded ? of(this.loaded) : this.api.get('/api/video-edits/options').pipe(map((o) => o.tools.map(toTool)), tap((tools) => (this.loaded = tools))))).pipe(
      catchError((e) => throwError(() => new ToolsUnreadable(e instanceof Error ? e.message : String(e)))),
    );
  }

  list(): Observable<readonly VideoEdit[]> {
    return defer(() => {
      if (!this.started) {
        this.started = true;
        this.refresh().subscribe({ error: () => undefined });
      }
      return this.edits.asObservable();
    });
  }

  create(request: VideoEditRequest): Observable<VideoEdit> {
    return this.tools().pipe(
      switchMap((tools) => {
        const problems = validateEdit(request, tools);
        if (problems.length) return throwError(() => new VideoEditRefused(problems));
        return this.api.postForm('/api/video-edits', editForm(request, this.client)).pipe(
          catchError((e) => throwError(() => (e instanceof ApiError && (e.status === 422 || e.status === 503) ? new VideoEditRefused([{ code: 'server', message: e.message }]) : e))),
        );
      }),
      map((made) => {
        const created = toEdit(made, (a) => this.api.urlOf(a));
        this.edits.next([created, ...this.edits.value.filter((e) => e.id !== created.id)]);
        this.schedule();
        return created;
      }),
    );
  }

  remove(id: string): Observable<void> {
    return defer(() => this.api.delete('/api/video-edits/{id}', { path: { id } })).pipe(
      map(() => {
        this.edits.next(this.edits.value.filter((e) => e.id !== id));
      }),
    );
  }

  follow(id: string): Observable<VideoEdit> {
    return defer(() =>
      timer(0, this.pollMs).pipe(
        switchMap(() => this.api.get('/api/video-edits/{id}', { path: { id } }).pipe(catchError((e) => (e instanceof ApiError && e.status === 404 ? of(null) : throwError(() => e))))),
        takeWhile((e): e is ServerEdit => e !== null),
        map((e) => toEdit(e, (a) => this.api.urlOf(a))),
        distinctUntilChanged((a, b) => a.state === b.state && a.progress === b.progress),
        tap((e) => this.edits.next(this.edits.value.map((x) => (x.id === e.id ? e : x)))),
        takeWhile((e) => !isEditFinished(e), true),
      ),
    );
  }

  private refresh(): Observable<void> {
    return defer(() => this.api.get('/api/video-edits')).pipe(
      map((list) => {
        this.edits.next(list.map((e) => toEdit(e, (a) => this.api.urlOf(a))));
        this.schedule();
      }),
    );
  }

  /** While anything is unfinished the list is read again every `pollMs`; when nothing is, it is left alone. */
  private schedule(): void {
    const pending = this.edits.value.some((e) => !isEditFinished(e));
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
