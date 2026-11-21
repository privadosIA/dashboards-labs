import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';

import { ConnectionDialogService } from './connection-dialog.service';
import { ConnectionService } from './connection.service';

/**
 * Opens the connection box when a call to the configured server answers 401, so the token can be corrected. A dashboard
 * adds it with `provideHttpClient(withInterceptors([unauthorizedInterceptor]))`.
 */
export const unauthorizedInterceptor: HttpInterceptorFn = (req, next) => {
  const dialog = inject(ConnectionDialogService);
  const api = `${inject(ConnectionService).server()}/api`;
  const ours = req.url === api || req.url.startsWith(`${api}/`);
  return next(req).pipe(
    tap({
      error: (e: unknown) => {
        if (ours && e instanceof HttpErrorResponse && e.status === 401) dialog.unauthorized();
      },
    }),
  );
};
