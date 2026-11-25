import { HttpContext, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { LibraryFailed } from '@lab/model-library-kit';

import { SKIP_ERROR_TOAST } from './api-error.interceptor';
import { ApiService } from './api.service';
import { ServerModelLibrary } from './model-library.adapter';

describe('The 3D model library over the typed client', () => {
  let http: HttpTestingController;
  let api: ApiService;
  let library: ServerModelLibrary;
  const quiet = (context: HttpContext) => context.get(SKIP_ERROR_TOAST) === true;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(ApiService);
    library = TestBed.inject(ServerModelLibrary);
  });
  afterEach(() => http.verify());

  it('reads the packs, one pack, and installs, cancels and removes one, with no generic toast', () => {
    library.packs().subscribe();
    const list = http.expectOne('/api/models3d/packs');
    expect(quiet(list.request.context)).toBe(true);
    list.flush({ packs: [] });
    library.pack('kenney-food-kit').subscribe();
    http.expectOne('/api/models3d/packs/kenney-food-kit').flush({});
    library.install('kenney-food-kit').subscribe();
    expect(http.expectOne({ method: 'POST', url: '/api/models3d/packs/kenney-food-kit/install' }).request.body).toEqual({});
    library.cancel('kenney-food-kit').subscribe();
    http.expectOne({ method: 'POST', url: '/api/models3d/packs/kenney-food-kit/cancel' }).flush({});
    library.remove('kenney-food-kit').subscribe();
    http.expectOne({ method: 'DELETE', url: '/api/models3d/packs/kenney-food-kit' }).flush(null, { status: 204, statusText: 'No Content' });
  });

  it('imports a zip with the licence in the query and the zip as the body', () => {
    library.importPack({ id: 'mine', licence: 'CC-BY 4.0', name: 'Mine', author: '', sourceUrl: 'https://example.org', file: new Blob(['PK']) }).subscribe();
    const req = http.expectOne((r) => r.url === '/api/models3d/packs/import');
    expect(req.request.method).toBe('POST');
    expect(req.request.params.get('id')).toBe('mine');
    expect(req.request.params.get('licence')).toBe('CC-BY 4.0');
    expect(req.request.params.get('source_url')).toBe('https://example.org');
    expect(req.request.params.has('author')).toBe(false);
    expect(req.request.headers.get('Content-Type')).toBe('application/zip');
    req.flush({});
  });

  it('asks the catalog with only the filters that are set', () => {
    library.catalog({ q: 'pizza', hasClips: true, limit: 12, offset: 24 }).subscribe();
    const req = http.expectOne((r) => r.url === '/api/models3d/models');
    expect(req.request.params.keys().sort()).toEqual(['has_clips', 'limit', 'offset', 'q']);
    expect(req.request.params.get('has_clips')).toBe('true');
    req.flush({ models: [], total: 0 });
    library.catalog({ hasClips: false }).subscribe();
    expect(http.expectOne('/api/models3d/models').request.params.keys()).toEqual([]);
  });

  it('draws a thumbnail as a blob and reads the 503 JSON error out of it', async () => {
    let got: unknown;
    library.thumbnail('p', 'a b').subscribe({ error: (e) => (got = e) });
    const req = http.expectOne('/api/models3d/models/p/a%20b/thumbnail');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob([JSON.stringify({ error: { message: 'Blender is not installed' } })]), { status: 503, statusText: 'Unavailable' });
    await new Promise((r) => setTimeout(r, 10));
    expect(got).toBeInstanceOf(LibraryFailed);
    expect((got as LibraryFailed).status).toBe(503);
    expect((got as LibraryFailed).said).toBe('Blender is not installed');
  });

  it('copies a model into a project and tells 201 from 200', () => {
    let status = 0;
    api.copyModelToProject('p1', 'kenney-food-kit/pizza', 'pizza.glb').subscribe((r) => (status = r.status));
    const req = http.expectOne('/api/projects/p1/sources/model');
    expect(req.request.body).toEqual({ from: 'kenney-food-kit/pizza', name: 'pizza.glb' });
    req.flush({ name: 'pizza.glb', pictures: [] }, { status: 200, statusText: 'OK' });
    expect(status).toBe(200);
    api.copyModelToProject('p1', 'kenney-food-kit/pizza').subscribe();
    expect(http.expectOne('/api/projects/p1/sources/model').request.body).toEqual({ from: 'kenney-food-kit/pizza' });
  });

  it('turns a refusal into the status and the server’s words', async () => {
    let got: unknown;
    library.install('x').subscribe({ error: (e) => (got = e) });
    http.expectOne('/api/models3d/packs/x/install').flush({ error: { code: 'conflict', message: 'pack "x" is already installed' } }, { status: 409, statusText: 'Conflict' });
    await new Promise((r) => setTimeout(r, 10));
    expect(got).toMatchObject({ status: 409, said: 'pack "x" is already installed' });
  });

  it('reads the backend from the settings (a server with no block says nothing), chooses it, and goes back to the default with an empty one', () => {
    let seen: unknown = 'unset';
    library.modelBackend().subscribe((b) => (seen = b));
    http.expectOne({ method: 'GET', url: '/api/settings' }).flush({ ollama: {}, model3d: { backend: 'docker', backend_source: 'setting' } });
    expect(seen).toEqual({ backend: 'docker', source: 'setting' });
    library.modelBackend().subscribe((b) => (seen = b));
    http.expectOne('/api/settings').flush({ ollama: {} });
    expect(seen).toBeNull();
    library.setModelBackend('docker').subscribe((b) => (seen = b));
    const put = http.expectOne({ method: 'PUT', url: '/api/settings' });
    expect(put.request.body).toEqual({ model3d_backend: 'docker' });
    expect(quiet(put.request.context)).toBe(true);
    put.flush({ ollama: {}, model3d: { backend: 'docker', backend_source: 'setting' } });
    expect(seen).toEqual({ backend: 'docker', source: 'setting' });
    library.setModelBackend('').subscribe();
    const back = http.expectOne('/api/settings');
    expect(back.request.body).toEqual({ model3d_backend: '' });
    back.flush({ ollama: {}, model3d: { backend: 'dotnet', backend_source: 'default' } });
  });

  it('asks the plan and starts the install with the backend and the parts only when they are given', () => {
    library.installPlan('triposr').subscribe();
    expect(http.expectOne('/api/models3d/engines/triposr/install').request.body).toEqual({});
    library.installPlan('triposr', { backend: 'docker', parts: ['weights'] }).subscribe();
    expect(http.expectOne('/api/models3d/engines/triposr/install').request.body).toEqual({ backend: 'docker', parts: ['weights'] });
    library.startInstall('triposr', { backend: 'dotnet', parts: ['service', 'weights'] }).subscribe();
    expect(http.expectOne('/api/models3d/engines/triposr/install').request.body).toEqual({ backend: 'dotnet', parts: ['service', 'weights'], confirm: true });
  });

  it('keeps the refusal of a backend with the server’s words and reason', async () => {
    let got: unknown;
    library.setModelBackend('docker').subscribe({ error: (e) => (got = e) });
    http.expectOne('/api/settings').flush({ error: { code: 'validation_failed', message: 'Docker does not answer on this machine', reason: 'no_docker' } }, { status: 422, statusText: 'Unprocessable' });
    await new Promise((r) => setTimeout(r, 10));
    expect(got).toMatchObject({ status: 422, said: 'Docker does not answer on this machine', reason: 'no_docker' });
  });

  it('reads a model\'s file with its progress and bytes, and a 404 is a LibraryFailed (a server that does not serve it yet)', async () => {
    const steps: { loaded: number; total: number | null; bytes?: number }[] = [];
    library.file('generated', 'prueba cofre').subscribe((s) => steps.push({ loaded: s.loaded, total: s.total, bytes: s.bytes?.byteLength }));
    const req = http.expectOne('/api/models3d/models/generated/prueba%20cofre/file');
    expect(req.request.responseType).toBe('blob');
    expect(quiet(req.request.context)).toBe(true);
    req.event({ type: 3 /* DownloadProgress */, loaded: 2, total: 4 });
    req.flush(new Blob(['abcd']));
    await new Promise((r) => setTimeout(r, 10));
    expect(steps).toEqual([{ loaded: 2, total: 4, bytes: undefined }, { loaded: 4, total: 4, bytes: 4 }]);

    let got: unknown;
    library.file('a', 'b').subscribe({ error: (e) => (got = e) });
    http.expectOne('/api/models3d/models/a/b/file').flush(new Blob(['{"error":{"code":"not_found","message":"no such file"}}']), { status: 404, statusText: 'Not Found' });
    await new Promise((r) => setTimeout(r, 10));
    expect(got).toBeInstanceOf(LibraryFailed);
    expect(got).toMatchObject({ status: 404 });
  });
});
