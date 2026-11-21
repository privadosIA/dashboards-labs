import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ProjectsStore } from './projects.store';

describe('ProjectsStore: changing a project and restoring a version', () => {
  let http: HttpTestingController;
  let store: ProjectsStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(ProjectsStore);
  });
  afterEach(() => http.verify());

  const listing = (name: string) => [{ id: 'demo', name, mode: 'video', scene_count: 1, client: 'embedded' }];

  it('patches a project with only the fields sent, answers the project and reads the list again', async () => {
    const done = store.patch('demo', { name: 'Renamed' });
    const req = http.expectOne('/api/projects/demo');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ name: 'Renamed' });
    req.flush({ id: 'demo', name: 'Renamed', mode: 'video', scene_count: 1, client: 'embedded' });
    await Promise.resolve();
    http.expectOne('/api/projects').flush(listing('Renamed'));
    const project = await done;
    expect(project.name).toBe('Renamed');
    expect(store.projects()[0].name).toBe('Renamed');
  });

  it('does not read the list again when the server refuses the change', async () => {
    const done = store.patch('demo', { name: 'x' });
    http.expectOne('/api/projects/demo').flush({ error: { code: 'conflict', message: 'project has an active run' } }, { status: 409, statusText: 'Conflict' });
    await expect(done).rejects.toMatchObject({ status: 409 });
    http.expectNone('/api/projects');
  });

  it('restores a version, answers which one and the project, and reads the list again', async () => {
    const done = store.restore('demo', 3);
    const req = http.expectOne('/api/projects/demo/versions/3/restore');
    expect(req.request.method).toBe('POST');
    req.flush({ restored: 3, project: { id: 'demo', name: 'Old name', mode: 'video', scene_count: 1, client: 'embedded' } });
    await Promise.resolve();
    http.expectOne('/api/projects').flush(listing('Old name'));
    expect((await done).restored).toBe(3);
    expect(store.projects()[0].name).toBe('Old name');
  });
});

describe('ApiService: the project versions', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('lists the versions and reads the text of one', async () => {
    const { ApiService } = await import('./api.service');
    const api = TestBed.inject(ApiService);
    api.listProjectVersions('demo').subscribe();
    expect(http.expectOne('/api/projects/demo/versions').request.method).toBe('GET');
    api.getProjectVersion('demo', 2).subscribe();
    http.match(() => true).forEach((r) => r.flush([]));
  });

  it('skips the error toast on the calls whose dialogs explain the failure', async () => {
    const { ApiService } = await import('./api.service');
    const { SKIP_ERROR_TOAST } = await import('./api-error.interceptor');
    const api = TestBed.inject(ApiService);
    api.patchProject('demo', { adult: null }).subscribe({ error: () => undefined });
    api.restoreProjectVersion('demo', 1).subscribe({ error: () => undefined });
    const reqs = http.match(() => true);
    expect(reqs.map((r) => r.request.method)).toEqual(['PATCH', 'POST']);
    for (const r of reqs) {
      expect(r.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
      r.flush(null, { status: 409, statusText: 'Conflict' });
    }
  });
});
