import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { load } from 'js-yaml';
import { of, throwError } from 'rxjs';

import type { ProjectConfig, Run } from '../core/api.models';
import { ApiService } from '../core/api.service';
import { type RunStream, RunStreamService } from '../core/run-stream.service';
import { Models3dProjectStore } from './models3d-project.store';

const CONFIG: ProjectConfig = {
  project: 'objetos',
  output: { mode: 'models3d', file: '', contact_sheet: false },
  defaults: { model: '', voice: '', resolution: '', sampler: '', steps: 0, fps: 0, subject_prompt: '', negative_prompt: '', lora_model_dir: '' },
  scenes: [],
  models: [{ id: 'patin', prompt: 'a retro roller skate' }, { id: 'copa', prompt: 'a golden trophy' }],
};
const CATALOG = [
  { id: 'flux', kind: 'model', name: 'FLUX', installed: true, styles: ['general', 'photo'], style_rank: 1, files: [{ name: 'flux.gguf', role: 'model' }, { name: 'enc.gguf', role: 'text_encoder' }, { name: 'vae.safetensors', role: 'vae' }], preset: { steps: 8, resolution: '768x768', cfg_scale: 1 } },
  { id: 'anime', kind: 'model', name: 'Anime', installed: false, styles: ['anime'], style_rank: 1, files: [{ name: 'anime.safetensors' }] },
];
const MANIFEST = { models: [{ entry: 'patin', variant: 0, name: 'patin', file: 'out/objetos/patin.glb', engine: 'triposr', detail: 'normal', seed: 1, triangles: 30000, seconds: 3.2 }] };

describe('Models3dProjectStore', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let store: Models3dProjectStore;
  let ended: ReturnType<typeof signal<boolean>>;
  let state: ReturnType<typeof signal<{ id: string; state: string; error?: string } | null>>;
  const run = { id: 'run-1', project: 'objetos', state: 'queued' } as Run;

  beforeEach(() => {
    ended = signal(false);
    state = signal(null);
    api = {
      getConfig: vi.fn(() => of({ yaml: '', parsed: structuredClone(CONFIG), valid: true, warnings: ['a warning'] })),
      saveConfig: vi.fn(() => of({ saved: true, warnings: [] })),
      launchRun: vi.fn(() => of({ run, queue_position: 0 })),
      cancelRun: vi.fn(() => of({ run })),
      getCatalog: vi.fn(() => of({ entries: CATALOG })),
      getArtifactJson: vi.fn(() => of(MANIFEST)),
      listLibraryModels: vi.fn(() => of({ models: [{ id: 'generated/patin', pack: 'generated', name: 'patin', entry: 'patin' }], total: 1 })),
      listSources: vi.fn(() => of({ sources: [{ name: 'gato.png', kind: 'image', size: 1, modified: '' }, { name: 'a.glb', kind: 'model', size: 1, modified: '' }] })),
      uploadSource: vi.fn((_p: string, name: string) => of({ name })),
      artifactUrl: vi.fn((p: string, rel: string) => `/api/projects/${p}/artifacts/${rel}`),
    };
    const stream = { events: signal([]), lines: signal([]), state, ended, close: vi.fn() } as unknown as RunStream;
    TestBed.configureTestingModule({ providers: [Models3dProjectStore, { provide: ApiService, useValue: api }, { provide: RunStreamService, useValue: { connect: vi.fn(() => stream) } }] });
    store = TestBed.inject(Models3dProjectStore);
  });

  const loaded = async () => {
    await store.load('objetos');
    return store;
  };

  it('loads the entries, the warnings, the pictures of the sources (not the models) and what was made', async () => {
    await loaded();
    expect(store.isModels3d()).toBe(true);
    expect(store.entries().map((e) => e.id)).toEqual(['patin', 'copa']);
    expect(store.warnings()).toEqual(['a warning']);
    expect(store.pictures().map((p) => p.name)).toEqual(['gato.png']);
    expect(store.manifest().map((m) => m.name)).toEqual(['patin']);
    expect(store.models()).toHaveLength(1);
    expect(api['listLibraryModels']).toHaveBeenCalledWith({ project: 'objetos', limit: 100 });
    expect(store.dirty()).toBe(false);
  });

  it('knows a project that is not of this mode, and reads nothing of results for it', async () => {
    api['getConfig'].mockReturnValue(of({ yaml: '', parsed: { ...structuredClone(CONFIG), output: { mode: 'video', file: '', contact_sheet: false } }, valid: true }));
    await loaded();
    expect(store.isModels3d()).toBe(false);
    expect(api['getArtifactJson']).not.toHaveBeenCalled();
  });

  it('adds an entry with a free id, duplicates one after itself with another id, changes and removes', async () => {
    await loaded();
    expect(store.addEntry()).toBe('object-3');
    store.duplicateEntry(0);
    expect(store.entries().map((e) => e.id)).toEqual(['patin', 'object-4', 'copa', 'object-3']);
    expect(store.entries()[1].prompt).toBe('a retro roller skate');
    store.updateEntry(0, { detail: 'high' });
    store.removeEntry(3);
    expect(store.entries()).toHaveLength(3);
    expect(store.dirty()).toBe(true);
  });

  it('sets the defaults of the mode', async () => {
    await loaded();
    store.setDefaults({ engine: 'sf3d' });
    store.setDefaults({ detail: 'low' });
    expect(store.defaults()).toEqual({ engine: 'sf3d', detail: 'low' });
  });

  it('will not save what the server would refuse, and says which entry', async () => {
    await loaded();
    store.updateEntry(1, { id: 'patin' });
    expect(store.validation().ok).toBe(false);
    expect(store.canSave()).toBe(false);
    expect(await store.save()).toBe(false);
    expect(api['saveConfig']).not.toHaveBeenCalled();
  });

  it('saves the project as the YAML of the mode', async () => {
    await loaded();
    store.updateEntry(0, { detail: 'high' });
    expect(await store.save()).toBe(true);
    const [id, yaml] = api['saveConfig'].mock.calls[0];
    expect(id).toBe('objetos');
    expect((load(yaml) as Record<string, any>)['models'][0]).toEqual({ id: 'patin', prompt: 'a retro roller skate', detail: 'high' });
    expect(store.dirty()).toBe(false);
  });

  it('keeps a refusal of the server with the entry it names', async () => {
    await loaded();
    api['saveConfig'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 422, error: { error: { message: 'config: models[1].engine: triposr or sf3d' } } })));
    store.updateEntry(1, { engine: 'nope' });
    expect(await store.save()).toBe(false);
    expect(store.serverEntry()).toBe(1);
    expect(store.serverError()).toContain('triposr or sf3d');
    store.updateEntry(1, { engine: 'sf3d' });
    expect(store.serverError()).toBe('');
  });

  it('makes the models: saves unsaved edits first, then starts the run and follows it', async () => {
    await loaded();
    store.updateEntry(0, { detail: 'high' });
    expect(await store.launch()).toBe(true);
    expect(api['saveConfig']).toHaveBeenCalledOnce();
    expect(api['launchRun']).toHaveBeenCalledWith('objetos', { only: undefined, keep_tmp: true }, true);
    expect(store.running()).toBe(true);
  });

  it('makes one entry only', async () => {
    await loaded();
    await store.launch('copa');
    expect(api['launchRun']).toHaveBeenCalledWith('objetos', { only: 'copa', keep_tmp: true }, true);
    expect(store.runOnly()).toBe('copa');
  });

  it('does not start a run while one goes, and cancels it', async () => {
    await loaded();
    await store.launch();
    expect(await store.launch()).toBe(false);
    await store.cancel();
    expect(api['cancelRun']).toHaveBeenCalledWith('run-1');
  });

  it('keeps the words of a run the server refuses to start', async () => {
    await loaded();
    api['launchRun'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 422, error: { error: { message: 'config: models[0]: give a prompt or an image' } } })));
    expect(await store.launch()).toBe(false);
    expect(store.runProblem()).toContain('give a prompt or an image');
    expect(store.running()).toBe(false);
  });

  it('reads what was made again when the run ends, and keeps why it failed', async () => {
    await loaded();
    await store.launch();
    api['getArtifactJson'].mockClear();
    state.set({ id: 'run-1', state: 'failed', error: 'the 3D engine triposr cannot be used (not_running): the container is stopped' });
    ended.set(true);
    TestBed.tick();
    await new Promise((r) => setTimeout(r, 0));
    expect(store.runProblem()).toContain('not_running');
    expect(api['getArtifactJson']).toHaveBeenCalled();
    expect(store.ended()).toBe(1);
  });

  it('gives the address of a model of the output with its ticket', async () => {
    await loaded();
    expect(store.downloadUrl('out/objetos/patin.glb')).toBe('/api/projects/objetos/artifacts/out/objetos/patin.glb');
  });

  it('uploads a picture and reads the pictures again; a refusal is kept in the server’s words', async () => {
    await loaded();
    expect(await store.uploadPicture(new File(['x'], 'perro.png'))).toBe('perro.png');
    expect(api['listSources']).toHaveBeenCalledTimes(2);
    api['uploadSource'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { error: { message: 'perro.png already exists' } } })));
    expect(await store.uploadPicture(new File(['x'], 'perro.png'))).toBeNull();
    expect(store.sourceError()).toContain('already exists');
  });

  it('offers the looks with an installed image model, and says when the project has none of its own installed', async () => {
    await loaded();
    expect(store.styles()).toEqual(['photo', 'general']);
    expect(store.pictureModel()).toBeNull();
    expect(store.needsPictureModel()).toBe(true);
  });

  it('draws the pictures with the model of a look: its model set, steps and resolution, and a sampler', async () => {
    await loaded();
    store.setStyle('general');
    const d = store.config()!.defaults;
    expect(d.model_set).toMatchObject({ diffusion_model: 'models/flux.gguf', llm: 'models/enc.gguf', vae: 'models/vae.safetensors' });
    expect(d.steps).toBe(8);
    expect(d.resolution).toBe('768x768');
    expect(d.sampler).toBe('euler');
    expect(store.pictureModel()?.id).toBe('flux');
    expect(store.style()).toBe('photo');
    expect(store.needsPictureModel()).toBe(false);
    expect(store.dirty()).toBe(true);
  });

  it('does not ask for an image model when no entry has a text', async () => {
    api['getConfig'].mockReturnValue(of({ yaml: '', parsed: { ...structuredClone(CONFIG), models: [{ id: 'gato', image: 'gato.png' }] }, valid: true }));
    await loaded();
    expect(store.needsPictureModel()).toBe(false);
  });

  it('ignores a look nothing serves', async () => {
    await loaded();
    store.setStyle('anime');
    expect(store.dirty()).toBe(false);
  });

  it('leaves the catalog empty when it cannot be read', async () => {
    api['getCatalog'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    await loaded();
    expect(store.styles()).toEqual([]);
    expect(store.catalogLoaded()).toBe(true);
  });
});
