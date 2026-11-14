import { ApiError, type components } from '@lab/api-client';
import { Observable, firstValueFrom, of, throwError } from 'rxjs';

import { motionPortBehaviour } from './port-behaviour';
import { ServerMotionLibrary, type MotionApi } from './server.adapter';
import { MotionRefused, MotionsUnreadable } from './validate';

type Motion = components['schemas']['Motion'];

/** A server in a few lines: a motion is processing for its first two reads and then ready. */
class FakeApi {
  store: Motion[] = [];
  calls: { method: string; path: string; form?: FormData; options?: unknown }[] = [];
  nextId = 1;
  reads = 0;
  listFails?: ApiError;
  refuse?: ApiError;

  get = ((path: string): Observable<Motion[]> => {
    this.calls.push({ method: 'get', path });
    if (this.listFails) return throwError(() => this.listFails);
    this.reads++;
    return of(this.store.map((m) => (m.state === 'processing' && this.reads > 1 ? { ...m, state: 'ready' as const } : m)));
  }) as unknown as MotionApi['get'];

  postForm = ((path: string, form: FormData): Observable<Motion> => {
    this.calls.push({ method: 'post', path, form });
    if (this.refuse) return throwError(() => this.refuse);
    const request = JSON.parse(String(form.get('request')));
    const made: Motion = { id: `m${this.nextId++}`, title: request.title ?? 'walk', tags: request.tags ?? [], duration: 6, people: 1, state: 'processing', preview: `/api/motions/m${this.nextId - 1}/preview` };
    this.store.unshift(made);
    return of(made);
  }) as unknown as MotionApi['postForm'];

  delete = ((path: string, options: { path: { id: string } }) => {
    this.calls.push({ method: 'delete', path, options });
    this.store = this.store.filter((m) => m.id !== options.path.id);
    return of(undefined);
  }) as unknown as MotionApi['delete'];

  urlOf = (a: string) => `http://server${a}`;
}

const video = { name: 'walk.mp4', blob: new Blob(['x']) };
const setup = () => {
  const api = new FakeApi();
  return { api, port: new ServerMotionLibrary(api as unknown as MotionApi, { pollMs: 1 }) };
};

motionPortBehaviour('ServerMotionLibrary', () => setup().port);

describe('ServerMotionLibrary', () => {
  it('sends the video and the title and tags in one multipart request', async () => {
    const { api, port } = setup();
    await firstValueFrom(port.add({ video, title: 'Walk', tags: ['walk', 'slow'] }));
    const post = api.calls.find((c) => c.method === 'post')!;
    expect(post.path).toBe('/api/motions');
    expect(JSON.parse(String(post.form!.get('request')))).toEqual({ title: 'Walk', tags: ['walk', 'slow'] });
    expect((post.form!.get('video') as File).name).toBe('walk.mp4');
  });

  it('sends an address as `source` and no video part', async () => {
    const { api, port } = setup();
    await firstValueFrom(port.add({ source: ' https://example.com/dance.mp4 ', title: 'Dance' }));
    const post = api.calls.find((c) => c.method === 'post')!;
    expect(JSON.parse(String(post.form!.get('request')))).toEqual({ title: 'Dance', source: 'https://example.com/dance.mp4' });
    expect(post.form!.has('video')).toBe(false);
  });

  it('gives the preview an address the page can open', async () => {
    const { port } = setup();
    const added = await firstValueFrom(port.add({ video }));
    expect(added.preview).toBe('http://server/api/motions/m1/preview');
  });

  it('turns the server\'s 422 and 503 into a refusal with its reason, and adds nothing', async () => {
    const { api, port } = setup();
    for (const status of [422, 503]) {
      api.refuse = new ApiError(status, status === 422 ? 'validation_failed' : 'unavailable', 'nobody appears in the video');
      const error = await firstValueFrom(port.add({ video })).catch((e) => e);
      expect(error).toBeInstanceOf(MotionRefused);
      expect(error.message).toBe('nobody appears in the video');
    }
    expect(api.store).toEqual([]);
  });

  it('says the library could not be read instead of showing it empty', async () => {
    const { api, port } = setup();
    api.listFails = new ApiError(0, 'unknown', 'no answer');
    await expect(firstValueFrom(port.list())).rejects.toBeInstanceOf(MotionsUnreadable);
  });

  it('removes through the server', async () => {
    const { api, port } = setup();
    const added = await firstValueFrom(port.add({ video }));
    await firstValueFrom(port.remove(added.id));
    expect(api.calls.at(-1)).toMatchObject({ method: 'delete', path: '/api/motions/{id}', options: { path: { id: added.id } } });
  });
});
