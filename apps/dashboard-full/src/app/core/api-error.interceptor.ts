import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { ERROR_EXPLAINED_BY_SCREEN } from '@lab/api-client';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, throwError } from 'rxjs';
import { ConnectionDialogService } from '@lab/server-connection';
import { ApiErrorBody } from './api.models';
import { ConnectionService } from '@lab/server-connection';

/**
 * A request that explains its own failures inline (next to the field it was
 * asked from) sets this to true so no generic snackbar is opened for it. The
 * error still propagates, and a 401 still opens the connection settings.
 */
export const SKIP_ERROR_TOAST = new HttpContextToken<boolean>(() => false);

/**
 * Surfaces API failures as snackbar messages that say what failed and a
 * concrete next step (spec: web-shell, "Errors tell the user what
 * happened and how to fix it"). The error still propagates so callers
 * can attach field-level handling (e.g. the editor's save flow).
 */
/**
 * Whatever goes through `@lab/api-client` (the Animation, Video and Music sections) says what failed beside the piece, the
 * form or the song it is about, with the server's own reason, and `ApiClient` marks its requests so that no second notice opens.
 * The prefixes below are the same screens' own routes, kept for the calls that do not go through the client.
 *
 * The screens of the Animation section (`@lab/music-motion`), of the Video section (`@lab/video-studio-kit`), of the Vector section
 * (`@lab/vector-studio-kit`, which sends and lists parts through the same `/api/music-motion/` routes) and of the Motion Edit section (`@lab/motion-edit-kit`, which reads and saves pieces through them too) say what
 * failed beside the piece or the form they are about, with the server's own reason, so a failure of their routes does not
 * also open a snackbar.
 */
const EXPLAINED_BY_THE_SCREEN = ['/api/music-motion/', '/api/generation', '/api/video-edits', '/api/motions', '/api/image-edits'];

export const apiErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const snack = inject(MatSnackBar);
  const conn = inject(ConnectionService);
  const settings = inject(ConnectionDialogService);
  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse) {
        if (!req.context.get(SKIP_ERROR_TOAST) && !req.context.get(ERROR_EXPLAINED_BY_SCREEN) && !EXPLAINED_BY_THE_SCREEN.some((route) => req.url.includes(route))) {
          snack.open(describeError(err, conn.remote() ? conn.server() : undefined), $localize`:@@error.dismiss:Close`, {
            duration: 8000,
          });
        }
        // A wrong/missing token is fixed in one step: open the settings.
        if (err.status === 401) settings.open();
      }
      return throwError(() => err);
    }),
  );
};

export function describeError(err: HttpErrorResponse, remoteServer?: string): string {
  if (err.status === 401) {
    return $localize`:@@error.unauthorized:The server rejected the request: the token is missing or incorrect. Enter the correct token in the connection settings.`;
  }
  if (err.status === 0 && remoteServer) {
    return $localize`:@@error.unreachableRemote:Cannot connect to ${remoteServer}:server:. Check the address, that the server is running with a reachable --addr, and that this page's origin is listed in its --cors-origin.`;
  }
  if (err.status === 0) {
    return $localize`:@@error.unreachable:Cannot connect to the server. Start “orchestrator serve” and try again.`;
  }
  const body = err.error as ApiErrorBody | undefined;
  const detail = body?.error?.message ?? err.message;
  switch (body?.error?.code) {
    case 'validation_failed':
      return $localize`:@@error.validation:Validation rejected: ${detail}:detail:. Fix the indicated field and save again.`;
    case 'conflict':
      return $localize`:@@error.conflict:Conflict: ${detail}:detail:. Resolve it (e.g. cancel the run or pick another name) and repeat the action.`;
    case 'not_found':
      return $localize`:@@error.notFound:Not found: ${detail}:detail:. Refresh the list in case it changed from another session.`;
    default:
      return $localize`:@@error.generic:The request failed: ${detail}:detail:. Try again; if it persists, check the server console.`;
  }
}
