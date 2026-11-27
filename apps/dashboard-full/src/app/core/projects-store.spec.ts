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
    http.expectOne('/api/projects?managed=all').flush(listing('Renamed'));
    const project = await done;
    expect(project.name).toBe('Renamed');
    expect(store.projects()[0].name).toBe('Renamed');
  });

  it('keeps the animations out of what can be opened and run, with the mode the server gives them', async () => {
    const done = store.load();
    http.expectOne('/api/projects?managed=all').flush([
      { id: 'demo', name: 'demo', mode: 'video', scene_count: 1 },
      { id: 'api-mm-1', name: 'api-mm-1', mode: 'video', scene_count: 18, client: 'dashboard-full', kind: 'music_motion' },
      { id: 'api-gen-1', name: 'api-gen-1', mode: 'video', scene_count: 1, kind: 'generation' },
    ]);
    await done;
    expect(store.projects().map((p) => p.id)).toEqual(['demo', 'api-mm-1', 'api-gen-1']);
    expect(store.workable().map((p) => p.id)).toEqual(['demo', 'api-gen-1']);
  });

  describe('the label of an item of the generation API', () => {
    const managed = (id: string, client: string) => [{ id, name: id, mode: 'video', scene_count: 1, client, kind: 'generation' }];

    it.each([
      ['api-gen-1', '/api/generations/api-gen-1'],
      ['api-edit-1', '/api/image-edits/api-edit-1'],
      ['api-vid-1', '/api/video-edits/api-vid-1'],
      ['api-m3d-1', '/api/models3d/generations/api-m3d-1'],
      ['api-mm-1', '/api/music-motion/pieces/api-mm-1'],
    ])('changes the client of %s by %s, never by the project route, and reads the list again', async (id, url) => {
      const done = store.patch(id, { client: 'claude-test' });
      const req = http.expectOne(url);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ client: 'claude-test' });
      req.flush({ client: 'claude-test' });
      await Promise.resolve();
      http.expectOne('/api/projects?managed=all').flush(managed(id, 'claude-test'));
      expect((await done).client).toBe('claude-test');
      http.expectNone(`/api/projects/${id}`);
    });

    it('routes an animation by its kind when its id has no prefix (the mock\'s sample pieces), and by the prefix when no kind is known', async () => {
      const done = store.patch('sample-piece', { client: 'other-app' }, 'music_motion');
      const req = http.expectOne('/api/music-motion/pieces/sample-piece');
      expect(req.request.method).toBe('PATCH');
      req.flush({ client: 'other-app' });
      await Promise.resolve();
      http.expectOne('/api/projects?managed=all').flush(managed('sample-piece', 'other-app'));
      await done;
      const plain = store.patch('sample-piece', { client: 'other-app' });
      http.expectOne('/api/projects/sample-piece').flush({ id: 'sample-piece', name: 'x', mode: '', scene_count: 0 });
      await Promise.resolve();
      http.expectOne('/api/projects?managed=all').flush([]);
      await plain;
    });

    it.each([
      ['api-mm-1', undefined, '/api/music-motion/pieces/api-mm-1'],
      ['sample-piece', 'music_motion' as const, '/api/music-motion/pieces/sample-piece'],
      ['api-gen-1', 'generation' as const, '/api/generations/api-gen-1'],
      ['demo', undefined, '/api/projects/demo'],
    ])('deletes %s (kind %s) by %s', async (id, kind, url) => {
      const done = store.remove(id, kind);
      const req = http.expectOne(url);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
      await Promise.resolve();
      http.expectOne('/api/projects?managed=all').flush([]);
      await done;
    });

    it('sends the name by the project route and the client by its own, in that order', async () => {
      const done = store.patch('api-gen-1', { name: 'Renamed', client: null });
      const first = http.expectOne('/api/projects/api-gen-1');
      expect(first.request.body).toEqual({ name: 'Renamed' });
      first.flush({ id: 'api-gen-1', name: 'Renamed', mode: 'video', scene_count: 1 });
      await Promise.resolve();
      const second = http.expectOne('/api/generations/api-gen-1');
      expect(second.request.body).toEqual({ client: null });
      second.flush({ client: 'unknown' });
      await Promise.resolve();
      http.expectOne('/api/projects?managed=all').flush(managed('api-gen-1', 'unknown'));
      expect((await done).client).toBe('unknown');
    });

    it('reads the list again when the name was changed and the client was refused (the item runs)', async () => {
      const done = store.patch('api-gen-1', { name: 'Renamed', client: 'claude-test' });
      http.expectOne('/api/projects/api-gen-1').flush({ id: 'api-gen-1', name: 'Renamed', mode: 'video', scene_count: 1 });
      await Promise.resolve();
      http.expectOne('/api/generations/api-gen-1').flush({ error: { code: 'conflict', message: 'has an active run' } }, { status: 409, statusText: 'Conflict' });
      await Promise.resolve();
      await Promise.resolve();
      http.expectOne('/api/projects?managed=all').flush(managed('api-gen-1', 'unknown'));
      await expect(done).rejects.toMatchObject({ status: 409 });
    });

    it('does not read the list again when the only change was refused', async () => {
      const done = store.patch('api-vid-1', { client: 'claude-test' });
      http.expectOne('/api/video-edits/api-vid-1').flush({ error: { code: 'conflict', message: 'has an active run' } }, { status: 409, statusText: 'Conflict' });
      await expect(done).rejects.toMatchObject({ status: 409 });
      http.expectNone('/api/projects?managed=all');
    });

    it('an ordinary project keeps the single PATCH with every field', async () => {
      const done = store.patch('demo', { name: 'Renamed', client: 'claude-test' });
      const req = http.expectOne('/api/projects/demo');
      expect(req.request.body).toEqual({ name: 'Renamed', client: 'claude-test' });
      req.flush({ id: 'demo', name: 'Renamed', mode: 'video', scene_count: 1, client: 'claude-test' });
      await Promise.resolve();
      http.expectOne('/api/projects?managed=all').flush(listing('Renamed'));
      expect((await done).client).toBe('claude-test');
    });
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
    http.expectOne('/api/projects?managed=all').flush(listing('Old name'));
    expect((await done).restored).toBe(3);
    expect(store.projects()[0].name).toBe('Old name');
  });

  it('deletes a generation API project by its own endpoint and an ordinary one by /projects, reading the list again each time', async () => {
    for (const [id, url] of [['api-gen-1', '/api/generations/api-gen-1'], ['api-edit-2', '/api/image-edits/api-edit-2'], ['api-vid-3', '/api/video-edits/api-vid-3'], ['demo', '/api/projects/demo']]) {
      const done = store.remove(id);
      const req = http.expectOne(url);
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
      await Promise.resolve();
      http.expectOne('/api/projects?managed=all').flush([]);
      await done;
    }
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
