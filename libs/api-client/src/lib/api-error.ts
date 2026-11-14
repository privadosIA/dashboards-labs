import type { components } from './generated/schema';

type ErrorBody = components['schemas']['Error'];
/** The codes the contract lists, or `unknown` when the answer was not the contract's error body (no server, a proxy). */
export type ApiErrorCode = NonNullable<NonNullable<ErrorBody['error']>['code']> | 'unknown';

/** What a failed call throws: the contract's error (`code`, `message`, `reason?`) and the HTTP status (0: no answer). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly reason?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Builds the error from the body of a failed answer, whatever it holds. */
  static from(status: number, body: unknown, fallbackMessage: string): ApiError {
    const e = (body as ErrorBody | null | undefined)?.error;
    if (e && typeof e.message === 'string') {
      return new ApiError(status, (e.code ?? 'unknown') as ApiErrorCode, e.message, e.reason);
    }
    return new ApiError(status, 'unknown', fallbackMessage);
  }
}
