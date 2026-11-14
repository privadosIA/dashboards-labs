import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ConnectionDialogService } from '@lab/server-connection';
import { ApiClient, provideApiClient } from '@lab/api-client';
import { ApiService } from './api.service';
import { apiErrorInterceptor, describeError } from './api-error.interceptor';

function errResponse(status: number, code: string, message: string): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { error: { code, message } } });
}

describe('describeError', () => {
  it('maps connection failures to a "start the server" hint', () => {
    const msg = describeError(new HttpErrorResponse({ status: 0 }));
    expect(msg).toContain('orchestrator serve');
  });

  it('keeps the server validation message and says what to do next', () => {
    const msg = describeError(errResponse(422, 'validation_failed', 'config: scene "a" has an empty prompt'));
    expect(msg).toContain('scene "a" has an empty prompt');
    expect(msg).toContain('guarda de nuevo');
  });

  it('explains a 401 as a missing/wrong token', () => {
    expect(describeError(errResponse(401, 'unauthorized', 'x'))).toContain('token');
  });

  it('names the remote address and the CORS/addr hints when unreachable', () => {
    const msg = describeError(new HttpErrorResponse({ status: 0 }), 'http://h:4666');
    expect(msg).toContain('http://h:4666');
    expect(msg).toContain('--cors-origin');
    expect(msg).toContain('--addr');
  });

  it('maps conflicts and not-found to actionable messages', () => {
    expect(describeError(errResponse(409, 'conflict', 'run activo'))).toContain('run activo');
    expect(describeError(errResponse(404, 'not_found', 'project "x" not found'))).toContain(
      'project "x" not found',
    );
  });
});

describe('apiErrorInterceptor', () => {
  it('opens the connection settings on a 401, the first thing an installed app on a new device needs', async () => {
    const dialogOpen = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: ConnectionDialogService, useValue: { open: dialogOpen } },
      ],
    });
    const http = TestBed.inject(HttpClient);
    const ctrl = TestBed.inject(HttpTestingController);
    const result = new Promise((resolve) => http.get('/api/projects').subscribe({ error: resolve }));
    ctrl.expectOne('/api/projects').flush({ error: { code: 'unauthorized', message: 'no' } }, { status: 401, statusText: 'Unauthorized' });
    await result;
    expect(dialogOpen).toHaveBeenCalledTimes(1);
  });

  it('shows a snackbar and rethrows', async () => {
    const open = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: MatSnackBar, useValue: { open } },
      ],
    });
    const http = TestBed.inject(HttpClient);
    const ctrl = TestBed.inject(HttpTestingController);

    const result = new Promise<unknown>((resolve) => {
      http.get('/api/projects').subscribe({ next: resolve, error: resolve });
    });
    ctrl
      .expectOne('/api/projects')
      .flush({ error: { code: 'conflict', message: 'ocupado' } }, { status: 409, statusText: 'Conflict' });

    const err = (await result) as HttpErrorResponse;
    expect(err.status).toBe(409);
    expect(open).toHaveBeenCalledTimes(1);
    expect(String(open.mock.calls[0][0])).toContain('ocupado');
  });

  it('leaves the failures of the music-in-motion routes to the screens that show them, and still rethrows them', async () => {
    const open = vi.fn();
    const dialogOpen = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: MatSnackBar, useValue: { open } },
        { provide: ConnectionDialogService, useValue: { open: dialogOpen } },
      ],
    });
    const http = TestBed.inject(HttpClient);
    const ctrl = TestBed.inject(HttpTestingController);
    const failed = new Promise<unknown>((resolve) => http.get('/api/music-motion/pieces').subscribe({ error: resolve }));
    ctrl.expectOne('/api/music-motion/pieces').flush({ error: { code: 'bad_gateway', message: 'no chrome' } }, { status: 502, statusText: 'Bad Gateway' });
    expect(((await failed) as HttpErrorResponse).status).toBe(502);
    expect(open).not.toHaveBeenCalled();
    // A wrong token is still fixed in one step.
    const refused = new Promise<unknown>((resolve) => http.get('/api/music-motion/catalog').subscribe({ error: resolve }));
    ctrl.expectOne('/api/music-motion/catalog').flush({ error: { code: 'unauthorized', message: 'no' } }, { status: 401, statusText: 'Unauthorized' });
    await refused;
    expect(dialogOpen).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
  });

  it('leaves the failures of the video studio routes to the studio, and a 401 still opens the connection box', async () => {
    const open = vi.fn();
    const dialogOpen = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: MatSnackBar, useValue: { open } },
        { provide: ConnectionDialogService, useValue: { open: dialogOpen } },
      ],
    });
    const http = TestBed.inject(HttpClient);
    const ctrl = TestBed.inject(HttpTestingController);
    const rejected = new Promise<unknown>((resolve) => http.post('/api/generations', {}).subscribe({ error: resolve }));
    ctrl.expectOne('/api/generations').flush({ error: { code: 'invalid_request', message: 'prompt too long' } }, { status: 422, statusText: 'Unprocessable Entity' });
    expect(((await rejected) as HttpErrorResponse).status).toBe(422);
    expect(open).not.toHaveBeenCalled();
    for (const route of ['/api/generation/options', '/api/video-edits', '/api/motions', '/api/image-edits']) {
      const failed = new Promise<unknown>((resolve) => http.get(route).subscribe({ error: resolve }));
      ctrl.expectOne(route).flush({ error: { code: 'bad_gateway', message: 'no' } }, { status: 502, statusText: 'Bad Gateway' });
      await failed;
    }
    expect(open).not.toHaveBeenCalled();
    const refused = new Promise<unknown>((resolve) => http.get('/api/video-edits/options').subscribe({ error: resolve }));
    ctrl.expectOne('/api/video-edits/options').flush({ error: { code: 'unauthorized', message: 'no' } }, { status: 401, statusText: 'Unauthorized' });
    await refused;
    expect(dialogOpen).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
  });

  it('leaves the failures of the calls made through the API client to the screen that made them, and a 401 still opens the connection box', async () => {
    const open = vi.fn();
    const dialogOpen = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        provideApiClient(),
        { provide: MatSnackBar, useValue: { open } },
        { provide: ConnectionDialogService, useValue: { open: dialogOpen } },
      ],
    });
    const api = TestBed.inject(ApiClient);
    const http = TestBed.inject(HttpClient);
    const ctrl = TestBed.inject(HttpTestingController);
    // The song studio shares /api/projects and /api/runs with the rest of the dashboard: the mark says who is asking.
    const rejected = new Promise<unknown>((resolve) => api.post('/api/projects', { body: { id: 'ms-1' } }).subscribe({ error: resolve }));
    ctrl.expectOne('/api/projects').flush({ error: { code: 'invalid_request', message: 'bad id' } }, { status: 422, statusText: 'Unprocessable Entity' });
    await rejected;
    expect(open).not.toHaveBeenCalled();
    const plain = new Promise<unknown>((resolve) => http.post('/api/projects', {}).subscribe({ error: resolve }));
    ctrl.expectOne('/api/projects').flush({ error: { code: 'invalid_request', message: 'bad id' } }, { status: 422, statusText: 'Unprocessable Entity' });
    await plain;
    expect(open).toHaveBeenCalledTimes(1);
    const refused = new Promise<unknown>((resolve) => api.get('/api/runs').subscribe({ error: resolve }));
    ctrl.expectOne((r) => r.url === '/api/runs').flush({ error: { code: 'unauthorized', message: 'no' } }, { status: 401, statusText: 'Unauthorized' });
    await refused;
    expect(dialogOpen).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledTimes(1);
  });

  describe('assist()', () => {
    function setup(open = vi.fn()) {
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(withInterceptors([apiErrorInterceptor])),
          provideHttpClientTesting(),
          { provide: MatSnackBar, useValue: { open } },
        ],
      });
      return { api: TestBed.inject(ApiService), ctrl: TestBed.inject(HttpTestingController), open };
    }

    it('POSTs the task and the text to /api/assist', () => {
      const { api, ctrl } = setup();
      let got: unknown;
      api.assist('image', 'Una mujer lee').subscribe((r) => (got = r));
      const req = ctrl.expectOne({ method: 'POST', url: '/api/assist' });
      expect(req.request.body).toEqual({ task: 'image', text: 'Una mujer lee' });
      req.flush({ text: 'A woman reads.' });
      expect(got).toEqual({ text: 'A woman reads.' });
    });

    it('does not open the generic snackbar for its failures, and still rethrows them', async () => {
      const { api, ctrl, open } = setup();
      const result = new Promise<unknown>((resolve) =>
        api.assist('motion', 'x').subscribe({ next: resolve, error: resolve }),
      );
      ctrl
        .expectOne('/api/assist')
        .flush({ error: { code: 'unavailable', message: 'ollama pull qwen3:8b' } }, { status: 503, statusText: 'Service Unavailable' });
      const err = (await result) as HttpErrorResponse;
      expect(err.status).toBe(503);
      expect(open).not.toHaveBeenCalled();
    });

    it('other requests keep the snackbar', async () => {
      const { ctrl, open } = setup();
      const http = TestBed.inject(HttpClient);
      const result = new Promise<unknown>((resolve) => http.get('/api/projects').subscribe({ error: resolve }));
      ctrl.expectOne('/api/projects').flush({ error: { code: 'conflict', message: 'x' } }, { status: 409, statusText: 'Conflict' });
      await result;
      expect(open).toHaveBeenCalledTimes(1);
    });

    it('unsubscribing aborts the request without an error or a snackbar', () => {
      const { api, ctrl, open } = setup();
      const errors: unknown[] = [];
      const sub = api.assist('image', 'x').subscribe({ error: (e) => errors.push(e) });
      const req = ctrl.expectOne('/api/assist');
      sub.unsubscribe();
      expect(req.cancelled).toBe(true);
      expect(errors).toEqual([]);
      expect(open).not.toHaveBeenCalled();
    });
  });

  it('leaves a rejected part of the Vector section to its send dialog: a 422 on a draft opens no snackbar', async () => {
    const open = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: MatSnackBar, useValue: { open } },
        { provide: ConnectionDialogService, useValue: { open: vi.fn() } },
      ],
    });
    const http = TestBed.inject(HttpClient);
    const ctrl = TestBed.inject(HttpTestingController);
    const rejected = new Promise<unknown>((resolve) => http.post('/api/music-motion/part-drafts', { manifest: '{}', fragment: '' }).subscribe({ error: resolve }));
    ctrl.expectOne('/api/music-motion/part-drafts').flush({ error: { code: 'invalid_request', message: 'the part does not move' } }, { status: 422, statusText: 'Unprocessable' });
    expect(((await rejected) as HttpErrorResponse).status).toBe(422);
    expect(open).not.toHaveBeenCalled();
  });

  it('leaves a failed call of the Motion Edit section to the editor: a 422 on a piece\'s script opens no snackbar', async () => {
    const open = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: MatSnackBar, useValue: { open } },
        { provide: ConnectionDialogService, useValue: { open: vi.fn() } },
      ],
    });
    const http = TestBed.inject(HttpClient);
    const ctrl = TestBed.inject(HttpTestingController);
    const rejected = new Promise<unknown>((resolve) => http.put('/api/music-motion/pieces/p1/script', {}).subscribe({ error: resolve }));
    ctrl.expectOne('/api/music-motion/pieces/p1/script').flush({ error: { code: 'invalid_request', message: 'the script has a gap' } }, { status: 422, statusText: 'Unprocessable' });
    expect(((await rejected) as HttpErrorResponse).status).toBe(422);
    expect(open).not.toHaveBeenCalled();
  });
});
