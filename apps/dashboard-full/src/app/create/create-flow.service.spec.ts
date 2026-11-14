import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { signal } from '@angular/core';

import { RequestPlan } from '../core/api.models';
import { ApiService } from '../core/api.service';
import { RunStreamService } from '../core/run-stream.service';
import { fakeStorage } from '../core/storage-fake';
import { ALL_AVAILABLE } from '../core/availability.fake';
import { AvailabilityStore } from '../core/availability.store';
import { previewStarter } from './request-config';
import { Attachment, CODES, CreateFlowService, RequestItem, TOTAL_ORDER, attachmentKind, codeOf, holdFile } from './create-flow.service';

const PLAN: RequestPlan = {
  kind: 'video', kind_source: 'model', title: 'Gato', language: 'es', image_prompt: 'A cat.', motion_prompt: 'It sways.', instrumental: false, warnings: [],
};

function setup(plan: () => unknown, assistant = true) {
  const api = { planRequest: vi.fn(() => plan()) };
  TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
  TestBed.inject(AvailabilityStore).data.set(assistant ? ALL_AVAILABLE : null);
  return { api, flow: TestBed.inject(CreateFlowService) };
}

const http = (status: number, body?: unknown) => throwError(() => new HttpErrorResponse({ status, error: body }));

describe('CreateFlowService.submit', () => {
  it('shows what the assistant understood', async () => {
    const { api, flow } = setup(() => of(PLAN));
    const item = await flow.submit('un gato', []);
    expect(item.phase()).toBe('review');
    expect(item.draft()).toMatchObject({ kind: 'video', title: 'Gato', imagePrompt: 'A cat.', motionPrompt: 'It sways.' });
    expect(item.manual()).toBe('');
    expect(api.planRequest).toHaveBeenCalledWith(expect.objectContaining({ text: 'un gato', attachments: {} }));
  });

  it('tells the assistant which kinds of file were attached', async () => {
    const { api, flow } = setup(() => of(PLAN));
    const file = new File(['x'], 'a.mp3', { type: 'audio/mpeg' });
    await flow.submit('una canción', [{ file, kind: 'audio' }]);
    expect(api.planRequest).toHaveBeenCalledWith(expect.objectContaining({ attachments: { audio: true } }));
  });

  it('fills the card with the words of the user while the assistant waits for a run', async () => {
    const { flow } = setup(() => http(409, { error: { code: 'conflict', message: 'run x is active' } }));
    const item = await flow.submit('un gato en la azotea', []);
    expect(item.phase()).toBe('review');
    expect(item.manual()).toBe('busy');
    expect(item.draft()).toMatchObject({ kind: 'video', imagePrompt: 'un gato en la azotea' });
  });

  it('does not ask the assistant when it is not available, and takes music for an attached song', async () => {
    const { api, flow } = setup(() => of(PLAN), false);
    const song: Attachment = { file: new File(['x'], 'a.wav', { type: 'audio/wav' }), kind: 'audio' };
    const item = await flow.submit('algo así', [song]);
    expect(api.planRequest).not.toHaveBeenCalled();
    expect(item.manual()).toBe('unavailable');
    expect(item.draft()?.kind).toBe('music');
    expect(item.draft()?.caption).toBe('algo así');
  });

  it('falls back on the words when Ollama or the memory fail (503)', async () => {
    const { flow } = setup(() => http(503, { error: { code: 'unavailable', message: 'no memory' } }));
    const item = await flow.submit('algo', []);
    expect(item.manual()).toBe('unavailable');
  });

  it('changes the kind of the card without asking again, keeping the other texts', async () => {
    const { api, flow } = setup(() => http(409, { error: { code: 'conflict', message: 'x' } }));
    const item = await flow.submit('rock duro', []);
    flow.setKind(item, 'music');
    expect(item.draft()).toMatchObject({ kind: 'music', caption: 'rock duro', imagePrompt: 'rock duro' });
    flow.setKind(item, 'image');
    expect(item.draft()?.kind).toBe('image');
    expect(api.planRequest).toHaveBeenCalledTimes(1);
  });

  it('keeps the newest request first', async () => {
    const { flow } = setup(() => of(PLAN));
    const a = await flow.submit('uno', []);
    const b = await flow.submit('dos', []);
    expect(flow.items()).toEqual([b, a]);
    await flow.dismiss(a);
    expect(flow.items()).toEqual([b]);
  });
});

describe('CreateFlowService.submit when the model refuses', () => {
  const REFUSED = { error: { code: 'assist_refused', message: 'the model refused' } };
  const withEdition = (edition: 'private' | 'public', plan: () => unknown) => {
    const api = { planRequest: vi.fn(() => plan()), getCatalog: vi.fn(() => of({ entries: [] })), getEnvironment: vi.fn(() => of({ gpus: [], ram: null, edition })) };
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
    TestBed.inject(AvailabilityStore).data.set(ALL_AVAILABLE);
    return TestBed.inject(CreateFlowService);
  };

  it('in the private edition fills the card with the words of the user instead of failing, and says so', async () => {
    const flow = withEdition('private', () => http(422, REFUSED));
    const item = await flow.submit('lo que yo quiera', []);
    expect(item.phase()).toBe('review');
    expect(item.manual()).toBe('refused');
    expect(item.draft()).toMatchObject({ kind: 'video', imagePrompt: 'lo que yo quiera', style: 'auto' });
  });

  it('in the public edition the refusal ends the request: the words are not sent around the model', async () => {
    const flow = withEdition('public', () => http(422, REFUSED));
    const item = await flow.submit('lo que yo quiera', []);
    expect(item.phase()).toBe('failed');
    expect(item.draft()).toBeNull();
  });

  it('when the edition cannot be known it is treated as public', async () => {
    const { flow } = setup(() => http(422, REFUSED));
    const item = await flow.submit('lo que yo quiera', []);
    expect(item.phase()).toBe('failed');
  });

  it('a plan whose texts could not be written uses the words of the user as the prompt in the private edition only', async () => {
    const plan = () => of({ ...PLAN, image_prompt: '', motion_prompt: '', warnings: ['the image prompt could not be written'] });
    const priv = withEdition('private', plan);
    const item = await priv.submit('lo que yo quiera', []);
    await vi.waitFor(() => expect(item.draft()?.imagePrompt).toBe('lo que yo quiera'));
  });

  it('and leaves them empty in the public edition', async () => {
    const plan = () => of({ ...PLAN, image_prompt: '', motion_prompt: '', warnings: ['the image prompt could not be written'] });
    const pub = withEdition('public', plan);
    const item = await pub.submit('lo que yo quiera', []);
    await new Promise((r) => setTimeout(r, 20));
    expect(item.draft()?.imagePrompt).toBe('');
  });
});

describe('CreateFlowService with a picture attached', () => {
  const photo: Attachment = { file: new File(['x'], 'foto.png', { type: 'image/png' }), kind: 'image' };

  it('reads the shape of the picture so an edit keeps it', async () => {
    const { flow } = setup(() => of({ ...PLAN, kind: 'image' }));
    vi.stubGlobal('createImageBitmap', async () => ({ width: 800, height: 600, close: () => undefined }));
    const item = await flow.submit('ponle una gorra roja', [photo], 'image');
    await vi.waitFor(() => expect(item.draft()?.pictureSize).toEqual({ width: 800, height: 600 }));
    vi.unstubAllGlobals();
  });

  it('starts with the usual model (nothing retouched unless the user asks) and the strength the generator uses', async () => {
    const { flow } = setup(() => of({ ...PLAN, kind: 'image' }));
    const item = await flow.submit('ponle una gorra roja', [photo], 'image');
    expect(item.draft()).toMatchObject({ style: 'auto', strength: 0.6 });
  });
});

describe('CreateFlowService: Retoque belongs to images', () => {
  it('changing a card to a video or a song drops the Retoque look', async () => {
    const { flow } = setup(() => of({ ...PLAN, kind: 'image' }));
    const item = await flow.submit('ponle una gorra roja', [{ file: new File(['x'], 'foto.png', { type: 'image/png' }), kind: 'image' }], 'image');
    item.draft.set({ ...item.draft()!, style: 'edit' });
    flow.setKind(item, 'video');
    expect(item.draft()?.style).toBe('auto');
    flow.setKind(item, 'image');
    item.draft.set({ ...item.draft()!, style: 'edit' });
    flow.setKind(item, 'image');
    expect(item.draft()?.style).toBe('edit');
  });
});

describe('the code words', () => {
  const picture = { file: new File(['x'], 'foto.jpg', { type: 'image/jpeg' }), kind: 'image' } as unknown as Attachment;

  function codeApi() {
    const api = {
      planRequest: vi.fn(),
      createProject: vi.fn(() => of({})),
      uploadWithProgress: vi.fn(() => of({ progress: 1, name: 'foto-1.jpg' })),
      getConfig: vi.fn(() => of({ parsed: previewStarter() })),
      getCatalog: vi.fn(() => of({ entries: [], edition: 'public' })),
      getEnvironment: vi.fn(() => of({ gpus: [], ram: { total_bytes: 0, available_bytes: 0 } })),
      saveConfig: vi.fn(() => of({})),
      launchRun: vi.fn(() => throwError(() => new Error('stop here'))),
    };
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
    TestBed.inject(AvailabilityStore).data.set(ALL_AVAILABLE);
    return api;
  }

  it('recognises each code with or without accent, case and marks', () => {
    for (const t of ['código rojo', 'Code red', 'Codigo Rojo', '  ¡CÓDIGO ROJO! ', 'codigo rojo.']) expect(codeOf(t)).toBe('red');
    for (const t of ['código platino', 'Code Platinum']) expect(codeOf(t)).toBe('platinum');
    for (const t of ['código luminoso', 'CODIGO LUMINOSO!']) expect(codeOf(t)).toBe('bright');
    for (const t of ['código militar', 'code military']) expect(codeOf(t)).toBe('military');
    for (const t of ['código total', 'Code total']) expect(codeOf(t)).toBe('total');
    for (const t of ['código rojo en la azotea', 'un gato', 'rojo', 'código azul']) expect(codeOf(t)).toBeNull();
  });

  it('retouches the picture attached with the precise engine and the instruction of the code, and launches it, without asking the assistant', async () => {
    const api = codeApi();
    const item = await TestBed.inject(CreateFlowService).submit('código rojo', [picture]);
    await vi.waitFor(() => expect(api.createProject).toHaveBeenCalled());
    expect(api.planRequest).not.toHaveBeenCalled();
    expect(item.draft()).toMatchObject({ kind: 'image', style: 'edit', editEngine: 'precise', imagePrompt: CODES.red.instruction });
    expect(CODES.red.instruction).toContain('clown');
    expect(CODES.platinum.instruction).toContain('platinum');
    expect(CODES.bright.instruction).toContain('bald');
    expect(CODES.military.instruction).toContain('camouflage');
    await vi.waitFor(() => expect(api.uploadWithProgress).toHaveBeenCalledWith(expect.any(String), expect.any(String), picture.file, 'picture')); // it went straight on: the picture is uploaded with no card to confirm
  });

  it('«código total» launches the four retouches on the same picture, one card each', async () => {
    const api = codeApi();
    const flow = TestBed.inject(CreateFlowService);
    const first = await flow.submit('código total', [picture]);
    await vi.waitFor(() => expect(api.createProject).toHaveBeenCalledTimes(4));
    expect(api.planRequest).not.toHaveBeenCalled();
    expect(flow.items().map((i) => i.draft()?.imagePrompt)).toEqual(TOTAL_ORDER.map((c) => CODES[c].instruction));
    expect(flow.items()[0]).toBe(first);
    expect(flow.items().every((i) => i.attachments[0] === picture)).toBe(true);
  });

  it('asks for a picture when there is none', async () => {
    const { api, flow } = setup(() => of(PLAN));
    const item = await flow.submit('código rojo', []);
    expect(api.planRequest).not.toHaveBeenCalled();
    expect(item.phase()).toBe('failed');
    expect(item.error()).toContain('foto');
  });
});

describe('CreateFlowService.dismiss', () => {
  function withApi(deleteProject: () => unknown) {
    const api = { planRequest: vi.fn(() => of(PLAN)), deleteProject: vi.fn(deleteProject) };
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
    TestBed.inject(AvailabilityStore).data.set(ALL_AVAILABLE);
    return { api, flow: TestBed.inject(CreateFlowService) };
  }

  it('deletes the project of a request that has one, and then takes the card off', async () => {
    const { api, flow } = withApi(() => of(undefined));
    const item = await flow.submit('un gato', []);
    item.project.set('mobile-20261020-1532-gato');
    await flow.dismiss(item);
    expect(api.deleteProject).toHaveBeenCalledWith('mobile-20261020-1532-gato');
    expect(flow.items()).toEqual([]);
  });

  it('keeps the card and says why when the server refuses', async () => {
    const { flow } = withApi(() => http(409, { error: { code: 'conflict', message: 'project has an active run' } }));
    const item = await flow.submit('un gato', []);
    item.project.set('mobile-20261020-1532-gato');
    await flow.dismiss(item);
    expect(flow.items()).toEqual([item]);
    expect(item.error()).toContain('active run');
  });

  it('only takes the card off when there is no project to delete', async () => {
    const { api, flow } = withApi(() => of(undefined));
    const item = await flow.submit('un gato', []);
    await flow.dismiss(item);
    expect(api.deleteProject).not.toHaveBeenCalled();
    expect(flow.items()).toEqual([]);
  });

  it('a project that is already gone is not an error', async () => {
    const { flow } = withApi(() => http(404, { error: { code: 'not_found', message: 'no such project' } }));
    const item = await flow.submit('un gato', []);
    item.project.set('mobile-x');
    await flow.dismiss(item);
    expect(flow.items()).toEqual([]);
  });
});

describe('CreateFlowService.clearScreen', () => {
  function withApi() {
    const api = { planRequest: vi.fn(() => of(PLAN)), deleteProject: vi.fn(() => of(undefined)), cancelRun: vi.fn(() => of(undefined)) };
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
    TestBed.inject(AvailabilityStore).data.set(ALL_AVAILABLE);
    return { api, flow: TestBed.inject(CreateFlowService) };
  }

  beforeEach(() => vi.stubGlobal('sessionStorage', fakeStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('empties the list and forgets the session without deleting or cancelling anything', async () => {
    const { api, flow } = withApi();
    sessionStorage.setItem('mo.create.session', JSON.stringify(['mobile-a']));
    const item = await flow.submit('un gato', []);
    item.project.set('mobile-run');
    item.run.set({ id: 'r1' } as never);
    item.phase.set('running');
    await flow.submit('otro', []);
    flow.clearScreen();
    expect(flow.items()).toEqual([]);
    expect(sessionStorage.getItem('mo.create.session')).toBe('[]');
    expect(api.deleteProject).not.toHaveBeenCalled();
    expect(api.cancelRun).not.toHaveBeenCalled();
  });
});

describe('attachmentKind', () => {
  it('tells pictures, videos and songs by type or extension, and nothing else', () => {
    expect(attachmentKind({ name: 'a.PNG', type: '' })).toBe('image');
    expect(attachmentKind({ name: 'x', type: 'video/mp4' })).toBe('video');
    expect(attachmentKind({ name: 'a.mp3', type: '' })).toBe('audio');
    expect(attachmentKind({ name: 'a.pdf', type: 'application/pdf' })).toBeNull();
  });
});

describe('CreateFlowService.restore', () => {
  const summary = (id: string) => ({ id, mode: 'images', scenes: 1 });

  function restoring(listed: string[]) {
    const api = {
      listProjects: vi.fn(() => of(listed.map(summary))),
      listRuns: vi.fn(() => of([])),
    };
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
    return { api, flow: TestBed.inject(CreateFlowService) };
  }

  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  it('shows nothing of earlier visits: the requests of other tabs stay in the gallery', async () => {
    const { api, flow } = restoring(['mobile-20261020-gato', 'mobile-20261021-perro']);
    await flow.restore();
    expect(flow.items()).toEqual([]);
    expect(api.listProjects).not.toHaveBeenCalled();
  });

  it('brings back the requests made in this tab, and only those', async () => {
    sessionStorage.setItem('mo.create.session', JSON.stringify(['mobile-20261021-perro']));
    const { flow } = restoring(['mobile-20261020-gato', 'mobile-20261021-perro', 'otro-proyecto']);
    await flow.restore();
    expect(flow.items().map((i) => i.project())).toEqual(['mobile-20261021-perro']);
  });
});

describe('holdFile', () => {
  it('keeps a copy of the bytes, with the name and the type, so the upload does not depend on the picker', async () => {
    const original = new File(['abc'], 'foto.jpg', { type: 'image/jpeg', lastModified: 5 });
    const held = await holdFile(original);
    expect(held).not.toBe(original);
    expect(held?.name).toBe('foto.jpg');
    expect(held?.type).toBe('image/jpeg');
    expect(held?.size).toBe(3);
    expect(await held?.text()).toBe('abc');
  });

  it('answers null for an empty file, which the server would refuse at the end', async () => {
    expect(await holdFile(new File([], 'vacia.png', { type: 'image/png' }))).toBeNull();
  });

  it('answers null for a file that cannot be read', async () => {
    const broken = new File(['x'], 'rota.png', { type: 'image/png' });
    vi.spyOn(broken, 'arrayBuffer').mockRejectedValue(new Error('NotReadableError'));
    expect(await holdFile(broken)).toBeNull();
  });
});

describe('following a run', () => {
  const run = { id: 'run1', project: 'p', state: 'queued' } as never;

  /** A request whose run is followed, with a stream that only ever said «queued» (what the server says when it connects). */
  function followed(answers: { run: Record<string, unknown>; queue_position?: number }[]) {
    const state = signal<unknown>({ id: 'run1', state: 'queued', queue_position: 2 });
    const getRun = vi.fn();
    for (const a of answers) getRun.mockReturnValueOnce(of(a));
    getRun.mockReturnValue(of(answers[answers.length - 1]));
    const api = { getRun, getManifest: vi.fn(() => of({ images: [{ file: 'out/p/imagen_1.png' }] })), artifactUrl: vi.fn((id: string, f: string) => `/api/projects/${id}/artifacts/${f}`) };
    const stream = { state, events: signal([]), lines: signal([]), ended: signal(false), close: vi.fn() };
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }, { provide: RunStreamService, useValue: { connect: () => stream } }] });
    const flow = TestBed.inject(CreateFlowService);
    const item = new RequestItem('r1', 'código total', [], 'es');
    item.draft.set({ kind: 'image' } as never);
    item.project.set('p');
    (flow as unknown as { follow(i: RequestItem, r: unknown, q: number): void }).follow(item, run, 2);
    return { api, item };
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows a run as running when the run says so, though the stream only said it was queued', async () => {
    const { item } = followed([{ run: { state: 'running' } }]);
    expect(item.phase()).toBe('queued');
    await vi.advanceTimersByTimeAsync(5000);
    expect(item.phase()).toBe('running');
    expect(item.queuePosition()).toBeUndefined();
    item.stopWatching?.();
  });

  it('shows the result of a run that ended while the stream was lost', async () => {
    const { item } = followed([{ run: { state: 'running' } }, { run: { state: 'succeeded', artifact: 'out/p/imagen_1.png' } }]);
    await vi.advanceTimersByTimeAsync(5000 * 2);
    expect(item.phase()).toBe('done');
    expect(item.result()).toEqual({ kind: 'image', url: '/api/projects/p/artifacts/out/p/imagen_1.png' });
  });

  it('says a run that failed, with its error', async () => {
    const { item } = followed([{ run: { state: 'failed', error: 'sd se quedó sin memoria' } }]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(item.phase()).toBe('failed');
    expect(item.error()).toBe('sd se quedó sin memoria');
  });

  it('asks the run at once when the screen is back, without waiting for the next turn of the timer', async () => {
    const { api, item } = followed([{ run: { state: 'running' } }]);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(api.getRun).toHaveBeenCalledTimes(1);
    expect(item.phase()).toBe('running');
    item.stopWatching?.();
  });

  it('stops asking once the request ends or is dismissed', async () => {
    const { api, item } = followed([{ run: { state: 'running' } }]);
    await vi.advanceTimersByTimeAsync(5000);
    const asked = api.getRun.mock.calls.length;
    item.stopWatching?.();
    await vi.advanceTimersByTimeAsync(30000);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(api.getRun.mock.calls.length).toBe(asked);
  });
});

describe('CreateFlowService: where the estimated time comes from', () => {
  type Estimator = { estimateOf(id: string, yaml: string, kind: 'video' | 'image' | 'music', table: number): Promise<{ seconds: number; source?: string; executions?: number }> };
  function withEstimate(estimate: () => unknown) {
    const api = { estimate: vi.fn(estimate) };
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
    return { api, flow: TestBed.inject(CreateFlowService) as unknown as Estimator };
  }

  it("uses the server's figure and says where it comes from, with the executions behind it", async () => {
    const { api, flow } = withEstimate(() => of({ seconds: 140, source: 'history', executions: 5, history_phases: 2, table_phases: 0, cached_phases: 0 }));
    expect(await flow.estimateOf('mobile-1', 'project: x', 'video', 300)).toEqual({ seconds: 140, source: 'history', executions: 5 });
    expect(api.estimate).toHaveBeenCalledWith({ yaml: 'project: x', project: 'mobile-1' });
  });

  it('keeps the source of a mixed or table estimate and no executions when there are none', async () => {
    expect(await withEstimate(() => of({ seconds: 90, source: 'mixed', executions: 3, history_phases: 1, table_phases: 1, cached_phases: 0 })).flow.estimateOf('p', 'y', 'image', 50)).toEqual({ seconds: 90, source: 'mixed', executions: 3 });
    TestBed.resetTestingModule();
    expect(await withEstimate(() => of({ seconds: 60, source: 'table', history_phases: 0, table_phases: 2, cached_phases: 0 })).flow.estimateOf('p', 'y', 'video', 50)).toEqual({ seconds: 60, source: 'table' });
  });

  it('falls back to the table figure, with no source, when the server cannot say', async () => {
    const { flow } = withEstimate(() => throwError(() => new Error('down')));
    expect(await flow.estimateOf('p', 'y', 'video', 300)).toEqual({ seconds: 300 });
  });

  it('asks nothing for a song or for a request with no time to estimate', async () => {
    const { api, flow } = withEstimate(() => of({}));
    expect(await flow.estimateOf('p', 'y', 'music', 120)).toEqual({ seconds: 120 });
    expect(await flow.estimateOf('p', 'y', 'video', 0)).toEqual({ seconds: 0 });
    expect(api.estimate).not.toHaveBeenCalled();
  });
});
