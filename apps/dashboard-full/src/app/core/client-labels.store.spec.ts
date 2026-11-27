import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { defaultClientColor } from '../shared/client-color';
import { ClientLabelsStore } from './client-labels.store';

const counts = { projects: 0, animations: 0, generations: 0, image_edits: 0, video_edits: 0, model_generations: 0 };
const label = (name: string, color: string, projects = 1) => ({ name, color, counts: { ...counts, projects }, total: projects, last_used: '2026-11-27T10:00:00Z' });

describe('ClientLabelsStore', () => {
  let http: HttpTestingController;
  let store: ClientLabelsStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(ClientLabelsStore);
  });
  afterEach(() => http.verify());

  const loaded = async (list = [label('other-app', '#aa3355', 4), label('embedded', '#2255aa', 9)]) => {
    const done = store.load();
    http.expectOne('/api/clients').flush(list);
    await done;
  };

  it('keeps the labels in the order the server gives them', async () => {
    await loaded();
    expect(store.labels().map((l) => l.name)).toEqual(['other-app', 'embedded']);
    expect(store.loaded()).toBe(true);
  });

  it('gives the colour of the server, and the one worked out from the name for a label it does not have', async () => {
    await loaded();
    expect(store.colorOf('other-app')).toBe('#aa3355');
    expect(store.colorOf('claude-test')).toBe(defaultClientColor('claude-test'));
    expect(store.colorOf(undefined)).toBe(defaultClientColor('unknown'));
  });

  it('ignores a colour that is not #rrggbb', async () => {
    await loaded([label('odd', 'red')]);
    expect(store.colorOf('odd')).toBe(defaultClientColor('odd'));
  });

  it('leaves an empty list and no error when the labels cannot be read', async () => {
    const done = store.load();
    http.expectOne('/api/clients').flush({ error: { code: 'not_found', message: 'no' } }, { status: 404, statusText: 'Not Found' });
    await done;
    expect(store.labels()).toEqual([]);
    expect(store.loaded()).toBe(true);
  });

  it('keeps a colour with the server and shows it at once', async () => {
    await loaded();
    const done = store.setColor('other-app', '#112233');
    const req = http.expectOne('/api/clients/other-app');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ color: '#112233' });
    req.flush({ name: 'other-app', color: '#112233' });
    await done;
    expect(store.colorOf('other-app')).toBe('#112233');
  });

  it('restores the default colour with null and shows what the server answers', async () => {
    await loaded();
    const done = store.setColor('other-app', null);
    const req = http.expectOne('/api/clients/other-app');
    expect(req.request.body).toEqual({ color: null });
    req.flush({ name: 'other-app', color: defaultClientColor('other-app') });
    await done;
    expect(store.colorOf('other-app')).toBe(defaultClientColor('other-app'));
  });

  it('keeps the previous colour when the server refuses the new one', async () => {
    await loaded();
    const done = store.setColor('other-app', '#112233');
    http.expectOne('/api/clients/other-app').flush({ error: { code: 'invalid_request', message: 'color: must be #rrggbb' } }, { status: 400, statusText: 'Bad Request' });
    await expect(done).rejects.toMatchObject({ status: 400 });
    expect(store.colorOf('other-app')).toBe('#aa3355');
  });

  it('changes the label of an item by the route of its kind and reads the labels again', async () => {
    await loaded();
    const done = store.setClient('api-gen-20260101-abc', 'claude-test');
    const req = http.expectOne('/api/generations/api-gen-20260101-abc');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ client: 'claude-test' });
    req.flush({ client: 'claude-test' });
    await Promise.resolve();
    http.expectOne('/api/clients').flush([label('claude-test', '#00aa00')]);
    await done;
    expect(store.labels().map((l) => l.name)).toEqual(['claude-test']);
  });

  it.each([
    ['api-gen-1', '/api/generations/api-gen-1'],
    ['api-edit-1', '/api/image-edits/api-edit-1'],
    ['api-vid-1', '/api/video-edits/api-vid-1'],
    ['api-m3d-1', '/api/models3d/generations/api-m3d-1'],
    ['api-mm-1', '/api/music-motion/pieces/api-mm-1'],
    ['demo', '/api/projects/demo'],
  ])('sends the label of %s to %s', (id, url) => {
    store.setClient(id, null).catch(() => undefined);
    const req = http.expectOne(url);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ client: null });
    req.flush({ error: { code: 'conflict', message: 'x' } }, { status: 409, statusText: 'Conflict' });
  });

  it('sends the label of an animation without the prefix by its kind', () => {
    store.setClient('sample-piece', 'other-app', 'music_motion').catch(() => undefined);
    const req = http.expectOne('/api/music-motion/pieces/sample-piece');
    expect(req.request.body).toEqual({ client: 'other-app' });
    req.flush({ error: { code: 'conflict', message: 'x' } }, { status: 409, statusText: 'Conflict' });
  });

  it('does not read the labels again when the server refuses (the item is running)', async () => {
    const done = store.setClient('api-vid-1', 'claude-test');
    http.expectOne('/api/video-edits/api-vid-1').flush({ error: { code: 'conflict', message: 'has an active run' } }, { status: 409, statusText: 'Conflict' });
    await expect(done).rejects.toMatchObject({ status: 409 });
    http.expectNone('/api/clients');
  });
});
