import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { ConnectionService } from '@lab/server-connection';

/**
 * Adds the Bearer token, but only to requests aimed at the configured API
 * base so the token is never sent to any other host.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const conn = inject(ConnectionService);
  const token = conn.token();
  const base = `${conn.server()}/api`;
  if (token && (req.url === base || req.url.startsWith(`${base}/`))) {
    return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
  }
  return next(req);
};
