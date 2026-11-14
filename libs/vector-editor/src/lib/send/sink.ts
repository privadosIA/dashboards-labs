import type { Observable } from 'rxjs';

import type { PartFiles } from '../runtime/to-part';

export type SinkDraftState = 'writing' | 'ready' | 'failed';

/** What the dialog needs to know of a draft the catalog is writing. */
export interface SinkDraft {
  id: string;
  state: SinkDraftState;
  /** What the server found wrong, when it failed. */
  problems: readonly string[];
  /** Why it failed, when it did and there is no list of problems. */
  error?: string;
  /** The pictures the server drew the part at, as addresses ready to open. */
  previews: readonly string[];
}

/**
 * What the send dialog asks of the catalog. The library knows nothing of the port behind it: a host maps these onto its own (`AnimationPort`, a fake).
 * An Observable that fails does so with an `Error` whose message is the reason, in the server's words.
 */
export interface VectorPartSink {
  /** Whether no part of the catalog has the name. */
  isNameFree(name: string): Observable<boolean>;
  /** Makes a draft from the two files: it comes back `writing`, `ready` or `failed`. */
  createDraft(files: PartFiles): Observable<SinkDraft>;
  /** Each change of a draft until it is not `writing` any more. */
  followDraft(id: string): Observable<SinkDraft>;
  /** Puts the part of a ready draft in the catalog. */
  approve(id: string): Observable<void>;
  /** Replaces the texts of a part that is in the catalog. */
  replace(name: string, files: PartFiles): Observable<void>;
}
