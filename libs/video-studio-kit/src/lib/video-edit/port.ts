import type { Observable } from 'rxjs';

import type { EditToolInfo, VideoEdit, VideoEditRequest } from './model';

/**
 * Everything the studio needs from whoever edits a video, and nothing about how it is done. An adapter implements this:
 * the in-memory one lives in this dashboard; the server one talks to `/api/video-edits`.
 *
 * `tools`, `create` and `remove` do their work when subscribed to and emit once. A refused request errors with
 * `VideoEditRefused` and creates nothing; `tools` errors with `ToolsUnreadable` when the list cannot be read.
 */
export interface VideoEditPort {
  /** The tools in a stable order, unavailable ones included (marked). */
  tools(): Observable<readonly EditToolInfo[]>;
  /** The edits, newest first; emits again whenever one is added, changes or goes away. */
  list(): Observable<readonly VideoEdit[]>;
  /** Asks for an edit; emits it as it was created (queued). */
  create(request: VideoEditRequest): Observable<VideoEdit>;
  /** Removes `id`, cancelling it first when it runs. */
  remove(id: string): Observable<void>;
  /**
   * Each change of one edit, starting with its current state, until it is done, failed or cancelled (the last emission
   * is one of those). Unsubscribing stops it; removing the edit ends it without a further emission.
   */
  follow(id: string): Observable<VideoEdit>;
}
