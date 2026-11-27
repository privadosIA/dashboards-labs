import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, provideRouter } from '@angular/router';
import { provideAppDynamicForms } from '../../shared/dynamic/dynamic-forms.providers';
import { of } from 'rxjs';

import { EnvironmentReport, ProjectSummary } from '../../core/api.models';
import { ALL_AVAILABLE, missing } from '../../core/availability.fake';
import { AvailabilityStore } from '../../core/availability.store';
import { ClientLabelsStore } from '../../core/client-labels.store';
import { EnvironmentStore } from '../../core/environment.store';
import { ModeFilterStore } from '../../core/mode-filter.store';
import { SimpleModeStore } from '../../core/simple-mode.store';
import { ServerModelLibrary } from '../../core/model-library.adapter';
import { ProjectsStore } from '../../core/projects.store';
import { ProjectDetailsDialogComponent } from '../project-details-dialog/project-details-dialog.component';
import { ProjectHistoryDialogComponent } from '../project-history-dialog/project-history-dialog.component';
import { StorageDialogComponent } from '../storage-dialog/storage-dialog.component';
import { ProjectsListComponent, motionStarterConfig, musicStarterYaml } from './projects-list.component';

function storeOf(fixture: { componentInstance: unknown }): ProjectsStore {
  return (fixture.componentInstance as { store: ProjectsStore })['store'];
}

const TWO: ProjectSummary[] = [
  { id: 'demo', name: 'demo', mode: 'video', scene_count: 3 },
  { id: 'roto', name: '', mode: '', scene_count: 0, invalid: true, error: 'cannot parse' },
];

describe('ProjectsListComponent', () => {
  let dialogResult: unknown;
  const dialogOpen = vi.fn(() => ({ afterClosed: () => of(dialogResult) }));
  let navigate: ReturnType<typeof vi.spyOn>;
  let http: HttpTestingController;
  /** What the engines of the 3D service answer: `null` is a server with none (nothing about 3D models is offered). */
  let engines: unknown = null;
  /** The client labels the server reports: the store of the labels is proved on its own, here it only says what the list draws. */
  const labelsStub = { labels: signal<unknown[]>([]), loaded: signal(true), load: vi.fn(() => Promise.resolve()), colorOf: (name: string) => (name === 'other-app' ? '#aa3355' : '#336699') };
  const label = (name: string, total: number) => ({ name, color: name === 'other-app' ? '#aa3355' : '#336699', counts: {}, total, last_used: '2026-11-27T10:00:00Z' });

  beforeEach(async () => {
    engines = null;
    sessionStorage.clear();
    localStorage.removeItem('mo.clients');
    localStorage.removeItem('mo.animations');
    labelsStub.labels.set([]);
    labelsStub.load.mockClear();
    dialogOpen.mockClear();
    await TestBed.configureTestingModule({
      imports: [ProjectsListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: { open: dialogOpen } },
        provideRouter([]),
        provideAppDynamicForms(),
        { provide: ServerModelLibrary, useValue: { engines: () => of(engines) } },
        { provide: ClientLabelsStore, useValue: labelsStub },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => http.verify());

  async function create(list: ProjectSummary[] = TWO) {
    const fixture = TestBed.createComponent(ProjectsListComponent);
    fixture.detectChanges();
    http.expectOne('/api/projects?managed=all').flush(list);
    http.expectOne('/api/storage?managed=all').flush({ projects: list.map((p, i) => ({ id: p.id, total_bytes: (i + 1) * 1_000_000 })), disk: { free_bytes: 5e9, total_bytes: 1e10 } });
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('lists projects with id, mode and scene count, flagging invalid YAML', async () => {
    const fixture = await create();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('demo');
    expect(text).toContain('3');
    expect(text).toContain('scenes.yaml inválido');
  });

  it('shows the empty state inviting create or import', async () => {
    const fixture = await create([]);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Todavía no hay proyectos');
    expect(text).toContain('Importar dataset');
  });

  it('opens with a page header (title, description, create as the only filled action) and a useful empty state', async () => {
    const fixture = await create([]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toBe('Proyectos');
    expect(el.querySelector('[data-testid=page-desc]')?.textContent).toContain('colección de escenas');
    const header = el.querySelector('[data-testid=page-actions]')!;
    expect(header.querySelector('[data-testid=create-project]')?.className).toContain('mat-mdc-unelevated-button');
    expect(header.querySelector('[data-testid=import-project]')?.className).toContain('mat-mdc-outlined-button');
    const empty = el.querySelector('mo-empty-state')!;
    expect(empty.querySelector('mat-icon')?.textContent?.trim()).toBe('video_library');
    expect(empty.querySelector('[data-testid=empty-actions]')?.textContent).toContain('Crear proyecto');
    expect(empty.querySelector('[data-testid=empty-actions]')?.textContent).toContain('Importar dataset');
  });

  it('creates through the API and navigates to the editor', async () => {
    const fixture = await create([]);
    dialogResult = 'nuevo';
    const done = (fixture.componentInstance as unknown as { createProject(): Promise<void> }).createProject();
    await Promise.resolve();
    http
      .expectOne({ method: 'POST', url: '/api/projects' })
      .flush({ id: 'nuevo' }, { status: 201, statusText: 'Created' });
    await Promise.resolve();
    http
      .expectOne('/api/projects?managed=all')
      .flush([{ id: 'nuevo', name: 'nuevo', mode: 'video', scene_count: 1 }]);
    await done;
    expect(navigate).toHaveBeenCalledWith(['/projects', 'nuevo', 'editor']);
  });

  it('surfaces a name collision without navigating', async () => {
    const fixture = await create([]);
    dialogResult = 'demo';
    const done = (fixture.componentInstance as unknown as { createProject(): Promise<void> })
      .createProject()
      .catch(() => 'rejected');
    await Promise.resolve();
    http
      .expectOne({ method: 'POST', url: '/api/projects' })
      .flush(
        { error: { code: 'conflict', message: 'project "demo" already exists' } },
        { status: 409, statusText: 'Conflict' },
      );
    expect(await done).toBe('rejected');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('deletes only after confirmation and surfaces the in-use rejection', async () => {
    const fixture = await create();
    const cmp = fixture.componentInstance as unknown as {
      deleteProject(p: ProjectSummary): Promise<void>;
    };

    // Declined: no DELETE issued.
    dialogResult = false;
    await cmp.deleteProject(TWO[0]);
    http.expectNone({ method: 'DELETE', url: '/api/projects/demo' });

    // Confirmed but busy: 409 propagates, project stays listed.
    dialogResult = true;
    const done = cmp.deleteProject(TWO[0]).catch(() => 'rejected');
    await Promise.resolve();
    http
      .expectOne({ method: 'DELETE', url: '/api/projects/demo' })
      .flush(
        { error: { code: 'conflict', message: 'active run run-1' } },
        { status: 409, statusText: 'Conflict' },
      );
    expect(await done).toBe('rejected');
    expect(storeOf(fixture).projects().some((p) => p.id === 'demo')).toBe(true);

    // Confirmed and free: DELETE + reload.
    const done2 = cmp.deleteProject(TWO[0]);
    await Promise.resolve();
    http
      .expectOne({ method: 'DELETE', url: '/api/projects/demo' })
      .flush(null, { status: 204, statusText: 'No Content' });
    await Promise.resolve();
    http.expectOne('/api/projects?managed=all').flush([TWO[1]]);
    await done2;
    expect(storeOf(fixture).projects().some((p) => p.id === 'demo')).toBe(false);
  });

  describe('exporting', () => {
    let click: ReturnType<typeof vi.spyOn>;
    let snackOpen: ReturnType<typeof vi.spyOn>;
    let clicked: string[];

    beforeEach(() => {
      clicked = [];
      (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:x';
      (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
      click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push(this.download);
      });
      snackOpen = vi.spyOn(TestBed.inject(MatSnackBar), 'open').mockReturnValue(undefined as never);
    });
    afterEach(() => click.mockRestore());

    const exporter = (fixture: { componentInstance: unknown }) =>
      (fixture.componentInstance as unknown as { exportProject(p: ProjectSummary, f: 'dataset' | 'zip'): Promise<void> }).exportProject(TWO[0], 'dataset');

    it('offers both downloads for each project in a menu', async () => {
      const fixture = await create();
      const el = fixture.nativeElement as HTMLElement;
      const trigger = el.querySelector('[data-testid="export-demo"]') as HTMLElement;
      expect(trigger.getAttribute('aria-label')).toBe('Exportar proyecto');
      trigger.click();
      fixture.detectChanges();
      await fixture.whenStable();
      const items = Array.from(document.querySelectorAll('.mat-mdc-menu-item')).map((i) => i.textContent ?? '');
      expect(items.some((t) => t.includes('Solo las escenas'))).toBe(true);
      expect(items.some((t) => t.includes('Proyecto completo'))).toBe(true);
    });

    it('downloads the dataset and says what it could not carry', async () => {
      const fixture = await create();
      const done = exporter(fixture);
      const req = http.expectOne('/api/projects/demo/export?format=dataset&lang=es');
      expect(req.request.responseType).toBe('blob');
      req.flush(new Blob(['[]']), {
        headers: { 'X-Export-Notes': encodeURIComponent(JSON.stringify(['camera motion of some scenes is not carried', 'the models are not carried'])), 'X-Export-Count': '3' },
      });
      await done;
      expect(clicked).toEqual(['demo.dataset.json']);
      const message = snackOpen.mock.calls[0][0] as string;
      expect(message).toContain('demo.dataset.json');
      expect(message).toContain('3 entradas');
      expect(message).toContain('camera motion of some scenes is not carried');
    });

    it('downloads the package as a zip', async () => {
      const fixture = await create();
      const done = (fixture.componentInstance as unknown as { exportProject(p: ProjectSummary, f: 'zip'): Promise<void> }).exportProject(TWO[0], 'zip');
      http.expectOne('/api/projects/demo/export?format=zip&lang=es').flush(new Blob(['PK']));
      await done;
      expect(clicked).toEqual(['demo.zip']);
      expect(snackOpen.mock.calls[0][0] as string).toContain('demo.zip');
    });

    it('says why it could not export, from the server answer', async () => {
      const fixture = await create();
      const done = exporter(fixture);
      http.expectOne('/api/projects/demo/export?format=dataset&lang=es').flush(
        new Blob([JSON.stringify({ error: { code: 'validation', message: 'export: the project has nothing to export' } })], { type: 'application/json' }),
        { status: 422, statusText: 'Unprocessable' },
      );
      await done;
      expect(clicked).toEqual([]);
      expect(snackOpen.mock.calls[0][0] as string).toContain('nothing to export');
    });
  });

  describe('the modes the user chose', () => {
    const MIXED: ProjectSummary[] = [
      { id: 'peli', name: 'peli', mode: 'video', scene_count: 3 },
      { id: 'fotos', name: 'fotos', mode: 'images', scene_count: 2 },
      { id: 'canciones', name: 'canciones', mode: 'music', scene_count: 0, track_count: 4 },
      { id: 'roto', name: '', mode: '', scene_count: 0, invalid: true, error: 'cannot parse' },
    ];
    const ids = (f: { nativeElement: unknown }) =>
      Array.from((f.nativeElement as HTMLElement).querySelectorAll('.df-table__table tbody tr td:first-child')).map((e) => e.textContent?.trim());

    it('lists only the video projects by default, plus the one with no mode, and has no Mode column', async () => {
      const f = await create(MIXED);
      expect(ids(f)).toEqual(['peli', 'roto']);
      expect((f.nativeElement as HTMLElement).querySelector('[data-testid=projects-modes] mat-select')).toBeTruthy();
      expect((f.nativeElement as HTMLElement).querySelector('th[data-key=mode]')).toBeNull();
    });

    it('lists more as modes are chosen, and the choice is the shared one', async () => {
      const f = await create(MIXED);
      TestBed.inject(ModeFilterStore).set(['video', 'music']);
      f.detectChanges();
      await f.whenStable();
      f.detectChanges();
      expect(ids(f)).toEqual(['peli', 'canciones', 'roto']);
    });

    it('says which modes are hidden, and offers to show them, when the chosen ones have no projects', async () => {
      const f = await create([MIXED[1], MIXED[2]]);
      const el = f.nativeElement as HTMLElement;
      expect(el.querySelector('mo-empty-state')).toBeNull(); // there are projects: no invitation to create the first
      expect(el.querySelector('[data-testid=projects-hidden]')?.textContent).toContain('Imágenes (1)');
      expect(el.querySelector('[data-testid=projects-hidden]')?.textContent).toContain('Música (1)');
      (el.querySelector('[data-testid=projects-show-all]') as HTMLButtonElement).click();
      f.detectChanges();
      await f.whenStable();
      f.detectChanges();
      expect(ids(f)).toEqual(['fotos', 'canciones']);
      expect(el.querySelector('[data-testid=projects-hidden]')).toBeNull();
    });

    it('with no projects at all it invites to create one, and shows no selector', async () => {
      const f = await create([]);
      const el = f.nativeElement as HTMLElement;
      expect(el.querySelector('mo-empty-state')).toBeTruthy();
      expect(el.querySelector('[data-testid=projects-modes]')).toBeNull();
    });

    it('a project created in a hidden mode adds its mode, so it shows', async () => {
      const f = await create([MIXED[0]]);
      const store = storeOf(f);
      const done = store.load();
      http.expectOne('/api/projects?managed=all').flush([MIXED[0], MIXED[2]]); // a music project appeared
      await done;
      f.detectChanges();
      await f.whenStable();
      f.detectChanges();
      expect(ids(f)).toEqual(['peli', 'canciones']);
    });

    it('searches by identifier and name', async () => {
      const f = await create(MIXED);
      TestBed.inject(ModeFilterStore).showAll();
      f.detectChanges();
      await f.whenStable();
      const input = (f.nativeElement as HTMLElement).querySelector('.df-table__search') as HTMLInputElement;
      input.value = 'canc';
      input.dispatchEvent(new Event('input'));
      await f.whenStable();
      f.detectChanges();
      expect(ids(f)).toEqual(['canciones']);
    });
  });

  describe('music projects', () => {
    const MUSIC: ProjectSummary = { id: 'canciones', name: 'canciones', mode: 'music', scene_count: 0, track_count: 4 };

    it('shows the number of tracks and opens the music studio instead of the scene editor', async () => {
      TestBed.inject(ModeFilterStore).showAll();
      const fixture = await create([MUSIC, TWO[0]]);
      const el = fixture.nativeElement as HTMLElement;
      const rows = Array.from(el.querySelectorAll('.df-table__table tbody tr')) as HTMLElement[];
      const music = rows.find((r) => r.textContent?.includes('canciones'))!;
      expect(music.textContent).toContain('4');
      expect(music.querySelector('a[href="/projects/canciones/music"]')).not.toBeNull();
      const video = rows.find((r) => r.textContent?.includes('demo'))!;
      expect(video.querySelector('a[href="/projects/demo/editor"]')).not.toBeNull();
    });

    it('offers a way to start a music project next to the usual one', async () => {
      const fixture = await create([]);
      const header = (fixture.nativeElement as HTMLElement).querySelector('[data-testid=page-actions]')!;
      const music = header.querySelector('[data-testid=create-music-project]');
      expect(music?.textContent).toContain('Música');
      expect(music?.getAttribute('aria-label')).toBe('Proyecto de música');
      expect(header.querySelector('[data-testid=create-project]')).not.toBeNull();
    });

    const tick = () => new Promise((r) => setTimeout(r, 0));
    const startMusic = async () => {
      const fixture = await create([]);
      dialogResult = 'cancion';
      const done = (fixture.componentInstance as unknown as { createMusicProject(): Promise<void> }).createMusicProject();
      await tick();
      http.expectOne({ method: 'POST', url: '/api/projects' }).flush({ id: 'cancion' }, { status: 201, statusText: 'Created' });
      await tick();
      http.expectOne('/api/projects?managed=all').flush([]); // the list reloads after creating
      await tick();
      return { done }; // an object, not the promise: awaiting it must not wait for the whole flow
    };

    it('creates the project, turns it into a music project and opens the studio', async () => {
      const { done } = await startMusic();
      await tick();
      const save = http.expectOne('/api/projects/cancion/config');
      expect(save.request.method).toBe('PUT');
      expect(save.request.body.yaml).toBe(musicStarterYaml('cancion'));
      save.flush({ saved: true });
      await tick();
      http.expectOne('/api/projects?managed=all').flush([MUSIC]);
      await done;
      expect(navigate).toHaveBeenCalledWith(['/projects', 'cancion', 'music']);
    });

    it('removes the half-made project when the server refuses it, so no video project is left behind', async () => {
      const { done } = await startMusic();
      await tick();
      http.expectOne('/api/projects/cancion/config').flush(
        { error: { code: 'validation_failed', message: 'config: music synthesis model "x.gguf" not found in models/music' } },
        { status: 422, statusText: 'Unprocessable' },
      );
      await tick();
      const del = http.expectOne({ method: 'DELETE', url: '/api/projects/cancion' });
      del.flush(null, { status: 204, statusText: 'No Content' });
      await tick();
      http.expectOne('/api/projects?managed=all').flush([]);
      await expect(done).rejects.toBeTruthy();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('starts a new music project from one track with a style, and nothing else', () => {
      const yaml = musicStarterYaml('p');
      expect(yaml).toContain('project: p');
      expect(yaml).toContain('mode: music');
      expect(yaml).toContain('id: pista_1');
      expect(yaml).not.toContain('scenes');
    });
  });

  describe('a project of 3D models', () => {
    const tick = () => new Promise((r) => setTimeout(r, 0));
    /** The environment report as the app has it once loaded: with Blender or without it. */
    const withBlender = (present: boolean) => TestBed.inject(EnvironmentStore).report.set({ binaries: [{ name: 'blender', required: false, present }], voices: [], loras: [], gpus: [], models: [] } as unknown as EnvironmentReport);
    const OBJECTS = { id: 'objetos', name: 'objetos', mode: 'models3d', scene_count: 0 } as ProjectSummary;
    const header = (fixture: { nativeElement: unknown }) => (fixture.nativeElement as HTMLElement).querySelector('[data-testid=page-actions]')!;

    it('offers nothing about 3D models on a server with no 3D service', async () => {
      const fixture = await create([]);
      expect(header(fixture).querySelector('[data-testid=create-models-project]')).toBeNull();
    });

    it('has a link to the 3D library after the others, only where Blender is, and not in the simple version', async () => {
      withBlender(true);
      const fixture = await create([]);
      const link = header(fixture).querySelector('[data-testid=open-models3d]');
      expect(link?.textContent).toContain('Biblioteca 3D');
      expect(link?.getAttribute('href')).toBe('/models/3d');
      expect(link?.getAttribute('target')).toBe('_blank');
      expect(link?.getAttribute('aria-label')).toBe('Biblioteca 3D, se abre en una pestaña nueva');
      const order = [...header(fixture).querySelectorAll('[data-testid^=open-]')].map((b) => b.getAttribute('data-testid'));
      expect(order).toEqual(['open-animation', 'open-video', 'open-music', 'open-flow', 'open-dataset', 'open-models3d']);
      TestBed.inject(SimpleModeStore).set(true);
      fixture.detectChanges();
      expect(header(fixture).querySelector('[data-testid=open-models3d]')).toBeNull();
    });

    it('has no link to the 3D library on a machine without Blender', async () => {
      withBlender(false);
      const fixture = await create([]);
      expect(header(fixture).querySelector('[data-testid=open-models3d]')).toBeNull();
    });

    it('offers to start a project of 3D models where the server has the service', async () => {
      engines = { triposr: { available: true } };
      withBlender(true);
      const fixture = await create([]);
      const button = header(fixture).querySelector('[data-testid=create-models-project]');
      expect(button?.textContent).toContain('Modelos 3D');
    });

    it('offers nothing about 3D models on a machine without Blender, whatever the server has', async () => {
      engines = { triposr: { available: true } };
      withBlender(false);
      const fixture = await create([]);
      expect(header(fixture).querySelector('[data-testid=create-models-project]')).toBeNull();
    });

    it('keeps a project of this mode listed without Blender, with the note and no edit action', async () => {
      withBlender(false);
      const fixture = await create([OBJECTS]);
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('[data-testid=needs-blender]')?.textContent).toContain('Necesita Blender');
      expect(root.querySelector('[data-testid="edit-objetos"]')).toBeNull();
    });

    it('lists it with its edit action when Blender is there, and with no note', async () => {
      withBlender(true);
      const fixture = await create([OBJECTS]);
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('[data-testid=needs-blender]')).toBeNull();
    });

    it('opens a project of this mode in its own page, not in the scene editor', async () => {
      const fixture = await create([OBJECTS]);
      const link = (fixture.componentInstance as unknown as { editLink(p: ProjectSummary): string[] }).editLink(OBJECTS);
      expect(link).toEqual(['/projects', 'objetos', 'models3d']);
    });

    const start = async () => {
      engines = { triposr: { available: true } };
      withBlender(true);
      const fixture = await create([]);
      dialogResult = 'objetos';
      const done = (fixture.componentInstance as unknown as { createModelsProject(): Promise<void> }).createModelsProject();
      await tick();
      http.expectOne({ method: 'POST', url: '/api/projects' }).flush({ id: 'objetos' }, { status: 201, statusText: 'Created' });
      await tick();
      http.expectOne('/api/projects?managed=all').flush([]);
      await tick();
      return { done };
    };

    const STARTER = {
      project: 'objetos',
      output: { mode: 'video', file: 'out/objetos.mp4', contact_sheet: false },
      defaults: { model: 'models/m.safetensors', voice: 'voices/v.onnx', resolution: '1280x720', sampler: 'euler', steps: 30, fps: 30, subject_prompt: '', negative_prompt: '', lora_model_dir: '' },
      scenes: [{ id: 'escena_1', prompt: 'x', negative_prompt: '', tts_text: 'hola', speed: 1, lora: '' }],
    };

    it('makes the project with one entry, keeping the image model, sampler and steps of the server’s starter, and opens its page', async () => {
      const { done } = await start();
      await tick();
      http.expectOne({ method: 'GET', url: '/api/projects/objetos/config' }).flush({ yaml: '', parsed: STARTER, valid: true });
      await tick();
      const save = http.expectOne({ method: 'PUT', url: '/api/projects/objetos/config' });
      expect(save.request.body.yaml).toContain('mode: models3d');
      expect(save.request.body.yaml).toContain('id: object-1');
      expect(save.request.body.yaml).toContain('sampler: euler');
      expect(save.request.body.yaml).toContain('steps: 30');
      expect(save.request.body.yaml).toContain('model: models/m.safetensors');
      expect(save.request.body.yaml).not.toContain('scenes');
      expect(save.request.body.yaml).not.toContain('voice');
      expect(save.request.body.yaml).not.toContain('fps');
      save.flush({ saved: true });
      await tick();
      http.expectOne('/api/projects?managed=all').flush([OBJECTS]);
      await done;
      expect(navigate).toHaveBeenCalledWith(['/projects', 'objetos', 'models3d']);
    });

    it('removes the half-made project when the server refuses it', async () => {
      const { done } = await start();
      await tick();
      http.expectOne({ method: 'GET', url: '/api/projects/objetos/config' }).flush({ yaml: '', parsed: STARTER, valid: true });
      await tick();
      http.expectOne({ method: 'PUT', url: '/api/projects/objetos/config' }).flush({ error: { code: 'validation_failed', message: 'config: models: nope' } }, { status: 422, statusText: 'Unprocessable' });
      await tick();
      http.expectOne({ method: 'DELETE', url: '/api/projects/objetos' }).flush(null, { status: 204, statusText: 'No Content' });
      await tick();
      http.expectOne('/api/projects?managed=all').flush([]);
      await expect(done).rejects.toBeTruthy();
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('a project of motion graphics', () => {
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const BASE = {
      project: 'demo',
      output: { mode: 'video', file: 'out/demo.mp4', contact_sheet: false },
      defaults: { model: 'models/m.safetensors', voice: 'voices/v.onnx', resolution: '1024x576', sampler: 'euler', steps: 20, fps: 24, subject_prompt: '', negative_prompt: '', lora_model_dir: '' },
      scenes: [{ id: 'escena_1', prompt: 'x', negative_prompt: '', tts_text: 'hola', speed: 1, lora: '' }],
    };

    const motionButton = (fixture: { nativeElement: unknown }) =>
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid=page-actions]')!.querySelector('[data-testid=create-motion-project]');

    it('is offered next to the music project when the model that writes the pages can run', async () => {
      TestBed.inject(AvailabilityStore).data.set(ALL_AVAILABLE);
      const fixture = await create([]);
      expect(motionButton(fixture)?.textContent).toContain('Gráficos animados');
      expect(motionButton(fixture)?.getAttribute('aria-label')).toBe('Proyecto de gráficos animados');
    });

    it('is not offered without that model, nor while it is not known', async () => {
      const unknown = await create([]);
      expect(motionButton(unknown)).toBeNull();
      TestBed.inject(AvailabilityStore).data.set(missing('motion_graphics', 'no_models'));
      unknown.detectChanges();
      expect(motionButton(unknown)).toBeNull();
      TestBed.inject(AvailabilityStore).data.set(ALL_AVAILABLE);
      unknown.detectChanges();
      expect(motionButton(unknown)).not.toBeNull();
    });

    it('starts from three silent motion-graphic scenes joined with a fade and keeps the rest of the project', () => {
      const cfg = motionStarterConfig(BASE as never);
      expect(cfg.scenes.map((s) => s.id)).toEqual(['titulo', 'ideas', 'cierre']);
      for (const sc of cfg.scenes) {
        expect(sc.motion_graphic?.length).toBeGreaterThan(20);
        expect(sc.silence_seconds).toBeGreaterThan(0);
        expect(sc.image).toBeUndefined();
        expect(sc.animate).toBeUndefined();
      }
      expect(cfg.defaults.transition_seconds).toBe(0.4);
      expect(cfg.defaults.fps).toBe(30);
      expect(cfg.defaults.voice).toBe('voices/v.onnx');
    });

    it('creates the project, saves the starter scenes and opens the editor', async () => {
      const fixture = await create([]);
      dialogResult = 'graficos';
      const done = (fixture.componentInstance as unknown as { createMotionProject(): Promise<void> }).createMotionProject();
      await tick();
      http.expectOne({ method: 'POST', url: '/api/projects' }).flush({ id: 'graficos' }, { status: 201, statusText: 'Created' });
      await tick();
      http.expectOne('/api/projects?managed=all').flush([]);
      await tick();
      http.expectOne('/api/projects/graficos/config').flush({ yaml: '', parsed: BASE, valid: true });
      await tick();
      const save = http.expectOne({ method: 'PUT', url: '/api/projects/graficos/config' });
      expect(save.request.body.yaml).toContain('motion_graphic:');
      expect(save.request.body.yaml).toContain('silence_seconds: 4');
      save.flush({ saved: true });
      await tick();
      http.expectOne('/api/projects?managed=all').flush([]);
      await done;
      expect(navigate).toHaveBeenCalledWith(['/projects', 'graficos', 'editor']);
    });

    it('removes the half-made project when the server refuses it (no browser)', async () => {
      const fixture = await create([]);
      dialogResult = 'graficos';
      const done = (fixture.componentInstance as unknown as { createMotionProject(): Promise<void> }).createMotionProject();
      await tick();
      http.expectOne({ method: 'POST', url: '/api/projects' }).flush({ id: 'graficos' }, { status: 201, statusText: 'Created' });
      await tick();
      http.expectOne('/api/projects?managed=all').flush([]);
      await tick();
      http.expectOne('/api/projects/graficos/config').flush({ yaml: '', parsed: BASE, valid: true });
      await tick();
      http.expectOne({ method: 'PUT', url: '/api/projects/graficos/config' }).flush(
        { error: { code: 'validation_failed', message: 'config: scenes "titulo" need Chrome or Chromium to draw their motion graphics' } },
        { status: 422, statusText: 'Unprocessable' },
      );
      await tick();
      http.expectOne({ method: 'DELETE', url: '/api/projects/graficos' }).flush(null, { status: 204, statusText: 'No Content' });
      await tick();
      http.expectOne('/api/projects?managed=all').flush([]);
      await expect(done).rejects.toBeTruthy();
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('creating with a style and quality', () => {
    const CONFIG = {
      project: 'nuevo',
      output: { mode: 'images', file: '', contact_sheet: false },
      defaults: { model: 'models/v.safetensors', voice: '', resolution: '512x512', sampler: 'euler', steps: 20, fps: 24, subject_prompt: '', negative_prompt: '', lora_model_dir: '' },
      scenes: [{ id: 'a', prompt: 'p', negative_prompt: '', tts_text: '', speed: 1, lora: '' }],
    };
    const PONY = { id: 'pony', kind: 'model', name: 'Pony', description: '', size_bytes: 1, installed: true, styles: ['anime'], style_rank: 1, preset: { steps: 25 }, files: [{ name: 'pony.safetensors', role: 'model', url: '' }] };

    async function createWith(choice: { style?: string; tier?: string }) {
      const fixture = await create([]);
      dialogOpen.mockImplementationOnce(((_c: unknown, cfg: { data: { choice: object } }) => {
        Object.assign(cfg.data.choice, choice);
        return { afterClosed: () => of('nuevo') };
      }) as never);
      const done = (fixture.componentInstance as unknown as { createProject(): Promise<void> }).createProject();
      await Promise.resolve();
      http.expectOne({ method: 'POST', url: '/api/projects' }).flush({ id: 'nuevo' }, { status: 201, statusText: 'Created' });
      await Promise.resolve();
      http.expectOne('/api/projects?managed=all').flush([]);
      return done;
    }

    it('writes them into the new project before opening the editor', async () => {
      const done = createWith({ style: 'anime', tier: 'low' });
      await new Promise((r) => setTimeout(r));
      http.expectOne('/api/projects/nuevo/config').flush({ yaml: '', parsed: CONFIG, valid: true });
      http.expectOne('/api/assets/catalog').flush({ entries: [PONY] });
      await new Promise((r) => setTimeout(r));
      const put = http.expectOne({ method: 'PUT', url: '/api/projects/nuevo/config' });
      expect(put.request.body.yaml).toContain('models/pony.safetensors');
      expect(put.request.body.yaml).toContain('resolution: 384x384');
      put.flush({ saved: true });
      await done;
      expect(navigate).toHaveBeenCalledWith(['/projects', 'nuevo', 'editor']);
    });

    it('Easy mode chooses the models and the animation for the machine and writes them', async () => {
      const done = createWith({ auto: true } as never);
      await new Promise((r) => setTimeout(r));
      const videoConfig = { ...CONFIG, output: { mode: 'video', file: 'out/x.mp4', contact_sheet: false }, scenes: [] };
      http.expectOne('/api/projects/nuevo/config').flush({ yaml: '', parsed: videoConfig, valid: true });
      http.expectOne('/api/assets/catalog').flush({
        entries: [
          { ...PONY, id: 'into', name: 'Into', styles: ['photo'], style_rank: 1, vram_mb: 8000, files: [{ name: 'into.safetensors', role: 'model', url: '' }] },
          { id: 'wan', kind: 'video', name: 'Wan', description: '', size_bytes: 1, installed: true, quality: 'medium', vram_mb: 6000, files: [{ name: 'w.gguf', role: 'model', url: '' }, { name: 't5.gguf', role: 'text_encoder', url: '' }, { name: 'v.safetensors', role: 'vae', url: '' }] },
        ],
      });
      await new Promise((r) => setTimeout(r));
      http.expectOne('/api/environment').flush({ binaries: [], models: [], voices: [], loras: [], gpus: [{ index: 0, name: 'NVIDIA GeForce RTX 5060 Ti', free_vram_mb: 15000, total_vram_mb: 16311 }] });
      await new Promise((r) => setTimeout(r));
      const put = http.expectOne({ method: 'PUT', url: '/api/projects/nuevo/config' });
      expect(put.request.body.yaml).toContain('models/into.safetensors');
      expect(put.request.body.yaml).toContain('animate:');
      expect(put.request.body.yaml).toContain('models/video/w.gguf');
      put.flush({ saved: true });
      await done;
      expect(navigate).toHaveBeenCalledWith(['/projects', 'nuevo', 'editor']);
    });

    it('opens the editor with a notice when they cannot be written', async () => {
      const done = createWith({ style: 'anime' });
      await new Promise((r) => setTimeout(r));
      http.expectOne('/api/projects/nuevo/config').flush({ yaml: '', parsed: CONFIG, valid: true });
      http.expectOne('/api/assets/catalog').flush({}, { status: 500, statusText: 'boom' });
      await done;
      expect(navigate).toHaveBeenCalledWith(['/projects', 'nuevo', 'editor'], { state: { notice: 'choice-not-applied' } });
    });

    it('creates as before when nothing is chosen', async () => {
      await createWith({});
      expect(navigate).toHaveBeenCalledWith(['/projects', 'nuevo', 'editor']);
    });
  });

  it('shows the size of each project and the free space, and opens the storage of a project', async () => {
    const fixture = await create();
    const el = fixture.nativeElement as HTMLElement;
    expect(Array.from(el.querySelectorAll('[data-testid=project-size]')).map((c) => c.textContent?.trim())).toEqual(['977 KB', '1,9 MB']);
    expect(el.querySelector('[data-testid=disk-free]')?.textContent).toContain('4,7 GB');
    (el.querySelector('[data-testid="storage-demo"]') as HTMLButtonElement).click();
    expect(dialogOpen).toHaveBeenCalledWith(StorageDialogComponent, expect.objectContaining({ data: { projectId: 'demo', freeBytes: 5e9 } }));
    // closing it reloads the sizes, which changed if something was cleaned
    http.expectOne('/api/storage?managed=all').flush({ projects: [{ id: 'demo', total_bytes: 500_000 }, { id: 'roto', total_bytes: 0 }], disk: { free_bytes: 6e9 } });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid=disk-free]')?.textContent).toContain('5,6 GB');
  });

  it('offers Details and History on each project, and each opens its dialog for that project', async () => {
    const fixture = await create();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="details-demo"]') as HTMLButtonElement).click();
    expect(dialogOpen).toHaveBeenLastCalledWith(ProjectDetailsDialogComponent, expect.objectContaining({ data: { project: expect.objectContaining({ id: 'demo' }) } }));
    (el.querySelector('[data-testid="history-demo"]') as HTMLButtonElement).click();
    expect(dialogOpen).toHaveBeenLastCalledWith(ProjectHistoryDialogComponent, expect.objectContaining({ data: { projectId: 'demo' } }));
    // the project that cannot be read has them too: the server decides
    (el.querySelector('[data-testid="details-roto"]') as HTMLButtonElement).click();
    expect(dialogOpen).toHaveBeenLastCalledWith(ProjectDetailsDialogComponent, expect.objectContaining({ data: { project: expect.objectContaining({ id: 'roto' }) } }));
    expect(el.querySelector('[data-testid="history-roto"]')).not.toBeNull();
  });

  it('shows who made a project beside its name, unless it is an ordinary one', async () => {
    const fixture = TestBed.createComponent(ProjectsListComponent);
    fixture.detectChanges();
    http.expectOne('/api/projects?managed=all').flush([
      { id: 'a', name: 'A', mode: 'video', scene_count: 1, client: 'embedded' },
      { id: 'b', name: 'B', mode: 'video', scene_count: 1, client: 'dashboard-full' },
    ]);
    http.expectOne('/api/storage?managed=all').flush({ projects: [], disk: {} });
    await fixture.whenStable();
    fixture.detectChanges();
    const badges = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="client-badge"]')).map((b) => b.textContent?.trim());
    expect(badges).toEqual(['dashboard-full']);
  });

  describe('client labels', () => {
    const PROJECTS: ProjectSummary[] = [
      { id: 'a', name: 'A', mode: 'video', scene_count: 1, client: 'embedded' },
      { id: 'b', name: 'B', mode: 'video', scene_count: 1, client: 'other-app' },
      { id: 'c', name: 'C', mode: 'video', scene_count: 1, client: 'dashboard-full' },
      { id: 'm', name: 'M', mode: 'music', scene_count: 0, client: 'other-app' },
    ];
    const el = (f: { nativeElement: unknown }) => f.nativeElement as HTMLElement;
    // each row has two `.clip` cells, the id and then the name
    const ids = (f: { nativeElement: unknown }) => Array.from(el(f).querySelectorAll('.clip')).filter((_, i) => i % 2 === 0).map((c) => c.textContent?.trim());
    const chip = (f: { nativeElement: unknown }, name: string) => el(f).querySelector<HTMLButtonElement>(`[data-testid="client-chip-${name}"] .chip-main`)!;
    const settle = async (f: { detectChanges(): void; whenStable(): Promise<unknown> }) => {
      await f.whenStable();
      f.detectChanges();
    };

    it('draws the chips of the labels the server reports above the list and reads them again when the list is read', async () => {
      labelsStub.labels.set([label('other-app', 4), label('embedded', 9)]);
      const fixture = await create(PROJECTS);
      expect(Array.from(el(fixture).querySelectorAll('.chip .name')).map((n) => n.textContent?.trim())).toEqual(['other-app', 'embedded']);
      expect(labelsStub.load).toHaveBeenCalled();
    });

    it('narrows the list to the chosen label, adds a second one, and the choice is remembered', async () => {
      labelsStub.labels.set([label('other-app', 4), label('dashboard-full', 1), label('embedded', 9)]);
      const fixture = await create(PROJECTS);
      expect(ids(fixture)).toEqual(['a', 'b', 'c']);
      chip(fixture, 'other-app').click();
      await settle(fixture);
      expect(ids(fixture)).toEqual(['b']);
      chip(fixture, 'dashboard-full').click();
      await settle(fixture);
      expect(ids(fixture)).toEqual(['b', 'c']);
      expect(JSON.parse(localStorage.getItem('mo.clients') ?? '[]')).toEqual(['other-app', 'dashboard-full']);
    });

    it('combines the label with the modes the user chose', async () => {
      labelsStub.labels.set([label('other-app', 4)]);
      const fixture = await create(PROJECTS);
      TestBed.inject(ModeFilterStore).set(['music']);
      chip(fixture, 'other-app').click();
      await settle(fixture);
      expect(ids(fixture)).toEqual(['m']);
    });

    it('says which labels are chosen when no project has them, and clears them', async () => {
      labelsStub.labels.set([label('claude-test', 1), label('embedded', 9)]);
      const fixture = await create([{ id: 'a', name: 'A', mode: 'video', scene_count: 1, client: 'embedded' }]);
      chip(fixture, 'claude-test').click();
      await settle(fixture);
      const none = el(fixture).querySelector('[data-testid="projects-none-clients"]')!;
      expect(none.textContent).toContain('claude-test');
      (el(fixture).querySelector('[data-testid="projects-none-clients-clear"]') as HTMLButtonElement).click();
      await settle(fixture);
      expect(ids(fixture)).toEqual(['a']);
    });

    it('draws the badge with the colour of the label and shows embedded too while a label is chosen', async () => {
      labelsStub.labels.set([label('other-app', 4), label('embedded', 9)]);
      const fixture = await create(PROJECTS);
      const badge = () => Array.from(el(fixture).querySelectorAll<HTMLElement>('[data-testid="client-badge"]'));
      expect(badge().map((b) => [b.textContent?.trim(), b.style.getPropertyValue('--chip-color')])).toEqual([['other-app', '#aa3355'], ['dashboard-full', '#336699']]);
      chip(fixture, 'embedded').click();
      await settle(fixture);
      expect(badge().map((b) => b.textContent?.trim())).toEqual(['embedded']);
    });

    it('does not filter by a label the server no longer reports', async () => {
      localStorage.setItem('mo.clients', JSON.stringify(['gone']));
      labelsStub.labels.set([label('other-app', 4)]);
      const fixture = await create(PROJECTS);
      expect(ids(fixture)).toEqual(['a', 'b', 'c']);
    });
  });

  it('takes the free space and the warning from the media disk and shows its folder when the server has one', async () => {
    const fixture = TestBed.createComponent(ProjectsListComponent);
    fixture.detectChanges();
    http.expectOne('/api/projects?managed=all').flush(TWO);
    http.expectOne('/api/storage?managed=all').flush({
      projects: [],
      // the server's own disk is almost full, the media disk is not: only the second counts
      disk: { free_bytes: 3e9, total_bytes: 1e11, low: true },
      media: { dir: '/mnt/backups/media', disk: { free_bytes: 600e9, total_bytes: 954e9, low: false }, projects: [] },
    });
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const line = el.querySelector('[data-testid=disk-free]');
    expect(line?.textContent).toContain('559 GB');
    expect(line?.classList.contains('disk--low')).toBe(false);
    expect(el.querySelector('[data-testid=media-dir]')?.textContent).toContain('/mnt/backups/media');
    (el.querySelector('[data-testid="storage-demo"]') as HTMLButtonElement).click();
    expect(dialogOpen).toHaveBeenCalledWith(
      StorageDialogComponent,
      expect.objectContaining({ data: { projectId: 'demo', freeBytes: 600e9, mediaDir: '/mnt/backups/media' } }),
    );
    // closing the dialog reloads the sizes
    http.expectOne('/api/storage?managed=all').flush({ projects: [], disk: {} });
  });

  it('shows no folder when the server has no media directory', async () => {
    const fixture = await create();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid=media-dir]')).toBeNull();
  });

  it('marks the free-space line when the disk is low', async () => {
    const fixture = TestBed.createComponent(ProjectsListComponent);
    fixture.detectChanges();
    http.expectOne('/api/projects?managed=all').flush(TWO);
    http.expectOne('/api/storage?managed=all').flush({ projects: [], disk: { free_bytes: 3e9, total_bytes: 1e12, warn_below_bytes: 20e9, low: true } });
    await fixture.whenStable();
    fixture.detectChanges();
    const line = (fixture.nativeElement as HTMLElement).querySelector('[data-testid=disk-free]');
    expect(line?.classList.contains('disk--low')).toBe(true);
    expect(line?.textContent).toContain('poco');
  });

  describe('animations of the music mode (managed=all)', () => {
    const PIECE: ProjectSummary = { id: 'sample-piece', name: 'Morning light', mode: '', scene_count: 5, client: 'sample', kind: 'music_motion' };
    const el = (f: { nativeElement: unknown }) => f.nativeElement as HTMLElement;
    const q = (f: { nativeElement: unknown }, id: string) => el(f).querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    /** The Animation option of the filter, on (the animations are listed) or off (the default). */
    const animations = (on: boolean) => TestBed.inject(ModeFilterStore).setAnimations(on);
    beforeEach(() => animations(true));

    it('draws the row with its kind, its label and its size, whatever the modes chosen', async () => {
      const fixture = await create([TWO[0], PIECE]);
      expect(q(fixture, 'kind-badge')?.textContent?.trim()).toBe('Animación');
      expect(q(fixture, 'client-badge')?.textContent?.trim()).toBe('sample');
      expect(el(fixture).textContent).toContain('Morning light');
    });

    it('keeps the row when the server gives the animation a project mode that is not chosen', async () => {
      const fixture = await create([TWO[0], { ...PIECE, mode: 'music' }]);
      expect(q(fixture, 'kind-badge')).not.toBeNull();
    });

    it('offers Animation among the modes, and lists the animations only while it is on', async () => {
      animations(false);
      const fixture = await create([TWO[0], { ...PIECE, mode: 'video' }]);
      expect(q(fixture, 'kind-badge')).toBeNull();
      expect(el(fixture).textContent).toContain('demo');
      expect(el(fixture).textContent).not.toContain('Morning light');
      // the option is in the selector of the modes, next to the project modes
      q(fixture, 'mode-select')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(document.querySelector('[data-testid="mode-option-animation"]')).not.toBeNull();
    });

    it('says the animations are hidden when they are all there is, and Show all brings them back', async () => {
      animations(false);
      const fixture = await create([{ ...PIECE, mode: 'video' }]);
      const hidden = q(fixture, 'projects-hidden')!;
      expect(hidden.textContent).toContain('Animación (1)');
      q(fixture, 'projects-show-all')!.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(q(fixture, 'kind-badge')).not.toBeNull();
    });

    it('opens the piece instead of the scene editor and keeps the actions the server gives a project: details, history, storage, copy, export and delete', async () => {
      const fixture = await create([PIECE]);
      expect(q(fixture, 'open-piece-sample-piece')?.getAttribute('href')).toBe('/animation/pieces/sample-piece');
      for (const kept of ['details-', 'history-', 'storage-', 'export-']) expect(q(fixture, `${kept}sample-piece`), kept).not.toBeNull();
      expect(el(fixture).textContent).toContain('content_copy');
      for (const gone of ['edit-', 'review-']) expect(q(fixture, `${gone}sample-piece`), gone).toBeNull();
      expect(el(fixture).querySelector('mat-icon.danger, button.danger')).not.toBeNull();
    });

    it('opens the details with the animation, so its label goes by its own route', async () => {
      const fixture = await create([PIECE]);
      q(fixture, 'details-sample-piece')!.click();
      await Promise.resolve();
      expect(dialogOpen).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ data: { project: expect.objectContaining({ id: 'sample-piece', kind: 'music_motion' }) } }));
    });

    it('does not draw the animation actions on an ordinary project', async () => {
      const fixture = await create([TWO[0]]);
      expect(q(fixture, 'kind-badge')).toBeNull();
      expect(q(fixture, 'open-piece-demo')).toBeNull();
      expect(q(fixture, 'edit-demo')).not.toBeNull();
    });

    it('deletes by the piece route, says the server\'s reason when it refuses and leaves the row', async () => {
      const fixture = await create([PIECE]);
      const cmp = fixture.componentInstance as unknown as { deleteProject(p: ProjectSummary): Promise<void> };
      const snack = vi.spyOn(TestBed.inject(MatSnackBar), 'open').mockReturnValue(undefined as never);
      dialogResult = true;
      const refused = cmp.deleteProject(PIECE);
      await Promise.resolve();
      http.expectNone({ method: 'DELETE', url: '/api/projects/sample-piece' });
      http.expectOne({ method: 'DELETE', url: '/api/music-motion/pieces/sample-piece' }).flush({ error: { code: 'conflict', message: 'piece is being drawn' } }, { status: 409, statusText: 'Conflict' });
      await refused;
      expect(snack).toHaveBeenCalledWith('piece is being drawn', expect.any(String), expect.anything());
      expect(storeOf(fixture).projects().some((p) => p.id === 'sample-piece')).toBe(true);
      const done = cmp.deleteProject(PIECE);
      await Promise.resolve();
      http.expectOne({ method: 'DELETE', url: '/api/music-motion/pieces/sample-piece' }).flush(null, { status: 204, statusText: 'No Content' });
      await Promise.resolve();
      http.expectOne('/api/projects?managed=all').flush([]);
      await done;
    });
  });

  describe('the sections that open in their own tab', () => {
    const buttons = (f: { nativeElement: unknown }) =>
      ['animation', 'video', 'music'].map((s) => (f.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(`[data-testid=open-${s}]`));

    it('does not offer them in the simple version', async () => {
      TestBed.inject(SimpleModeStore).set(true);
      const f = await create();
      expect(buttons(f)).toEqual([null, null, null]);
    });
  });

  describe('one mode shown on its own', () => {
    const MIXED: ProjectSummary[] = [
      { id: 'peli', name: 'peli', mode: 'video', scene_count: 3 },
      { id: 'fotos', name: 'fotos', mode: 'images', scene_count: 2 },
      { id: 'canciones', name: 'canciones', mode: 'music', scene_count: 0, track_count: 4 },
      { id: 'roto', name: '', mode: '', scene_count: 0, invalid: true, error: 'cannot parse' },
    ];
    const ids = (f: { nativeElement: unknown }) =>
      Array.from((f.nativeElement as HTMLElement).querySelectorAll('.df-table__table tbody tr td:first-child')).map((e) => e.textContent?.trim());
    const at = (query: string) => TestBed.inject(Router).navigateByUrl(`/${query}`);

    it('lists only the music projects, and a project with no mode, without touching the modes the user chose', async () => {
      await at('?mode=music');
      const f = await create(MIXED);
      expect(ids(f)).toEqual(['canciones', 'roto']);
      expect((f.nativeElement as HTMLElement).querySelector('[data-testid=projects-only]')?.textContent).toContain('Música');
      expect([...TestBed.inject(ModeFilterStore).modes()]).toEqual(['video']);
      expect(localStorage.getItem('mo.modes')).toBeNull();
    });

    it('says so and goes back to the chosen modes', async () => {
      await at('?mode=music');
      const f = await create(MIXED);
      (f.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid=projects-only-clear]')!.click();
      expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { mode: null }, queryParamsHandling: 'merge' }));
    });

    it('lists the chosen modes when there is no request, with no line', async () => {
      const f = await create(MIXED);
      expect(ids(f)).toEqual(['peli', 'roto']);
      expect((f.nativeElement as HTMLElement).querySelector('[data-testid=projects-only]')).toBeNull();
    });

    it('ignores a mode that does not exist', async () => {
      await at('?mode=bogus');
      const f = await create(MIXED);
      expect(ids(f)).toEqual(['peli', 'roto']);
      expect((f.nativeElement as HTMLElement).querySelector('[data-testid=projects-only]')).toBeNull();
    });

    it('can ask for any of the three modes', async () => {
      await at('?mode=images');
      const f = await create(MIXED);
      expect(ids(f)).toEqual(['fotos', 'roto']);
    });

    it('ends the request when the user changes the mode selector', async () => {
      await at('?mode=music');
      const f = await create(MIXED);
      navigate.mockClear();
      TestBed.inject(ModeFilterStore).set(['video', 'images']);
      f.detectChanges();
      await f.whenStable();
      expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { mode: null } }));
    });

    it('says there are no projects of that mode and offers the music project, not the invitation for a first one', async () => {
      await at('?mode=music');
      const f = await create([MIXED[0], MIXED[1]]);
      const el = f.nativeElement as HTMLElement;
      expect(el.querySelector('mo-empty-state')).toBeNull();
      expect(el.querySelector('[data-testid=projects-none]')?.textContent).toContain('Música');
      expect(el.querySelector('[data-testid=projects-hidden]')).toBeNull();
      expect(el.querySelector('[data-testid=projects-none-create]')?.textContent).toContain('Proyecto de música');
    });

    it('offers no music project button when the mode asked for is not music', async () => {
      await at('?mode=images');
      const f = await create([MIXED[0]]);
      const el = f.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid=projects-none]')).toBeTruthy();
      expect(el.querySelector('[data-testid=projects-none-create]')).toBeNull();
    });
  });

  describe('the motion of the list', () => {
    it('animates the changes of the rows of its table: the directive is on the table\'s container and names its tbody', async () => {
      const f = await create();
      const host = (f.nativeElement as HTMLElement).querySelector('[appautoanimate]');
      expect(host?.getAttribute('appautoanimatetarget')).toBe('.df-table__table tbody');
      expect(host?.querySelector('.df-table__table')).toBeTruthy();
    });
  });

  describe('the actions of the header', () => {
    const labels = (f: { nativeElement: unknown }) =>
      ['create-project', 'create-music-project', 'create-motion-project', 'import-package', 'import-project', 'open-animation', 'open-video', 'open-music'].map((id) =>
        (f.nativeElement as HTMLElement).querySelector<HTMLElement>(`[data-testid=${id}]`),
      );

    it('are compact and say what they do without the word "project", keeping the full name for assistive technology', async () => {
      TestBed.inject(AvailabilityStore).data.set(ALL_AVAILABLE);
      const f = await create();
      const [create_, music, motion, full, dataset] = labels(f);
      for (const b of [create_, music, motion, full, dataset]) expect(b?.classList.contains('mo-compact'), b?.dataset['testid']).toBe(true);
      expect(create_?.textContent).toContain('Crear');
      expect(create_?.textContent).not.toMatch(/proyecto/i);
      expect(music?.textContent).not.toMatch(/proyecto/i);
      expect(motion?.textContent).not.toMatch(/proyecto/i);
      expect(full?.textContent).not.toMatch(/proyecto/i);
      expect(create_?.getAttribute('aria-label')).toBe('Crear proyecto');
      expect(full?.getAttribute('aria-label')).toBe('Importar proyecto completo');
    });

    it('does not offer the Dataset button in the simple version', async () => {
      TestBed.inject(SimpleModeStore).set(true);
      const f = await create();
      expect((f.nativeElement as HTMLElement).querySelector('[data-testid=open-dataset]')).toBeNull();
    });

  });
});

