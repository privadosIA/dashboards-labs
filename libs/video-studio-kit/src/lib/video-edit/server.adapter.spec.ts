import { ApiError, type components } from '@lab/api-client';
import { Observable, firstValueFrom, of, throwError, toArray } from 'rxjs';

import type { VideoEditRequest } from './model';
import { portBehaviour } from './port-behaviour';
import { ServerVideoEdit, type VideoEditApi } from './server.adapter';
import { ToolsUnreadable, VideoEditRefused } from './validate';

type Edit = components['schemas']['VideoEdit'];
type Tool = components['schemas']['VideoEditTool'];

const tool = (over: Partial<Tool> & Pick<Tool, 'id'>): Tool => ({ name: over.id, description: '', available: true, needs_image: false, settings: [], ...over });
const TOOLS: Tool[] = [
  tool({ id: 'scale', settings: [{ name: 'factor', kind: 'choice', values: [2, 4], default: 2 }] }),
  tool({ id: 'interpolate', settings: [{ name: 'fps', kind: 'choice', values: [24, 30, 60] }] }),
  tool({ id: 'reframe' }),
  tool({ id: 'remove-background' }),
  tool({ id: 'depth', available: false, reason: 'not installed' }),
  tool({ id: 'extend', settings: [{ name: 'seconds', kind: 'integer', min: 2, max: 10 }, { name: 'prompt', kind: 'string' }] }),
  tool({ id: 'motion-control', needs_image: true, accepts_motion: true, notes: ['33 frames'], settings: [{ name: 'strength', kind: 'number', min: 0.2, max: 1 }] }),
];

/** A server in a few lines: what the adapter asks is answered from `store` and every call is recorded. */
class FakeApi {
  store: Edit[] = [];
  calls: { method: string; path: string; options?: unknown; form?: FormData }[] = [];
  nextId = 1;
  optionsFail?: ApiError;
  refuse?: ApiError;
  /** Each read of one edit advances it: queued, running, done. */
  readonly ladder: Edit['state'][] = ['queued', 'running', 'done'];
  reads = new Map<string, number>();

  get = ((path: string, options?: { path?: { id: string } }): Observable<unknown> => {
    this.calls.push({ method: 'get', path, options });
    if (path === '/api/video-edits/options') return this.optionsFail ? throwError(() => this.optionsFail) : of({ tools: TOOLS });
    if (path === '/api/video-edits') return of(this.store);
    const id = options!.path!.id;
    const found = this.store.find((e) => e.id === id);
    if (!found) return throwError(() => new ApiError(404, 'not_found', 'not found'));
    const n = this.reads.get(id) ?? 0;
    this.reads.set(id, n + 1);
    const state = this.ladder[Math.min(n, this.ladder.length - 1)];
    return of({ ...found, state, progress: state === 'done' ? 100 : state === 'running' ? 50 : 0, ...(state === 'done' ? { result: { video: `/api/v/${id}.mp4`, format: 'mp4', has_audio: true } } : {}) });
  }) as unknown as VideoEditApi['get'];

  postForm = ((path: string, form: FormData): Observable<Edit> => {
    this.calls.push({ method: 'post', path, form });
    if (this.refuse) return throwError(() => this.refuse);
    const request = JSON.parse(String(form.get('request')));
    const made: Edit = { id: `e${this.nextId++}`, client: request.client, tool: request.tool, state: 'queued', progress: 0, request, run_id: 'run', created_at: '2026-11-07T10:00:00Z', size_bytes: 0 };
    this.store.unshift(made);
    return of(made);
  }) as unknown as VideoEditApi['postForm'];

  delete = ((path: string, options: { path: { id: string } }) => {
    this.calls.push({ method: 'delete', path, options });
    this.store = this.store.filter((e) => e.id !== options.path.id);
    return of(undefined);
  }) as unknown as VideoEditApi['delete'];

  urlOf = (a: string) => `http://server${a}`;
}

const file = { name: 'a.mp4', blob: new Blob(['x']) };
const image = { name: 'p.png', blob: new Blob(['x']) };
const setup = () => {
  const api = new FakeApi();
  return { api, port: new ServerVideoEdit(api as unknown as VideoEditApi, { pollMs: 0 }) };
};

portBehaviour('ServerVideoEdit', () => setup().port);

describe('ServerVideoEdit', () => {
  it('maps the options and reads them once', async () => {
    const { api, port } = setup();
    const tools = await firstValueFrom(port.tools());
    await firstValueFrom(port.tools());
    expect(tools.find((t) => t.id === 'motion-control')).toMatchObject({ needsImage: true, acceptsMotion: true, notes: ['33 frames'] });
    expect(tools.find((t) => t.id === 'scale')!.settings[0]).toMatchObject({ name: 'factor', kind: 'choice', values: [2, 4], default: 2 });
    expect(api.calls.filter((c) => c.path === '/api/video-edits/options')).toHaveLength(1);
  });

  it('says the tools could not be read, and asks again next time', async () => {
    const { api, port } = setup();
    api.optionsFail = new ApiError(500, 'unknown', 'boom');
    await expect(firstValueFrom(port.tools())).rejects.toBeInstanceOf(ToolsUnreadable);
    api.optionsFail = undefined;
    expect(await firstValueFrom(port.tools())).toHaveLength(7);
  });

  it('sends one multipart request with the video, the tool, its settings and the client name', async () => {
    const { api, port } = setup();
    await firstValueFrom(port.create({ tool: 'scale', settings: { factor: 2 }, video: file }));
    const post = api.calls.find((c) => c.method === 'post')!;
    expect(post.path).toBe('/api/video-edits');
    expect(JSON.parse(String(post.form!.get('request')))).toEqual({ tool: 'scale', settings: { factor: 2 }, client: 'video-studio' });
    expect((post.form!.get('video') as File).name).toBe('a.mp4');
    expect(post.form!.has('image')).toBe(false);
  });

  it('sends the image and the motion, and no video, for Motion Control with a library motion', async () => {
    const { api, port } = setup();
    await firstValueFrom(port.create({ tool: 'motion-control', settings: { strength: 0.8 }, motion: 'm1', image } satisfies VideoEditRequest));
    const form = api.calls.find((c) => c.method === 'post')!.form!;
    expect(JSON.parse(String(form.get('request')))).toMatchObject({ tool: 'motion-control', motion: 'm1' });
    expect(form.has('video')).toBe(false);
    expect((form.get('image') as File).name).toBe('p.png');
  });

  it('refuses before sending when a setting is out of limits', async () => {
    const { api, port } = setup();
    await expect(firstValueFrom(port.create({ tool: 'extend', settings: { seconds: 12 }, video: file }))).rejects.toThrow(/2 to 10/);
    expect(api.calls.some((c) => c.method === 'post')).toBe(false);
  });

  it('turns the server\'s 422 and 503 into a refusal with its reason, and adds nothing', async () => {
    const { api, port } = setup();
    for (const status of [422, 503]) {
      api.refuse = new ApiError(status, status === 422 ? 'validation_failed' : 'unavailable', 'the video is not readable');
      const error = await firstValueFrom(port.create({ tool: 'scale', settings: {}, video: file })).catch((e) => e);
      expect(error).toBeInstanceOf(VideoEditRefused);
      expect(error.message).toBe('the video is not readable');
    }
    expect(await firstValueFrom(port.list())).toEqual([]);
  });

  it('follows by reading the edit until it is done and gives the video an address the page can open', async () => {
    const { port } = setup();
    const created = await firstValueFrom(port.create({ tool: 'scale', settings: {}, video: file }));
    const states = await firstValueFrom(port.follow(created.id).pipe(toArray()));
    expect(states.map((e) => e.state)).toEqual(['queued', 'running', 'done']);
    expect(states.at(-1)!.result!.video).toBe('http://server/api/v/e1.mp4');
  });

  it('ends a follow without another emission when the edit has gone', async () => {
    const { api, port } = setup();
    const created = await firstValueFrom(port.create({ tool: 'scale', settings: {}, video: file }));
    api.store = [];
    expect(await firstValueFrom(port.follow(created.id).pipe(toArray()))).toEqual([]);
  });

  it('reads the list of the server and keeps what it was told', async () => {
    const { api, port } = setup();
    api.store = [{ id: 'old', client: 'unknown', tool: 'depth', state: 'failed', progress: 40, request: { tool: 'depth' }, run_id: 'r', created_at: '2026-11-06T10:00:00Z', size_bytes: 0, error: 'boom' }];
    expect((await firstValueFrom(port.list()))[0]).toMatchObject({ id: 'old', state: 'failed', error: 'boom' });
  });

  it('removes through the server', async () => {
    const { api, port } = setup();
    const created = await firstValueFrom(port.create({ tool: 'scale', settings: {}, video: file }));
    await firstValueFrom(port.remove(created.id));
    expect(api.calls.at(-1)).toMatchObject({ method: 'delete', path: '/api/video-edits/{id}', options: { path: { id: created.id } } });
  });
});
