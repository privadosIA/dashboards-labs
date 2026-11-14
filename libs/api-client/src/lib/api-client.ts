import { HttpClient, HttpContext, HttpErrorResponse, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';
import type { HttpMethod } from 'openapi-typescript-helpers';

import { ApiError } from './api-error';
import { API_CLIENT_CONFIG } from './config';
import { ERROR_EXPLAINED_BY_SCREEN } from './context';
import type { Answer, CallArgs, CallOptions, EventStreamPath, Operation, Path } from './types';

interface LooseOptions {
  path?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
}

/**
 * A client typed by the contract: an operation is called by its path and HTTP method, with the path parameters, query
 * and body it declares, and answers the JSON of its success response. A path or method the contract does not have, or a
 * body of another shape, does not compile.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly config = inject(API_CLIENT_CONFIG);

  get<P extends Path<'get'>>(path: P, ...args: CallArgs<Operation<P, 'get'>>): Observable<Answer<Operation<P, 'get'>>> {
    return this.json('get', path, args[0]);
  }
  post<P extends Path<'post'>>(path: P, ...args: CallArgs<Operation<P, 'post'>>): Observable<Answer<Operation<P, 'post'>>> {
    return this.json('post', path, args[0]);
  }
  put<P extends Path<'put'>>(path: P, ...args: CallArgs<Operation<P, 'put'>>): Observable<Answer<Operation<P, 'put'>>> {
    return this.json('put', path, args[0]);
  }
  patch<P extends Path<'patch'>>(path: P, ...args: CallArgs<Operation<P, 'patch'>>): Observable<Answer<Operation<P, 'patch'>>> {
    return this.json('patch', path, args[0]);
  }
  delete<P extends Path<'delete'>>(path: P, ...args: CallArgs<Operation<P, 'delete'>>): Observable<Answer<Operation<P, 'delete'>>> {
    return this.json('delete', path, args[0]);
  }

  /** For a `GET` whose answer is a file (an image, a video, audio): the bytes and their content type, not parsed. */
  getBlob<P extends Path<'get'>>(path: P, ...args: CallArgs<Operation<P, 'get'>>): Observable<{ body: Blob; contentType: string }> {
    const options = args[0] as LooseOptions | undefined;
    return this.http
      .get(this.url(path, options), { params: this.params(options), headers: this.headers(), context: this.context(), responseType: 'blob', observe: 'response' })
      .pipe(
        map((res: HttpResponse<Blob>) => ({ body: res.body as Blob, contentType: res.headers.get('Content-Type') ?? '' })),
        catchError((e) => this.fail(e)),
      );
  }

  /**
   * For a `POST` whose body is `multipart/form-data` (a JSON part and a file part): the form is sent as it is, with the token, and
   * the JSON of the success response is answered. The path is the contract's; what goes in the form is up to the caller.
   */
  postForm<P extends Path<'post'>>(path: P, form: FormData): Observable<Answer<Operation<P, 'post'>>> {
    return this.http
      .post(this.url(path, undefined), form, { headers: this.headers(), context: this.context(), responseType: 'json' })
      .pipe(catchError((e) => this.fail(e))) as Observable<Answer<Operation<P, 'post'>>>;
  }

  /** The full URL of an address the server returned (`/api/projects/x/artifacts/out/x.mp4`): the base plus the address. Reads nothing. */
  urlOf(address: string): string {
    return (this.config.baseUrl ?? '').replace(/\/+$/, '') + address;
  }

  /** Reads a file from an address the server returned, with the token: its bytes and content type. */
  getBlobAt(address: string): Observable<{ body: Blob; contentType: string }> {
    return this.http
      .get(this.urlOf(address), { headers: this.headers(), context: this.context(), responseType: 'blob', observe: 'response' })
      .pipe(
        map((res: HttpResponse<Blob>) => ({ body: res.body as Blob, contentType: res.headers.get('Content-Type') ?? '' })),
        catchError((e) => this.fail(e)),
      );
  }

  /**
   * The full address to open an event stream (`EventSource`, or the reader of your choice). It reads nothing itself, and
   * it carries no authorization: a server that wants a token needs the caller to arrange one.
   */
  streamUrl<P extends EventStreamPath>(path: P, ...args: CallArgs<Operation<P, 'get'>>): string {
    const options = args[0] as LooseOptions | undefined;
    const query = this.params(options).toString();
    return this.url(path, options) + (query ? `?${query}` : '');
  }

  private json(method: HttpMethod, path: string, options: LooseOptions | undefined): Observable<never> {
    return this.http
      .request(method.toUpperCase(), this.url(path, options), {
        params: this.params(options),
        headers: this.headers(),
        context: this.context(),
        ...(options?.body !== undefined ? { body: options.body } : {}),
        responseType: 'json',
      })
      .pipe(catchError((e) => this.fail(e))) as Observable<never>;
  }

  private url(path: string, options: LooseOptions | undefined): string {
    const base = (this.config.baseUrl ?? '').replace(/\/+$/, '');
    const filled = path.replace(/\{([^}]+)\}/g, (_, name: string) => {
      const value = options?.path?.[name];
      if (value === undefined || value === null) throw new Error(`The path ${path} needs the parameter "${name}"`);
      return encodeURIComponent(String(value));
    });
    return base + filled;
  }

  private params(options: LooseOptions | undefined): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(options?.query ?? {})) {
      if (value === undefined || value === null) continue;
      for (const item of Array.isArray(value) ? value : [value]) params = params.append(key, String(item));
    }
    return params;
  }

  private context(): HttpContext {
    return new HttpContext().set(ERROR_EXPLAINED_BY_SCREEN, true);
  }

  private headers(): HttpHeaders {
    const t = this.config.token;
    const token = typeof t === 'function' ? t() : t;
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private fail(e: unknown): Observable<never> {
    if (e instanceof HttpErrorResponse) {
      return throwError(() => ApiError.from(e.status, e.error, e.status === 0 ? 'No answer from the server' : e.message));
    }
    return throwError(() => e);
  }
}

export type { CallOptions };
