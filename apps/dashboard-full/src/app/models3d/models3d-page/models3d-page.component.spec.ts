import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideLabForms } from '@lab/forms-kit';
import { InMemoryModelLibrary, MODEL_LIBRARY_OPTIONS, MODEL_LIBRARY_PORT } from '@lab/model-library-kit';
import { of, throwError } from 'rxjs';

import type { ProjectConfig, Run } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { type RunStream, RunStreamService } from '../../core/run-stream.service';
import { Models3dProjectStore } from '../models3d-project.store';
import { Models3dPageComponent } from './models3d-page.component';

const CONFIG: ProjectConfig = {
  project: 'objetos',
  output: { mode: 'models3d', file: '', contact_sheet: false },
  defaults: { model: '', voice: '', resolution: '', sampler: '', steps: 0, fps: 0, subject_prompt: '', negative_prompt: '', lora_model_dir: '' },
  scenes: [],
  models: [{ id: 'patin', prompt: 'a retro roller skate' }],
};
const MANIFEST = { models: [{ entry: 'patin', variant: 0, name: 'patin', file: 'out/objetos/patin.glb', engine: 'triposr', engine_version: 'triposr@3f1c9a2', detail: 'normal', seed: 42, triangles: 30000, seconds: 3.2 }] };

describe('Models3dPageComponent (the tests run in Spanish: the app’s translation is loaded)', () => {
  let fixture: ComponentFixture<Models3dPageComponent>;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let ended: ReturnType<typeof signal<boolean>>;
  let state: ReturnType<typeof signal<{ id: string; state: string; error?: string } | null>>;
  const run = { id: 'run-1', project: 'objetos', state: 'queued' } as Run;
  const root = () => fixture.nativeElement as HTMLElement;
  const q = (id: string) => root().querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const button = (id: string) => q(id) as HTMLButtonElement;

  async function settle(ms = 0): Promise<void> {
    await fixture.whenStable();
    await new Promise((done) => setTimeout(done, ms));
    TestBed.tick();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function open(config: ProjectConfig = CONFIG, made = true): Promise<void> {
    ended = signal(false);
    state = signal(null);
    api = {
      getConfig: vi.fn(() => of({ yaml: '', parsed: structuredClone(config), valid: true })),
      saveConfig: vi.fn(() => of({ saved: true, warnings: [] })),
      launchRun: vi.fn(() => of({ run, queue_position: 0 })),
      cancelRun: vi.fn(() => of({ run })),
      getArtifactJson: vi.fn(() => (made ? of(MANIFEST) : throwError(() => new HttpErrorResponse({ status: 404 })))),
      listLibraryModels: vi.fn(() => of({ models: made ? [{ id: 'generated/patin', pack: 'generated', name: 'patin', tags: [], clips: [], triangles: 30000, needs: [], licence: 'MIT', author: 'TripoSR', attribution: false, entry: 'patin', prompt: 'a retro roller skate', engine: 'triposr', engine_version: 'triposr@3f1c9a2', source: 'generated' }] : [], total: made ? 1 : 0 })),
      getCatalog: vi.fn(() => of({ entries: [{ id: 'flux', kind: 'model', name: 'FLUX', installed: true, styles: ['general'], style_rank: 1, files: [{ name: 'flux.gguf', role: 'model' }, { name: 'enc.gguf', role: 'text_encoder' }, { name: 'vae.safetensors', role: 'vae' }], preset: { steps: 8 } }] })),
      listSources: vi.fn(() => of({ sources: [{ name: 'gato.png', kind: 'image', size: 1, modified: '' }] })),
      uploadSource: vi.fn((_p: string, name: string) => of({ name })),
      artifactUrl: vi.fn((p: string, rel: string) => `/api/projects/${p}/artifacts/${rel}`),
    };
    const stream = { events: signal([]), lines: signal([]), state, ended, close: vi.fn() } as unknown as RunStream;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideLabForms({ lang: 'es' }),
        { provide: MODEL_LIBRARY_OPTIONS, useValue: { lang: 'es' } },
        { provide: MODEL_LIBRARY_PORT, useValue: new InMemoryModelLibrary() },
        { provide: ApiService, useValue: api },
        { provide: RunStreamService, useValue: { connect: vi.fn(() => stream) } },
      ],
    });
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:thumb'), revokeObjectURL: vi.fn() }));
    fixture = TestBed.createComponent(Models3dPageComponent);
    fixture.componentRef.setInput('id', 'objetos');
    fixture.detectChanges();
    await settle(5);
    await settle(5);
  }

  afterEach(() => vi.unstubAllGlobals());

  it('shows the entries of the project and the defaults, and nothing is made or changed yet', async () => {
    await open();
    expect(root().querySelectorAll('app-model-entry-form').length).toBe(1);
    expect(q('m3p-default-engine')).not.toBeNull();
    expect(button('m3p-save').disabled).toBe(true);
    expect(q('m3p-unsaved')).toBeNull();
    expect(button('m3p-run').disabled).toBe(false);
  });

  it('tells a project that is not of this mode to go to the scene editor', async () => {
    await open({ ...CONFIG, output: { mode: 'video', file: '', contact_sheet: false }, models: undefined, scenes: [] });
    expect(q('m3p-to-editor')?.getAttribute('href')).toBe('/projects/objetos/editor');
    expect(root().querySelector('app-model-entry-form')).toBeNull();
  });

  it('adds an entry: the project has changes, it cannot be saved or run until the entry says what the object is', async () => {
    await open();
    button('m3p-add').click();
    await settle(5);
    expect(root().querySelectorAll('app-model-entry-form').length).toBe(2);
    expect(q('m3p-unsaved')).not.toBeNull();
    expect(button('m3p-save').disabled).toBe(true);
    expect(button('m3p-run').disabled).toBe(true);
    expect(root().querySelector('[data-testid="entry-problem"]')?.textContent).toContain('Escribe el texto');
  });

  it('makes the models: it saves nothing when nothing changed, starts the run and shows the run panel with a cancel', async () => {
    await open();
    button('m3p-run').click();
    await settle(5);
    expect(api['saveConfig']).not.toHaveBeenCalled();
    expect(api['launchRun']).toHaveBeenCalledWith('objetos', { only: undefined, keep_tmp: true }, true);
    expect(q('m3p-run-panel')).not.toBeNull();
    expect(button('m3p-cancel').disabled).toBe(false);
    expect(button('m3p-run').disabled).toBe(true);
  });

  it('makes one entry from its own button', async () => {
    await open();
    button('entry-make').click();
    await settle(5);
    expect(api['launchRun']).toHaveBeenCalledWith('objetos', { only: 'patin', keep_tmp: true }, true);
  });

  it('says why a run failed when an engine cannot be used, in words, and points to the 3D library', async () => {
    await open();
    button('m3p-run').click();
    await settle(5);
    state.set({ id: 'run-1', state: 'failed', error: 'the 3D engine triposr cannot be used (not_running): the container of the 3D service is stopped' });
    ended.set(true);
    await settle(5);
    expect(q('m3p-run-problem')?.textContent).toContain('servicio del motor está parado');
    expect(q('m3p-to-library')?.getAttribute('href')).toBe('/models/3d');
  });

  it('shows what was made: the model with its card, what made it, its seed and seconds, and a download of the .glb', async () => {
    await open();
    const item = q('made-patin') as HTMLElement;
    expect(item.querySelector('lab-model-card')).not.toBeNull();
    expect(item.textContent).toContain('triposr (triposr@3f1c9a2)');
    expect(item.textContent).toContain('semilla 42');
    const link = item.querySelector('[data-testid="made-download"]') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/api/projects/objetos/artifacts/out/objetos/patin.glb');
    expect(q('made-patin')?.querySelector('[data-testid="made-download"]')?.getAttribute('download')).toBe('patin.glb');
    expect(link.getAttribute('download')).toBe('patin.glb');
  });

  it('says nothing has been made when no run left a manifest', async () => {
    await open(CONFIG, false);
    expect(q('m3p-nothing')).not.toBeNull();
    expect(root().querySelector('[data-testid^="made-"]')).toBeNull();
  });

  it('shows a refusal of the server under the entry it names, and a general one at the top', async () => {
    await open();
    const store = fixture.debugElement.injector.get(Models3dProjectStore);
    api['saveConfig'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 422, error: { error: { message: 'config: models[0].engine: triposr or sf3d' } } })));
    store.updateEntry(0, { engine: 'nope' });
    await store.save();
    await settle(5);
    expect(q('entry-refusal')?.textContent).toContain('triposr or sf3d');
    expect(q('m3p-save-error')).toBeNull();
    api['saveConfig'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 422, error: { error: { message: 'config: scenes: a project of the mode models3d has no scenes' } } })));
    store.updateEntry(0, { engine: 'sf3d' });
    await store.save();
    await settle(5);
    expect(q('entry-refusal')).toBeNull();
    expect(q('m3p-save-error')?.textContent).toContain('no scenes');
  });

  it('says the pictures of the texts cannot be drawn until a look is chosen, and drawing them is one choice', async () => {
    await open();
    expect(q('m3p-needs-model')?.textContent).toContain('elige un aspecto');
    const look = q('m3p-look') as HTMLSelectElement;
    expect([...look.options].map((o) => o.value)).toEqual(['', 'general']);
    look.value = 'general';
    look.dispatchEvent(new Event('change'));
    await settle(5);
    expect(q('m3p-needs-model')).toBeNull();
    expect(q('m3p-picture-model')?.textContent).toContain('FLUX');
    expect(q('m3p-unsaved')).not.toBeNull();
  });

  it('says there is no image model to choose when none is installed', async () => {
    await open();
    const store = fixture.debugElement.injector.get(Models3dProjectStore);
    store.catalog.set([]);
    await settle(5);
    expect(q('m3p-needs-model')?.textContent).toContain('ningún modelo de imagen');
    expect((q('m3p-look') as HTMLSelectElement).disabled).toBe(true);
  });
});
