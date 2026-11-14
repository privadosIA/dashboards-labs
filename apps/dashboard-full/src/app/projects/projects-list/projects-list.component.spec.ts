import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, provideRouter } from '@angular/router';
import { provideAppDynamicForms } from '../../shared/dynamic/dynamic-forms.providers';
import { of } from 'rxjs';

import { ProjectSummary } from '../../core/api.models';
import { ALL_AVAILABLE, missing } from '../../core/availability.fake';
import { AvailabilityStore } from '../../core/availability.store';
import { ModeFilterStore } from '../../core/mode-filter.store';
import { SimpleModeStore } from '../../core/simple-mode.store';
import { ProjectsStore } from '../../core/projects.store';
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

  beforeEach(async () => {
    sessionStorage.clear();
    dialogOpen.mockClear();
    await TestBed.configureTestingModule({
      imports: [ProjectsListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: { open: dialogOpen } },
        provideRouter([]),
        provideAppDynamicForms(),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => http.verify());

  async function create(list: ProjectSummary[] = TWO) {
    const fixture = TestBed.createComponent(ProjectsListComponent);
    fixture.detectChanges();
    http.expectOne('/api/projects').flush(list);
    http.expectOne('/api/storage').flush({ projects: list.map((p, i) => ({ id: p.id, total_bytes: (i + 1) * 1_000_000 })), disk: { free_bytes: 5e9, total_bytes: 1e10 } });
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
      .expectOne('/api/projects')
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
    http.expectOne('/api/projects').flush([TWO[1]]);
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
      http.expectOne('/api/projects').flush([MIXED[0], MIXED[2]]); // a music project appeared
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
      http.expectOne('/api/projects').flush([]); // the list reloads after creating
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
      http.expectOne('/api/projects').flush([MUSIC]);
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
      http.expectOne('/api/projects').flush([]);
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
      http.expectOne('/api/projects').flush([]);
      await tick();
      http.expectOne('/api/projects/graficos/config').flush({ yaml: '', parsed: BASE, valid: true });
      await tick();
      const save = http.expectOne({ method: 'PUT', url: '/api/projects/graficos/config' });
      expect(save.request.body.yaml).toContain('motion_graphic:');
      expect(save.request.body.yaml).toContain('silence_seconds: 4');
      save.flush({ saved: true });
      await tick();
      http.expectOne('/api/projects').flush([]);
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
      http.expectOne('/api/projects').flush([]);
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
      http.expectOne('/api/projects').flush([]);
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
      http.expectOne('/api/projects').flush([]);
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
    http.expectOne('/api/storage').flush({ projects: [{ id: 'demo', total_bytes: 500_000 }, { id: 'roto', total_bytes: 0 }], disk: { free_bytes: 6e9 } });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid=disk-free]')?.textContent).toContain('5,6 GB');
  });

  it('takes the free space and the warning from the media disk and shows its folder when the server has one', async () => {
    const fixture = TestBed.createComponent(ProjectsListComponent);
    fixture.detectChanges();
    http.expectOne('/api/projects').flush(TWO);
    http.expectOne('/api/storage').flush({
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
    http.expectOne('/api/storage').flush({ projects: [], disk: {} });
  });

  it('shows no folder when the server has no media directory', async () => {
    const fixture = await create();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid=media-dir]')).toBeNull();
  });

  it('marks the free-space line when the disk is low', async () => {
    const fixture = TestBed.createComponent(ProjectsListComponent);
    fixture.detectChanges();
    http.expectOne('/api/projects').flush(TWO);
    http.expectOne('/api/storage').flush({ projects: [], disk: { free_bytes: 3e9, total_bytes: 1e12, warn_below_bytes: 20e9, low: true } });
    await fixture.whenStable();
    fixture.detectChanges();
    const line = (fixture.nativeElement as HTMLElement).querySelector('[data-testid=disk-free]');
    expect(line?.classList.contains('disk--low')).toBe(true);
    expect(line?.textContent).toContain('poco');
  });

  describe('the sections that open in their own tab', () => {
    const buttons = (f: { nativeElement: unknown }) =>
      ['animation', 'video', 'music'].map((s) => (f.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(`[data-testid=open-${s}]`));

    it('offers Animation, Video and Music as links that open a new tab, from a script so that the tab can close itself', async () => {
      const f = await create();
      const [animation, video, music] = buttons(f);
      expect([animation?.getAttribute('href'), video?.getAttribute('href'), music?.getAttribute('href')]).toEqual(['/animation', '/video', '/music']);
      for (const a of [animation, video, music]) {
        expect(a?.getAttribute('target')).toBe('_blank');
        expect(a?.getAttribute('rel')).toBeNull();
        expect(a?.getAttribute('aria-label')).toBeTruthy();
      }
    });

    it('has them in the header with the other actions, named as the sections', async () => {
      const f = await create();
      const [animation, video, music] = buttons(f);
      expect([animation, video, music].map((a) => a?.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
        expect.stringContaining('Animación'),
        expect.stringContaining('Vídeo'),
        expect.stringContaining('Música'),
      ]);
      expect(animation?.closest('mo-page-header')).toBeTruthy();
    });

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

    it('has a Guided flow button beside Animation, Video and Music, which opens the guided flow in a new tab, in the simple version too hidden like them', async () => {
      const f = await create();
      const flow = (f.nativeElement as HTMLElement).querySelector('[data-testid=open-flow]');
      expect(flow?.getAttribute('href')).toBe('/animation/motion-edit/flow');
      expect(flow?.getAttribute('target')).toBe('_blank');
      expect(flow?.textContent).toContain('Flujo guiado');
      expect(flow?.getAttribute('aria-label')).toBe('Flujo guiado, se abre en una pestaña nueva');
      expect(flow?.querySelector('mat-icon.new-tab')).toBeTruthy();
    });

    it('has a Dataset button after Guided flow, which opens the dataset studio in a new tab', async () => {
      const f = await create();
      const el = f.nativeElement as HTMLElement;
      const dataset = el.querySelector('[data-testid=open-dataset]');
      expect(dataset?.getAttribute('href')).toBe('/dataset');
      expect(dataset?.getAttribute('target')).toBe('_blank');
      expect(dataset?.textContent).toContain('Dataset');
      expect(dataset?.getAttribute('aria-label')).toBe('Dataset, se abre en una pestaña nueva');
      expect(dataset?.querySelector('mat-icon')?.textContent?.trim()).toBe('dataset');
      expect(dataset?.querySelector('mat-icon.new-tab')).toBeTruthy();
      const order = [...el.querySelectorAll('[data-testid=open-animation], [data-testid=open-video], [data-testid=open-music], [data-testid=open-flow], [data-testid=open-dataset]')].map((b) => b.getAttribute('data-testid'));
      expect(order).toEqual(['open-animation', 'open-video', 'open-music', 'open-flow', 'open-dataset']);
    });

    it('does not offer the Dataset button in the simple version', async () => {
      TestBed.inject(SimpleModeStore).set(true);
      const f = await create();
      expect((f.nativeElement as HTMLElement).querySelector('[data-testid=open-dataset]')).toBeNull();
    });

    it('tell the two Music buttons apart by their icon: one creates a music project, the other opens the Music section in a new tab', async () => {
      const f = await create();
      const create_ = (f.nativeElement as HTMLElement).querySelector('[data-testid=create-music-project]');
      const open = (f.nativeElement as HTMLElement).querySelector('[data-testid=open-music]');
      const icon = (el: Element | null) => el?.querySelector('mat-icon')?.textContent?.trim();
      expect(icon(create_)).toBe('library_music');
      expect(icon(open)).toBe('music_note');
      expect(open?.querySelector('mat-icon.new-tab')).toBeTruthy();
      expect(create_?.querySelector('mat-icon.new-tab')).toBeNull();
      expect(create_?.getAttribute('aria-label')).not.toBe(open?.getAttribute('aria-label'));
    });
  });
});

