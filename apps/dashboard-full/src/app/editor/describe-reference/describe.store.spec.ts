import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { EnvironmentReport } from '../../core/api.models';
import { EnvironmentStore } from '../../core/environment.store';
import { RoutingStore } from '../../core/routing.store';
import { EditorStore } from '../editor.store';
import { DescribeStore, describeFailure } from './describe.store';

/** The slice of EditorStore the describe step uses. */
function editorStub() {
  const deleted: string[] = [];
  return {
    deleted,
    projectId: signal('p'),
    sourceError: signal<string | null>(null),
    uploadSource: vi.fn(async (f: File) => f.name),
    uploadClip: vi.fn(async (f: File) => f.name),
    deleteSource: vi.fn(async (n: string) => void deleted.push(n)),
  };
}

const flush = () => new Promise((r) => setTimeout(r));

describe('DescribeStore', () => {
  let store: DescribeStore;
  let http: HttpTestingController;
  let editor: ReturnType<typeof editorStub>;

  beforeEach(() => {
    editor = editorStub();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(DescribeStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    store.split.set(false);
    store.reset();
    http.verify();
  });

  async function start(name = 'photo.png') {
    await store.run('cafe', new File(['x'], name), editor as unknown as EditorStore);
    await flush();
  }

  it('uploads a picture as a source, describes it and offers the text with the model that wrote it', async () => {
    await start();
    expect(editor.uploadSource).toHaveBeenCalled();
    const req = http.expectOne('/api/describe');
    expect(req.request.body).toEqual({ project: 'p', source: 'photo.png' });
    req.flush({ prompt: 'Two adults on a bench', model: 'gemma4:26b', kind: 'image', frames: 1 });
    expect(store.busy()).toBeNull();
    expect(store.proposal()).toEqual({ sceneId: 'cafe', prompt: 'Two adults on a bench', motion: undefined, model: 'gemma4:26b', provider: 'ollama' });
  });

  it('stores a clip raw, not as audio, and keeps its movement prompt', async () => {
    await start('walk.mp4');
    expect(editor.uploadClip).toHaveBeenCalled();
    expect(editor.uploadSource).not.toHaveBeenCalled();
    http.expectOne('/api/describe').flush({ prompt: 'p', motion: 'slow push in', model: 'gemma4:26b', kind: 'video', frames: 5 });
    expect(store.proposal()?.motion).toBe('slow push in');
  });

  it('asks for the detailed model on request', async () => {
    store.detail.set(true);
    await start();
    expect(http.expectOne('/api/describe').request.body).toEqual({ project: 'p', source: 'photo.png', detail: true });
  });

  it('deletes the uploaded file when the proposal is used or discarded', async () => {
    await start();
    http.expectOne('/api/describe').flush({ prompt: 'p', model: 'm', kind: 'image', frames: 1 });
    expect(store.use()?.prompt).toBe('p');
    await flush();
    expect(editor.deleted).toEqual(['photo.png']);
    await start('b.png');
    http.expectOne('/api/describe').flush({ prompt: 'p', model: 'm', kind: 'image', frames: 1 });
    store.discard();
    await flush();
    expect(editor.deleted).toEqual(['photo.png', 'b.png']);
  });

  it('keeps the file after a refusal so another model can be tried, then deletes it', async () => {
    store.models.set([
      { name: 'gemma4:26b', size_bytes: 1, fits: true },
      { name: 'muse-glimmer:30b', size_bytes: 2, fits: true },
    ]);
    store.defaultModel.set('gemma4:26b');
    await start();
    http.expectOne('/api/describe').flush(
      { error: { code: 'describe_refused', message: 'refused' } },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    expect(store.failure()?.kind).toBe('refused');
    expect(store.failure()?.model).toBe('gemma4:26b');
    expect(store.alternatives('gemma4:26b')).toEqual(['muse-glimmer:30b']);
    expect(editor.deleted).toEqual([]);
    store.retry('cafe', 'muse-glimmer:30b');
    const again = http.expectOne('/api/describe');
    expect(again.request.body).toEqual({ project: 'p', source: 'photo.png', model: 'muse-glimmer:30b' });
    again.flush({ prompt: 'ok', model: 'muse-glimmer:30b', kind: 'image', frames: 1 });
    expect(store.proposal()?.model).toBe('muse-glimmer:30b');
  });

  it('says nothing was described for a minor, with no proposal, and does not offer a retry', async () => {
    await start();
    http.expectOne('/api/describe').flush(
      { error: { code: 'describe_minor', message: 'x' } },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    expect(store.proposal()).toBeNull();
    expect(store.failure()?.kind).toBe('minor');
    await flush();
    expect(editor.deleted).toEqual(['photo.png']);
  });

  it('cancelling aborts the request and removes the file', async () => {
    await start();
    const req = http.expectOne('/api/describe');
    store.cancel();
    expect(req.cancelled).toBe(true);
    expect(store.busy()).toBeNull();
    expect(store.proposal()).toBeNull();
    await flush();
    expect(editor.deleted).toEqual(['photo.png']);
  });

  it('does not describe when the upload fails', async () => {
    editor.uploadSource.mockResolvedValueOnce(null as unknown as string);
    editor.sourceError.set('already exists');
    await start();
    http.expectNone('/api/describe');
    expect(store.failure()).toMatchObject({ kind: 'other', message: 'already exists' });
  });

  describe('splitting a clip into scenes', () => {
    const shots = [
      { start: 0, end: 4, prompt: 'first', motion: 'push in' },
      { start: 4, end: 9.5, prompt: 'second' },
      { start: 9.5, end: 12, prompt: 'third' },
    ];

    it('does not split by default and asks for it only when chosen', async () => {
      await start('walk.mp4');
      expect(http.expectOne('/api/describe').request.body).toEqual({ project: 'p', source: 'walk.mp4' });
      store.reset();
      store.split.set(true);
      await start('walk2.mp4');
      expect(http.expectOne('/api/describe').request.body).toEqual({ project: 'p', source: 'walk2.mp4', split: true });
    });

    it('offers one entry per shot, all kept, with the model that wrote them', async () => {
      store.split.set(true);
      await start('walk.mp4');
      http.expectOne('/api/describe').flush({ prompt: 'first', model: 'gemma4:26b', kind: 'video', frames: 3, shots });
      const p = store.proposal()!;
      expect(p.shots?.map((s) => [s.start, s.end, s.prompt, s.keep])).toEqual([
        [0, 4, 'first', true],
        [4, 9.5, 'second', true],
        [9.5, 12, 'third', true],
      ]);
      expect(p.model).toBe('gemma4:26b');
      expect(p.noCuts).toBeUndefined();
    });

    it('hands over only the kept shots, with the edits, and deletes the clip', async () => {
      store.split.set(true);
      await start('walk.mp4');
      http.expectOne('/api/describe').flush({ prompt: 'first', model: 'm', kind: 'video', frames: 3, shots });
      store.setShot(1, { keep: false });
      store.setShot(2, { prompt: 'third, edited' });
      const used = store.use()!;
      expect(used.shots?.map((s) => s.prompt)).toEqual(['first', 'third, edited']);
      await flush();
      expect(editor.deleted).toEqual(['walk.mp4']);
    });

    it('a shot emptied by the user does not become a scene', async () => {
      store.split.set(true);
      await start('walk.mp4');
      http.expectOne('/api/describe').flush({ prompt: 'first', model: 'm', kind: 'video', frames: 3, shots });
      store.setShot(0, { prompt: '   ' });
      expect(store.use()?.shots?.map((s) => s.prompt)).toEqual(['second', 'third']);
    });

    it('a clip with no cut is one scene and says so', async () => {
      store.split.set(true);
      await start('walk.mp4');
      http.expectOne('/api/describe').flush({ prompt: 'only', model: 'm', kind: 'video', frames: 1, shots: [{ start: 0, end: 9, prompt: 'only', motion: 'drift' }] });
      const p = store.proposal()!;
      expect(p.shots).toBeUndefined();
      expect(p.noCuts).toBe(true);
      expect(p.prompt).toBe('only');
      expect(p.motion).toBe('drift');
    });

    it('discarding creates nothing and keeps no file', async () => {
      store.split.set(true);
      await start('walk.mp4');
      http.expectOne('/api/describe').flush({ prompt: 'first', model: 'm', kind: 'video', frames: 3, shots });
      store.discard();
      expect(store.proposal()).toBeNull();
      await flush();
      expect(editor.deleted).toEqual(['walk.mp4']);
    });
  });

  describe('providers', () => {
    const routed = (cloud: boolean) => ({
      routing: {
        assistant: { provider: 'ollama', name: 'Ollama', remote: false, consented: true, model: '' },
        describe_image: cloud ? { provider: 'cloud', name: 'Cloud', remote: true, consented: true, model: 'gpt-4o' } : { provider: 'ollama', name: 'Ollama', remote: false, consented: true, model: '' },
        describe_video: { provider: 'ollama', name: 'Ollama', remote: false, consented: true, model: '' },
        quality: { provider: 'ollama', name: 'Ollama', remote: false, consented: true, model: '' },
        motion_graphics: { provider: 'ollama', name: 'Ollama', remote: false, consented: true, model: '' },
      },
      max_calls: 60,
    });

    it('records which provider described, and a refusal offers models at providers, local included', async () => {
      await start();
      http.expectOne('/api/describe').flush({ prompt: 'x', model: 'gpt-4o', provider: 'cloud', kind: 'image', frames: 1 });
      expect(store.proposal()).toMatchObject({ model: 'gpt-4o', provider: 'cloud' });
      store.discard();
      await flush();
      await start('b.png');
      http.expectOne('/api/describe').flush(
        { error: { code: 'describe_refused', message: 'refused', provider: 'cloud', alternatives: [{ provider: 'ollama', name: 'Ollama', model: 'gemma4:26b' }, { provider: 'lan', name: 'LAN', model: 'llava' }] } },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
      const f = store.failure()!;
      expect(f.kind).toBe('refused');
      expect(f.provider).toBe('cloud');
      expect(store.choices(f).map((a) => `${a.provider}/${a.model}`)).toEqual(['ollama/gemma4:26b', 'lan/llava']);
    });

    it('the public edition suggests nothing after a refusal', async () => {
      TestBed.inject(EnvironmentStore).report.set({ edition: 'public' } as EnvironmentReport);
      await start();
      http.expectOne('/api/describe').flush(
        { error: { code: 'describe_refused', message: 'refused', provider: 'ollama' } },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
      expect(store.choices(store.failure()!)).toEqual([]);
    });

    it('retrying names the provider of the choice, for that call only, and nothing retries by itself', async () => {
      await start();
      http.expectOne('/api/describe').flush(
        { error: { code: 'describe_refused', message: 'refused', provider: 'cloud', alternatives: [{ provider: 'ollama', name: 'Ollama', model: 'gemma4:26b' }] } },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
      http.expectNone('/api/describe'); // no automatic retry
      store.retry('cafe', store.choices(store.failure()!)[0]);
      const again = http.expectOne('/api/describe');
      expect(again.request.body).toEqual({ project: 'p', source: 'photo.png', model: 'gemma4:26b', provider: 'ollama' });
      again.flush({ prompt: 'ok', model: 'gemma4:26b', provider: 'ollama', kind: 'image', frames: 1 });
      expect(store.proposal()).toMatchObject({ provider: 'ollama', model: 'gemma4:26b' });
    });

    it('without server alternatives it falls back to the other installed Ollama models', async () => {
      store.models.set([
        { name: 'gemma4:26b', size_bytes: 1, fits: true },
        { name: 'muse-glimmer:30b', size_bytes: 2, fits: true },
      ]);
      const f = { sceneId: 'cafe', kind: 'refused' as const, message: 'x', model: 'gemma4:26b' };
      expect(store.choices(f).map((a) => a.model)).toEqual(['muse-glimmer:30b']);
    });

    it('does not ask for the detailed model when a provider is routed (that model is Ollama\'s)', async () => {
      TestBed.inject(RoutingStore).set(routed(true));
      store.detail.set(true);
      await start();
      expect(http.expectOne('/api/describe').request.body).toEqual({ project: 'p', source: 'photo.png' });
      store.detail.set(false);
    });

    it('a consent error from the server is shown as written', async () => {
      await start();
      http.expectOne('/api/describe').flush(
        { error: { code: 'consent_required', message: 'consent required: accept it in Settings, under Tasks' } },
        { status: 400, statusText: 'Bad Request' },
      );
      expect(store.failure()).toMatchObject({ kind: 'other', message: expect.stringContaining('Settings') });
    });
  });

});

describe('describeFailure', () => {
  const err = (status: number, code?: string) =>
    new HttpErrorResponse({ status, error: code ? { error: { code, message: 'server text' } } : undefined });

  it('classifies each answer of the server', () => {
    expect(describeFailure('s', err(422, 'describe_minor'), 'm').kind).toBe('minor');
    expect(describeFailure('s', err(422, 'describe_refused'), 'm').kind).toBe('refused');
    expect(describeFailure('s', err(409, 'conflict'), 'm').kind).toBe('busy');
    expect(describeFailure('s', err(503, 'unavailable'), 'm')).toMatchObject({ kind: 'other', message: 'server text' });
  });

  it('names the model that refused', () => {
    expect(describeFailure('s', err(422, 'describe_refused'), 'gemma4:26b').message).toContain('gemma4:26b');
  });
});
