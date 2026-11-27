import { ApiError } from '@lab/api-client';
import { firstValueFrom, from, lastValueFrom, of, throwError, toArray } from 'rxjs';

import { ApiModelLibrary, type LibraryApi } from './api.adapter';
import { LibraryFailed } from './port';

interface Call {
  method: string;
  path: string;
  options?: { path?: Record<string, string>; query?: Record<string, unknown>; body?: unknown };
}

class FakeApi {
  calls: Call[] = [];
  answer: unknown = {};
  fail?: ApiError;
  private call(method: string, path: string, options?: Call['options']) {
    this.calls.push({ method, path, options });
    return this.fail ? throwError(() => this.fail) : of(this.answer);
  }
  get = ((p: string, o?: Call['options']) => this.call('get', p, o)) as unknown as LibraryApi['get'];
  post = ((p: string, o?: Call['options']) => this.call('post', p, o)) as unknown as LibraryApi['post'];
  put = ((p: string, o?: Call['options']) => this.call('put', p, o)) as unknown as LibraryApi['put'];
  delete = ((p: string, o?: Call['options']) => this.call('delete', p, o)) as unknown as LibraryApi['delete'];
  downloads: string[] = [];
  steps: { loaded: number; total: number | null; body?: Blob }[] = [];
  downloadAt = ((address: string) => {
    this.downloads.push(address);
    return this.fail ? throwError(() => this.fail) : from(this.steps);
  }) as unknown as LibraryApi['downloadAt'];
  getBlob = ((p: string, o?: Call['options']) => this.call('getBlob', p, o).pipe((s) => s)) as unknown as LibraryApi['getBlob'];
}

describe('ApiModelLibrary', () => {
  let api: FakeApi;
  let library: ApiModelLibrary;
  beforeEach(() => {
    api = new FakeApi();
    library = new ApiModelLibrary(api as unknown as LibraryApi);
  });

  it('reads the packs and one pack, installs, cancels and removes one', async () => {
    api.answer = { packs: [{ id: 'a' }] };
    expect(await firstValueFrom(library.packs())).toEqual([{ id: 'a' }]);
    api.answer = { id: 'a', state: 'installing' };
    await firstValueFrom(library.pack('a'));
    await firstValueFrom(library.install('a'));
    await firstValueFrom(library.cancel('a'));
    await firstValueFrom(library.remove('a'));
    expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'get /api/models3d/packs',
      'get /api/models3d/packs/{id}',
      'post /api/models3d/packs/{id}/install',
      'post /api/models3d/packs/{id}/cancel',
      'delete /api/models3d/packs/{id}',
    ]);
  });

  it('imports the zip as the body with the licence in the query, leaving out what was not given', async () => {
    const file = new Blob(['PK']);
    await firstValueFrom(library.importPack({ id: 'mine', licence: 'CC-BY 4.0', author: 'Someone', file }));
    expect(api.calls[0]).toMatchObject({ method: 'post', path: '/api/models3d/packs/import', options: { query: { id: 'mine', licence: 'CC-BY 4.0', author: 'Someone' }, body: file } });
  });

  it('asks the catalog with only the filters that are set', async () => {
    api.answer = { models: [], total: 0 };
    await firstValueFrom(library.catalog({ q: 'pizza', hasClips: true, limit: 12, offset: 0 }));
    expect(api.calls[0].options?.query).toEqual({ q: 'pizza', has_clips: true, limit: 12 });
  });

  it('turns the server’s refusals into a status and its words', async () => {
    api.fail = new ApiError(409, 'conflict', 'pack "a" is already installed');
    const error = await firstValueFrom(library.install('a')).catch((e) => e);
    expect(error).toBeInstanceOf(LibraryFailed);
    expect([error.status, error.said]).toEqual([409, 'pack "a" is already installed']);
  });

  it('reads the backend in use from the settings, and reads an older server that has none as "not said"', async () => {
    api.answer = { model3d: { backend: 'docker', backend_source: 'setting' } };
    expect(await firstValueFrom(library.modelBackend())).toEqual({ backend: 'docker', source: 'setting' });
    api.answer = { ollama: {} };
    expect(await firstValueFrom(library.modelBackend())).toBeNull();
    expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['get /api/settings', 'get /api/settings']);
  });

  it('chooses the backend through the settings, an empty one to go back to the default', async () => {
    api.answer = { model3d: { backend: 'docker', backend_source: 'setting' } };
    expect(await firstValueFrom(library.setModelBackend('docker'))).toEqual({ backend: 'docker', source: 'setting' });
    api.answer = { model3d: { backend: 'dotnet', backend_source: 'default' } };
    expect(await firstValueFrom(library.setModelBackend(''))).toEqual({ backend: 'dotnet', source: 'default' });
    expect(api.calls.map((c) => [c.method, c.path, c.options?.body])).toEqual([
      ['put', '/api/settings', { model3d_backend: 'docker' }],
      ['put', '/api/settings', { model3d_backend: '' }],
    ]);
  });

  it('asks the plan and starts the install with the backend and the parts, only the ones that were given, and confirm only to start', async () => {
    api.answer = { plan: {}, install: {} };
    await firstValueFrom(library.installPlan('triposr'));
    await firstValueFrom(library.installPlan('triposr', { backend: 'docker', parts: ['weights'] }));
    await firstValueFrom(library.startInstall('triposr', { backend: 'dotnet', parts: ['service', 'weights'] }));
    expect(api.calls.map((c) => c.options?.body)).toEqual([{}, { backend: 'docker', parts: ['weights'] }, { backend: 'dotnet', parts: ['service', 'weights'], confirm: true }]);
  });

  it('shows the name of the plan’s licence whether the server sends it as text or as an object', async () => {
    api.answer = { plan: { engine: 'sf3d', licence: { id: 'stability-community', name: 'Stability AI Community', commercial: 'conditions' } } };
    expect((await firstValueFrom(library.installPlan('sf3d'))).licence).toBe('Stability AI Community');
    api.answer = { plan: { engine: 'triposr', licence: 'MIT' } };
    expect((await firstValueFrom(library.installPlan('triposr'))).licence).toBe('MIT');
  });

  it('keeps the whole licence of the plan next to its name, and only what the server sent', async () => {
    api.answer = { plan: { engine: 'sf3d', licence: { id: 'stability-community', name: 'Stability AI Community', url: 'https://example.org/licence', summary: 'Free under a revenue limit.', commercial: 'conditions', accepted: false } } };
    const plan = await firstValueFrom(library.installPlan('sf3d'));
    expect(plan.licence).toBe('Stability AI Community');
    expect(plan.licenceTerms).toEqual({ id: 'stability-community', name: 'Stability AI Community', url: 'https://example.org/licence', summary: 'Free under a revenue limit.', commercial: 'conditions', accepted: false });
    api.answer = { plan: { engine: 'triposr', licence: { name: 'MIT', commercial: 'yes' } } };
    expect((await firstValueFrom(library.installPlan('triposr'))).licenceTerms).toEqual({ name: 'MIT', commercial: 'yes' });
  });

  it('has no licence terms for a server that sends the licence as text, so no acceptance is asked', async () => {
    api.answer = { plan: { engine: 'sf3d', licence: 'Stability AI Community' } };
    const plan = await firstValueFrom(library.installPlan('sf3d'));
    expect(plan.licence).toBe('Stability AI Community');
    expect('licenceTerms' in plan).toBe(false);
  });

  it('sends accept_licence only with the confirmation and only when the person accepted: the plan request never carries it', async () => {
    api.answer = { plan: {}, install: {} };
    await firstValueFrom(library.installPlan('sf3d', { acceptLicence: 'stability-community' }));
    await firstValueFrom(library.startInstall('sf3d', { backend: 'dotnet' }));
    await firstValueFrom(library.startInstall('sf3d', { backend: 'dotnet', acceptLicence: 'stability-community' }));
    expect(api.calls.map((c) => c.options?.body)).toEqual([{}, { backend: 'dotnet', confirm: true }, { backend: 'dotnet', confirm: true, accept_licence: 'stability-community' }]);
  });

  it('keeps the reason of a refusal that asks for the licence, apart from the one of Hugging Face', async () => {
    api.fail = new ApiError(400, 'invalid_request', 'the licence of stability-community has to be accepted: https://example.org/licence', 'licence_acceptance_required');
    const asked = await firstValueFrom(library.startInstall('sf3d')).catch((e) => e);
    expect([asked.status, asked.reason]).toEqual([400, 'licence_acceptance_required']);
    api.fail = new ApiError(422, 'validation_failed', 'Hugging Face refuses the key', 'licence_not_accepted');
    const refused = await firstValueFrom(library.startInstall('sf3d')).catch((e) => e);
    expect(refused.reason).toBe('licence_not_accepted');
  });

  it('keeps the server’s refusal of the backend with its reason', async () => {
    api.fail = new ApiError(422, 'validation_failed', 'Docker does not answer on this machine', 'no_docker');
    const failure = await firstValueFrom(library.setModelBackend('docker')).catch((e) => e);
    expect(failure).toBeInstanceOf(LibraryFailed);
    expect((failure as LibraryFailed).status).toBe(422);
    expect((failure as LibraryFailed).reason).toBe('no_docker');
  });

  it('reads a model\'s file by address with its steps and the bytes at the end', async () => {
    api.steps = [
      { loaded: 10, total: 40 },
      { loaded: 40, total: 40, body: new Blob([new Uint8Array([1, 2, 3, 4])]) },
    ];
    const steps = await lastValueFrom(library.file('generated', 'prueba cofre').pipe(toArray()));
    expect(api.downloads).toEqual(['/api/models3d/models/generated/prueba%20cofre/file']);
    expect(steps.map((s) => [s.loaded, s.total])).toEqual([[10, 40], [40, 40]]);
    expect(new Uint8Array(steps[1].bytes as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(steps[0].bytes).toBeUndefined();
  });

  it('turns a 404 on the file (a server that does not serve it yet) into a LibraryFailed with that status', async () => {
    api.fail = new ApiError(404, 'not_found', 'no such model file');
    await expect(lastValueFrom(library.file('a', 'b'))).rejects.toMatchObject({ name: 'LibraryFailed', status: 404 });
  });
});
