import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { ApiClient } from './api-client';
import { ERROR_EXPLAINED_BY_SCREEN } from './context';
import { ApiError } from './api-error';
import { ApiClientConfig, provideApiClient } from './config';

function setup(config: ApiClientConfig = {}) {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClient(config)] });
  return { api: TestBed.inject(ApiClient), http: TestBed.inject(HttpTestingController) };
}

describe('ApiClient', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('puts the path parameters in the address, encoded', () => {
    const { api, http } = setup({ baseUrl: 'http://server:4666/' });
    api.get('/api/runs/{id}/resources', { path: { id: 'a b/c' } }).subscribe();
    const req = http.expectOne('http://server:4666/api/runs/a%20b%2Fc/resources');
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('sends the query, leaves out what is undefined', () => {
    const { api, http } = setup();
    api.get('/api/stats', { query: { project: 'demo', mode: undefined } }).subscribe();
    const req = http.expectOne((r) => r.url === '/api/stats');
    expect(req.request.params.get('project')).toBe('demo');
    expect(req.request.params.has('mode')).toBe(false);
    req.flush({});
  });

  it('sends the body of a write as JSON with the right method', () => {
    const { api, http } = setup();
    api.put('/api/settings', { body: { ollama_host: '192.168.1.50' } }).subscribe();
    const req = http.expectOne('/api/settings');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ ollama_host: '192.168.1.50' });
    req.flush({});
  });

  it('refuses a call that lacks a path parameter instead of sending a broken address', () => {
    const { api } = setup();
    expect(() => api.get('/api/runs/{id}/resources', {} as never)).toThrow(/needs the parameter "id"/);
  });

  describe('errors the caller explains', () => {
    it('marks every kind of call so an application does not show a second notice', () => {
      const { api, http } = setup();
      api.get('/api/runs').subscribe();
      api.post('/api/projects', { body: { id: 'x' } }).subscribe();
      api.getBlob('/api/runs/{id}/resources', { path: { id: 'a' } }).subscribe();
      api.getBlobAt('/api/projects/x/artifacts/out/x.mp3').subscribe();
      api.postForm('/api/assist/listen', new FormData()).subscribe();
      const requests = http.match(() => true);
      expect(requests).toHaveLength(5);
      for (const req of requests) {
        expect(req.request.context.get(ERROR_EXPLAINED_BY_SCREEN)).toBe(true);
        req.flush(req.request.responseType === 'blob' ? new Blob(['x']) : {});
      }
    });
  });

  describe('authentication', () => {
    it('sends the token as a bearer token', () => {
      const { api, http } = setup({ token: 'secret' });
      api.get('/api/settings').subscribe();
      const req = http.expectOne('/api/settings');
      expect(req.request.headers.get('Authorization')).toBe('Bearer secret');
      req.flush({});
    });

    it('asks a token function on each call', () => {
      let n = 0;
      const { api, http } = setup({ token: () => `t${++n}` });
      api.get('/api/settings').subscribe();
      api.get('/api/settings').subscribe();
      const seen = http.match('/api/settings').map((r) => r.request.headers.get('Authorization'));
      expect(seen).toEqual(['Bearer t1', 'Bearer t2']);
    });

    it('sends no authorization header without a token', () => {
      const { api, http } = setup();
      api.get('/api/settings').subscribe();
      const req = http.expectOne('/api/settings');
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({});
    });
  });

  describe('errors', () => {
    it("fails with the contract's error and the status", async () => {
      const { api, http } = setup();
      const done = firstValueFrom(api.put('/api/settings', { body: { ollama_host: 'x y' } })).catch((e: unknown) => e);
      http.expectOne('/api/settings').flush({ error: { code: 'invalid_request', message: 'bad address', reason: 'has spaces' } }, { status: 400, statusText: 'Bad Request' });
      const e = (await done) as ApiError;
      expect(e).toBeInstanceOf(ApiError);
      expect([e.status, e.code, e.message, e.reason]).toEqual([400, 'invalid_request', 'bad address', 'has spaces']);
    });

    it('fails with code "unknown" when the body is not the contract\'s error', async () => {
      const { api, http } = setup();
      const done = firstValueFrom(api.get('/api/settings')).catch((e: unknown) => e);
      http.expectOne('/api/settings').flush('<html>bad gateway</html>', { status: 502, statusText: 'Bad Gateway' });
      const e = (await done) as ApiError;
      expect([e.status, e.code]).toEqual([502, 'unknown']);
    });

    it('fails with status 0 when nothing answers', async () => {
      const { api, http } = setup();
      const done = firstValueFrom(api.get('/api/settings')).catch((e: unknown) => e);
      http.expectOne('/api/settings').error(new ProgressEvent('error'));
      const e = (await done) as ApiError;
      expect([e.status, e.code]).toEqual([0, 'unknown']);
    });
  });

  describe('answers that are not JSON', () => {
    it('gives the bytes and the content type of a file', async () => {
      const { api, http } = setup();
      const done = firstValueFrom(api.getBlob('/api/reviews/{rid}/findings/{fid}/frame', { path: { rid: 'r', fid: 'f' } }));
      const req = http.expectOne('/api/reviews/r/findings/f/frame');
      expect(req.request.responseType).toBe('blob');
      req.flush(new Blob(['png'], { type: 'image/png' }), { headers: { 'Content-Type': 'image/png' } });
      const got = await done;
      expect(got.contentType).toBe('image/png');
      expect(got.body.size).toBe(3);
    });

    it('posts a form as it is, with the token, and answers the JSON', async () => {
      const { api, http } = setup({ baseUrl: 'http://server:4666/', token: 'secret' });
      const form = new FormData();
      form.set('request', JSON.stringify({ prompt: 'p' }));
      form.set('image', new Blob(['png'], { type: 'image/png' }), 'a.png');
      const done = firstValueFrom(api.postForm('/api/generations', form));
      const req = http.expectOne('http://server:4666/api/generations');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBe(form);
      expect(req.request.headers.get('Authorization')).toBe('Bearer secret');
      req.flush({ id: 'api-gen-1' });
      expect(await done).toEqual({ id: 'api-gen-1' } as never);
    });

    it('fails a form the server refuses as an ApiError', async () => {
      const { api, http } = setup();
      const done = firstValueFrom(api.postForm('/api/image-edits', new FormData())).catch((e) => e);
      http.expectOne('/api/image-edits').flush({ error: { code: 'validation_failed', message: 'the prompt is blank' } }, { status: 422, statusText: 'Unprocessable' });
      const e = await done;
      expect(e).toBeInstanceOf(ApiError);
      expect(e.status).toBe(422);
    });

    it('reads a file by the address the server gave, with the token', async () => {
      const { api, http } = setup({ baseUrl: 'http://server:4666', token: 't' });
      const done = firstValueFrom(api.getBlobAt('/api/projects/x/artifacts/out/x/imagen_1.png'));
      const req = http.expectOne('http://server:4666/api/projects/x/artifacts/out/x/imagen_1.png');
      expect(req.request.responseType).toBe('blob');
      expect(req.request.headers.get('Authorization')).toBe('Bearer t');
      req.flush(new Blob(['png'], { type: 'image/png' }), { headers: { 'Content-Type': 'image/png' } });
      const got = await done;
      expect([got.contentType, got.body.size]).toEqual(['image/png', 3]);
    });

    it('fails a file that cannot be read as an ApiError', async () => {
      const { api, http } = setup();
      const done = firstValueFrom(api.getBlobAt('/api/projects/x/artifacts/out/x.mp4')).catch((e) => e);
      http.expectOne('/api/projects/x/artifacts/out/x.mp4').flush(new Blob([]), { status: 404, statusText: 'Not Found' });
      expect(await done).toBeInstanceOf(ApiError);
    });

    it('builds the full URL of an address from the base, with or without a trailing slash', () => {
      expect(setup({ baseUrl: 'http://server:4666/' }).api.urlOf('/api/a.mp4')).toBe('http://server:4666/api/a.mp4');
      TestBed.resetTestingModule();
      expect(setup().api.urlOf('/api/a.mp4')).toBe('/api/a.mp4');
    });

    it('builds the full address of an event stream and reads nothing', () => {
      const { api, http } = setup({ baseUrl: 'http://server:4666' });
      expect(api.streamUrl('/api/runs/{id}/events', { path: { id: 'r1' } })).toBe('http://server:4666/api/runs/r1/events');
      http.expectNone(() => true);
    });
  });
});
