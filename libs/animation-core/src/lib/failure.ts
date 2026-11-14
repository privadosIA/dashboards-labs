import { ApiError } from '@lab/api-client';

/**
 * Why a call to the server did not work, by what the screen does about it:
 * - `refused`: the server looked at the request and said no, with the reason (422, 400);
 * - `busy`: the piece is being drawn (409);
 * - `unavailable`: the server cannot draw now, for instance with no browser (503);
 * - `missing`: the piece or song is gone (404);
 * - `other`: anything else, or the server did not answer.
 */
export type FailureKind = 'refused' | 'busy' | 'unavailable' | 'missing' | 'other';

export class AnimationFailure extends Error {
  constructor(
    readonly kind: FailureKind,
    /** The server's own words, as it wrote them. */
    readonly reason: string,
  ) {
    super(reason);
    this.name = 'AnimationFailure';
  }
}

const KINDS: Record<number, FailureKind> = { 400: 'refused', 404: 'missing', 409: 'busy', 422: 'refused', 503: 'unavailable' };

/** The failure an error is. A 401 is not turned into one: the connection box deals with it, so it passes through. */
export function failureOf(e: unknown): unknown {
  if (e instanceof AnimationFailure) return e;
  if (e instanceof ApiError) return e.status === 401 ? e : new AnimationFailure(KINDS[e.status] ?? 'other', e.message);
  return new AnimationFailure('other', e instanceof Error ? e.message : String(e));
}
