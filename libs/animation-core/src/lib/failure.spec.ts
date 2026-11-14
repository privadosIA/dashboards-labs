import { ApiError } from '@lab/api-client';

import { AnimationFailure, failureOf } from './failure';

const error = (status: number, message = 'the reason') => new ApiError(status, 'unknown', message);

describe('failureOf', () => {
  it('sorts the server\'s statuses by what the screen does, keeping its words', () => {
    const cases: [number, string][] = [[422, 'refused'], [400, 'refused'], [409, 'busy'], [503, 'unavailable'], [404, 'missing'], [500, 'other']];
    for (const [status, kind] of cases) {
      const failure = failureOf(error(status, `reason ${status}`)) as AnimationFailure;
      expect(failure).toBeInstanceOf(AnimationFailure);
      expect(failure.kind).toBe(kind);
      expect(failure.reason).toBe(`reason ${status}`);
    }
  });

  it('lets a 401 through, because the connection box deals with it', () => {
    const e = error(401);
    expect(failureOf(e)).toBe(e);
  });

  it('keeps a failure it already is and makes one of anything else', () => {
    const own = new AnimationFailure('busy', 'wait');
    expect(failureOf(own)).toBe(own);
    expect(failureOf(new Error('offline'))).toMatchObject({ kind: 'other', reason: 'offline' });
    expect(failureOf('boom')).toMatchObject({ kind: 'other', reason: 'boom' });
  });
});
