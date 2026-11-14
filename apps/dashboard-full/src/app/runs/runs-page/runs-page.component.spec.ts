import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { CacheReport, EnvironmentReport, Run } from '../../core/api.models';
import { EnvironmentStore } from '../../core/environment.store';
import { ModeFilterStore } from '../../core/mode-filter.store';
import { ProjectsStore } from '../../core/projects.store';
import { provideAppDynamicForms } from '../../shared/dynamic/dynamic-forms.providers';
import { RunsPageComponent } from './runs-page.component';

const ENV: EnvironmentReport = {
  binaries: [],
  models: [],
  voices: [],
  loras: [],
  gpus: [
    { index: 0, name: 'RTX 4070', free_vram_mb: 3000, low_vram: true },
    { index: 1, name: 'RTX 5060 Ti', free_vram_mb: 14000, ollama_mb: 4096 },
  ],
};

// The motion-change fixture: clip re-runs, tts/render stay cached.
const CACHE: CacheReport = {
  mode: 'video',
  cold: false,
  scenes: [
    { scene_id: 'intro', phases: { tts: 'hit', probe: 'always', render: 'hit', clip: 'run' } },
  ],
};

const HISTORY: Run[] = [
  {
    id: 'run-2',
    project: 'demo',
    state: 'failed',
    gpu: '1',
    keep_tmp: true,
    force: false,
    vram_warn_mb: 2048,
    created_at: '2026-10-09T11:00:00Z',
    started_at: '2026-10-09T11:00:01Z',
    finished_at: '2026-10-09T11:01:01Z',
    error: 'boom',
  },
  {
    id: 'run-1',
    project: 'demo',
    state: 'succeeded',
    gpu: '1',
    keep_tmp: true,
    force: false,
    vram_warn_mb: 2048,
    created_at: '2026-10-09T10:00:00Z',
    started_at: '2026-10-09T10:00:01Z',
    finished_at: '2026-10-09T10:04:13Z',
    artifact: 'out/demo.mp4',
  },
];

const CONFIG_RESPONSE = {
  yaml: '',
  valid: true,
  parsed: {
    project: 'demo',
    output: { mode: 'video', file: 'out/demo.mp4', contact_sheet: false },
    defaults: {
      model: '', voice: '', resolution: '1280x720', sampler: 'euler',
      steps: 30, fps: 30, subject_prompt: '', negative_prompt: '', lora_model_dir: '',
    },
    scenes: [
      { id: 'intro', prompt: 'x', negative_prompt: '', tts_text: 'x', speed: 1, lora: '' },
    ],
  },
};

type PageApi = {
  selectProject(id: string): Promise<void>;
  launch(extra?: Record<string, unknown>): Promise<void>;
  relaunchScene(id: string): Promise<void>;
  keepTmp: { set(v: boolean): void };
  gpu: { set(v: string[]): void };
  only: { set(v: string): void };
  reloadHistory(): Promise<void>;
  selected(): ReadonlySet<string>;
};

describe('RunsPageComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<RunsPageComponent>;
  let cmp: PageApi;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [RunsPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideAppDynamicForms()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(RunsPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/projects').flush([{ id: 'demo', name: 'demo', mode: 'video', scene_count: 1 }]);
    http.expectOne('/api/environment').flush(ENV);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    http.expectOne('/api/runs').flush(HISTORY);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    await fixture.whenStable();
    fixture.detectChanges();
    cmp = fixture.componentInstance as unknown as PageApi;
  });

  afterEach(() => http.verify());

  async function pickDemo(cache: CacheReport = CACHE): Promise<void> {
    const done = cmp.selectProject('demo');
    for (let i = 0; i < 5; i++) await Promise.resolve();
    http.expectOne('/api/runs?project=demo').flush(HISTORY);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    http.expectOne('/api/projects/demo/config').flush(CONFIG_RESPONSE);
    http.expectOne('/api/projects/demo/cache').flush(cache);
    await done;
    fixture.detectChanges();
  }

  describe('the project to launch, by mode', () => {
    const ids = () => (cmp as unknown as { launchProjects(): { id: string }[] }).launchProjects().map((p) => p.id);
    const withProjects = () => {
      TestBed.inject(ProjectsStore).projects.set([
        { id: 'demo', name: 'demo', mode: 'video', scene_count: 1 },
        { id: 'fotos', name: 'fotos', mode: 'images', scene_count: 1 },
        { id: 'cancion', name: 'cancion', mode: 'music', scene_count: 0 },
        { id: 'roto', name: 'roto', mode: '', scene_count: 0 },
      ]);
    };

    it('offers the same mode selector in the launch form, so a long list can be cut down', () => {
      expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid=launch-modes]')).not.toBeNull();
    });

    it('lists only the projects of the chosen modes (and those with no mode), and follows the choice', () => {
      withProjects();
      TestBed.inject(ModeFilterStore).set(['video']);
      expect(ids()).toEqual(['demo', 'roto']);
      TestBed.inject(ModeFilterStore).set(['music', 'images']);
      expect(ids()).toEqual(['fotos', 'cancion', 'roto']);
    });

    it('keeps the project already picked in the list, whatever its mode', () => {
      withProjects();
      TestBed.inject(ModeFilterStore).set(['video']);
      (cmp as unknown as { selectedProject: { set(v: string): void } }).selectedProject.set('cancion');
      expect(ids()).toEqual(['cancion', 'demo', 'roto']);
    });
  });

  it('launches with the selected options and navigates to the monitor', async () => {
    await pickDemo();
    cmp.gpu.set(['1']);
    cmp.only.set('intro');
    const done = cmp.launch();
    await Promise.resolve();
    const req = http.expectOne({ method: 'POST', url: '/api/projects/demo/runs' });
    expect(req.request.body).toEqual({
      gpu: '1',
      keep_tmp: true,
      force: false,
      only: 'intro',
      vram_warn_mb: 2048,
      mode: undefined,
    });
    req.flush({ run: { ...HISTORY[1], id: 'run-3', state: 'queued' }, queue_position: 0 });
    await done;
    expect(navigate).toHaveBeenCalledWith(['/runs', 'run-3']);
  });

  it('shows the Ollama caveat on the affected GPU and the cold-run warning', async () => {
    await pickDemo();
    const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

    cmp.gpu.set(['1']);
    fixture.detectChanges();
    expect(text()).toContain('Ollama retiene 4096 MB');
    cmp.gpu.set(['0']);
    fixture.detectChanges();
    expect(text()).not.toContain('Ollama retiene');

    expect(text()).not.toContain('saldrá en frío');
    cmp.keepTmp.set(false);
    fixture.detectChanges();
    expect(text()).toContain('saldrá en frío');
  });

  it('renders the cache report (motion change: clip re-runs, tts/render hit) and cold notice', async () => {
    await pickDemo();
    const el = fixture.nativeElement as HTMLElement;
    const chips = Array.from(el.querySelectorAll('.cache__table .chip')).map((c) => [
      c.className.match(/chip--(\w+)/)?.[1],
      c.textContent?.trim(),
    ]);
    expect(chips).toEqual([
      ['hit', 'hit'],
      ['always', 'always'],
      ['hit', 'hit'],
      ['run', 'run'],
    ]);
  });

  it('re-render of one scene launches with only=<scene>', async () => {
    await pickDemo();
    const done = cmp.relaunchScene('intro');
    await Promise.resolve();
    const req = http.expectOne({ method: 'POST', url: '/api/projects/demo/runs' });
    expect(req.request.body.only).toBe('intro');
    req.flush({ run: { ...HISTORY[1], id: 'run-4', state: 'queued' }, queue_position: 0 });
    await done;
    expect(navigate).toHaveBeenCalledWith(['/runs', 'run-4']);
  });

  it('history lists runs newest-first with state, duration and artifact', async () => {
    const el = fixture.nativeElement as HTMLElement;
    const rows = Array.from(el.querySelectorAll('.history tbody tr'));
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('run-2');
    expect(rows[0].textContent).toContain('failed');
    expect(rows[1].textContent).toContain('run-1');
    expect(rows[1].textContent).toContain('4 min 12 s');
    expect(rows[1].textContent).toContain('out/demo.mp4');
  });

  it('history links a succeeded video run to its artifact and gives failed runs no link', () => {
    const el = fixture.nativeElement as HTMLElement;
    const rows = Array.from(el.querySelectorAll('.history tbody tr'));
    const link = rows[1].querySelector('td:nth-child(7) a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/api/projects/demo/artifacts/out/demo.mp4');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(rows[0].querySelector('td:nth-child(7) a')).toBeNull(); // failed
  });

  it('a click on a run id goes to its monitor inside the app, without reloading the page', () => {
    const go = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const link = (fixture.nativeElement as HTMLElement).querySelector('.history tbody a[href="/runs/run-1"]') as HTMLAnchorElement;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(go).toHaveBeenCalledWith('/runs/run-1');
  });

  it('an images-mode run links to the gallery of its project', () => {
    const page = fixture.componentInstance as unknown as {
      resultOf(r: unknown): { kind: string; project?: string } | null;
    };
    const images = { ...HISTORY[1], artifact: 'out/demo/manifest.json' };
    expect(page.resultOf(images)).toEqual({ kind: 'gallery', project: 'demo' });
  });

  // --- several GPUs ------------------------------------------------------------

  it('launches with two GPUs as an ascending comma-separated list', async () => {
    await pickDemo();
    cmp.gpu.set(['1', '0']); // picked in this order
    const done = cmp.launch();
    await Promise.resolve();
    const req = http.expectOne({ method: 'POST', url: '/api/projects/demo/runs' });
    expect(req.request.body.gpu).toBe('0,1');
    req.flush({ run: { ...HISTORY[1], id: 'run-5', state: 'queued' }, queue_position: 0 });
    await done;
  });

  it('sends no gpu when none is selected', async () => {
    await pickDemo();
    cmp.gpu.set([]);
    const done = cmp.launch();
    await Promise.resolve();
    const req = http.expectOne({ method: 'POST', url: '/api/projects/demo/runs' });
    expect(req.request.body.gpu).toBeUndefined();
    req.flush({ run: { ...HISTORY[1], id: 'run-6', state: 'queued' }, queue_position: 0 });
    await done;
  });

  it('shows the warnings of every selected GPU, each naming its index, and the sharing note', async () => {
    await pickDemo();
    const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
    const note = () => (fixture.nativeElement as HTMLElement).querySelector('[data-testid=multi-gpu-note]');

    cmp.gpu.set(['0']);
    fixture.detectChanges();
    expect(note()).toBeNull();
    expect(text()).toContain('GPU 0: Queda poca VRAM libre (3000 MB)');

    cmp.gpu.set(['1', '0']);
    fixture.detectChanges();
    expect(text()).toContain('GPU 0: Queda poca VRAM libre (3000 MB)');
    expect(text()).toContain('GPU 1: Ollama retiene 4096 MB');
    expect(text().indexOf('GPU 0:')).toBeLessThan(text().indexOf('GPU 1:')); // ascending
    expect(note()?.textContent).toContain('una escena a la vez');
  });

  // --- the animate phase in the cache table -------------------------------------

  it('adds an animate column to the cache table only when the report carries the phase', async () => {
    await pickDemo({
      mode: 'video',
      cold: false,
      scenes: [
        { scene_id: 'cafe', phases: { tts: 'hit', probe: 'always', render: 'hit', animate: 'run', clip: 'run' } },
        { scene_id: 'lago', phases: { tts: 'hit', probe: 'always', render: 'hit', clip: 'hit' } },
      ],
    });
    const el = fixture.nativeElement as HTMLElement;
    const headers = Array.from(el.querySelectorAll('.cache__table th.mo-data')).map((h) => h.textContent?.trim());
    expect(headers).toEqual(['tts', 'probe', 'render', 'animate', 'clip']);
    const rows = Array.from(el.querySelectorAll('.cache__table tbody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('.chip')).map((c) => c.textContent?.trim()),
    );
    expect(rows[0]).toEqual(['hit', 'always', 'hit', 'run', 'run']);
    expect(rows[1]).toEqual(['hit', 'always', 'hit', 'n/a', 'hit']); // lago does not animate
  });

  it('keeps the original cache columns without animate', async () => {
    await pickDemo();
    const el = fixture.nativeElement as HTMLElement;
    const headers = Array.from(el.querySelectorAll('.cache__table th.mo-data')).map((h) => h.textContent?.trim());
    expect(headers).toEqual(['tts', 'probe', 'render', 'clip']);
  });

  describe('deleting from the history', () => {
    const mk = (id: string, state: Run['state'], project = 'demo'): Run => ({
      id,
      project,
      state,
      gpu: '',
      keep_tmp: true,
      force: false,
      vram_warn_mb: 2048,
      created_at: '2026-10-09T10:00:00Z',
    });
    const LIST: Run[] = [mk('run-live', 'running'), mk('run-a', 'succeeded'), mk('run-b', 'failed'), mk('run-c', 'cancelled')];
    const el = () => fixture.nativeElement as HTMLElement;
    const q = (sel: string) => el().querySelector(sel) as HTMLElement | null;
    const settle = async () => {
      for (let i = 0; i < 6; i++) await Promise.resolve();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const load = async (runs: Run[] = LIST, url = '/api/runs') => {
      const p = cmp.reloadHistory();
      http.expectOne(url).flush(runs);
      await p;
      await settle();
    };
    const confirmWith = (answer: boolean) =>
      vi.spyOn(TestBed.inject(MatDialog), 'open').mockReturnValue({ afterClosed: () => of(answer) } as never);
    /** The row of a run in the library's table. */
    const rowOf = (id: string) =>
      Array.from(el().querySelectorAll('.history tbody tr')).find((tr) => tr.querySelector('td a')?.textContent?.trim() === id) as HTMLElement | undefined ?? null;
    const box = (id: string) => rowOf(id)?.querySelector('td.df-table__check input') as HTMLInputElement | null;
    const del = (id: string) => rowOf(id)?.querySelector('button.df-table__action') as HTMLButtonElement | null;
    const tick = async (id: string) => {
      box(id)!.click();
      await settle();
    };
    /** Answers the reload that follows a deletion. */
    const reloadWith = async (runs: Run[], url = '/api/runs') => {
      await settle();
      http.expectOne(url).flush(runs);
      await settle();
    };

    it('gives finished runs a checkbox and a delete button, and active runs neither', async () => {
      await load();
      for (const id of ['run-a', 'run-b', 'run-c']) {
        expect(box(id)!.disabled).toBe(false);
        expect(del(id)).not.toBeNull();
      }
      expect(box('run-live')!.disabled).toBe(true);
      expect(del('run-live')).toBeNull();
    });

    it('deletes one run after confirming, then reloads and reports it', async () => {
      await load();
      const spy = confirmWith(true);
      del('run-a')!.click();
      await settle();
      const msg = (spy.mock.calls[0][1] as { data: { message: string } }).data.message;
      expect(msg).toContain('1 run(s)');
      expect(msg).toContain('no se puede deshacer');
      expect(msg).toContain('ficheros que generaron');
      const req = http.expectOne('/api/runs/run-a');
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
      await reloadWith(LIST.filter((r) => r.id !== 'run-a'));
      expect(rowOf('run-a')).toBeNull();
      expect(q('[data-testid=delete-result]')?.textContent).toContain('Borrados: 1.');
    });

    it('also deletes the output files when the dialog option is ticked', async () => {
      await load();
      vi.spyOn(TestBed.inject(MatDialog), 'open').mockReturnValue({
        afterClosed: () => of({ confirmed: true, option: true }),
      } as never);
      await tick('run-a');
      (q('[data-testid=delete-selected]') as HTMLButtonElement).click();
      await settle();
      const req = http.expectOne('/api/runs/delete');
      expect(req.request.body).toEqual({ ids: ['run-a'], delete_files: true });
      req.flush({ deleted: 1, skipped_active: [], files_removed: 1 });
      await reloadWith(LIST.filter((r) => r.id !== 'run-a'));
      expect(q('[data-testid=delete-result]')?.textContent).toContain('Carpetas borradas: 1.');
    });

    it('deletes nothing when the confirmation is dismissed, and keeps the selection', async () => {
      await load();
      await tick('run-a');
      confirmWith(false);
      (q('[data-testid=delete-selected]') as HTMLButtonElement).click();
      del('run-b')!.click();
      await settle();
      http.expectNone('/api/runs/delete');
      http.expectNone('/api/runs/run-b');
      expect(cmp.selected().has('run-a')).toBe(true);
    });

    it('deletes the selected runs with one request, then empties the selection', async () => {
      await load();
      await tick('run-a');
      await tick('run-c');
      expect(q('[data-testid=selected-count]')?.textContent).toContain('2');
      const spy = confirmWith(true);
      (q('[data-testid=delete-selected]') as HTMLButtonElement).click();
      await settle();
      expect((spy.mock.calls[0][1] as { data: { message: string } }).data.message).toContain('2 run(s)');
      const req = http.expectOne('/api/runs/delete');
      expect(req.request.method).toBe('POST');
      expect([...req.request.body.ids].sort()).toEqual(['run-a', 'run-c']);
      expect(req.request.body.project).toBeUndefined();
      req.flush({ deleted: 2, skipped_active: [] });
      await reloadWith([LIST[0], LIST[2]]);
      expect(cmp.selected().size).toBe(0);
      expect(q('[data-testid=delete-result]')?.textContent).toContain('Borrados: 2.');
    });

    it('says how many runs were skipped because they were active, and still empties the selection', async () => {
      await load();
      await tick('run-a');
      await tick('run-b');
      confirmWith(true);
      (q('[data-testid=delete-selected]') as HTMLButtonElement).click();
      await settle();
      http.expectOne('/api/runs/delete').flush({ deleted: 1, skipped_active: ['run-b'] });
      // run-b became active in the meantime: it is still in the list
      await reloadWith([LIST[0], { ...LIST[2], state: 'running' }, LIST[3]]);
      const t = q('[data-testid=delete-result]')?.textContent ?? '';
      expect(t).toContain('Borrados: 1.');
      expect(t).toContain('No se borraron 1 por estar activos');
      expect(cmp.selected().size).toBe(0);
    });

    it('deletes every finished run of the project filter, sending the finished states', async () => {
      await pickDemo();
      await load(LIST, '/api/runs?project=demo');
      const spy = confirmWith(true);
      (q('[data-testid=delete-all-finished]') as HTMLButtonElement).click();
      await settle();
      expect((spy.mock.calls[0][1] as { data: { message: string } }).data.message).toContain('3 run(s)');
      const req = http.expectOne('/api/runs/delete');
      expect(req.request.body.project).toBe('demo');
      expect([...req.request.body.states].sort()).toEqual(['cancelled', 'failed', 'interrupted', 'succeeded']);
      expect(req.request.body.ids).toBeUndefined();
      req.flush({ deleted: 3, skipped_active: [] });
      await reloadWith([LIST[0]], '/api/runs?project=demo');
    });

    it('without a project filter it sends only the finished states', async () => {
      await load();
      confirmWith(true);
      (q('[data-testid=delete-all-finished]') as HTMLButtonElement).click();
      await settle();
      const req = http.expectOne('/api/runs/delete');
      expect(Object.keys(req.request.body)).toEqual(['states']);
      req.flush({ deleted: 3, skipped_active: [] });
      await reloadWith([LIST[0]]);
    });

    it('selects every finished run of the list, and only those', async () => {
      await load();
      (q('[data-testid=select-all-finished]') as HTMLButtonElement).click();
      await settle();
      expect([...cmp.selected()].sort()).toEqual(['run-a', 'run-b', 'run-c']);
      (q('[data-testid=clear-selection]') as HTMLButtonElement).click();
      await settle();
      expect(cmp.selected().size).toBe(0);
    });

    it('the header checkbox selects the finished runs of the page', async () => {
      await load();
      (q('.history thead input') as HTMLInputElement).click();
      await settle();
      expect([...cmp.selected()].sort()).toEqual(['run-a', 'run-b', 'run-c']);
      (q('.history thead input') as HTMLInputElement).click();
      await settle();
      expect(cmp.selected().size).toBe(0);
    });

    describe('the modes shown', () => {
      // `demo` is a video project; the page needs the modes of the other two to tell their runs apart.
      const withModes = async () => {
        TestBed.inject(ProjectsStore).projects.set([
          { id: 'demo', name: 'demo', mode: 'video', scene_count: 1 },
          { id: 'fotos', name: 'fotos', mode: 'images', scene_count: 1 },
          { id: 'cancion', name: 'cancion', mode: 'music', scene_count: 0 },
        ]);
        TestBed.inject(ModeFilterStore).set(['video']);
        await load([mk('run-v', 'succeeded', 'demo'), mk('run-i', 'succeeded', 'fotos'), mk('run-m', 'failed', 'cancion'), mk('run-gone', 'succeeded', 'borrado')]);
      };

      it('lists only the runs of the chosen modes, and those whose project is gone', async () => {
        await withModes();
        expect(rowOf('run-v')).not.toBeNull();
        expect(rowOf('run-gone')).not.toBeNull();
        expect(rowOf('run-i')).toBeNull();
        expect(rowOf('run-m')).toBeNull();
      });

      it('follows the choice, which is the one of the projects list', async () => {
        await withModes();
        TestBed.inject(ModeFilterStore).set(['video', 'music']);
        await settle();
        expect(rowOf('run-m')).not.toBeNull();
        expect(rowOf('run-i')).toBeNull();
      });

      it('says which modes are hidden when the chosen ones have no runs, and shows them all on request', async () => {
        await withModes();
        TestBed.inject(ModeFilterStore).set(['images']);
        await load([mk('run-v', 'succeeded', 'demo'), mk('run-m', 'failed', 'cancion')]);
        expect(q('[data-testid=runs-hidden]')?.textContent).toContain('(1)');
        (q('[data-testid=runs-show-all]') as HTMLButtonElement).click();
        await settle();
        expect(rowOf('run-v')).not.toBeNull();
        expect(rowOf('run-m')).not.toBeNull();
      });

      it('selects and counts only the finished runs that are shown', async () => {
        await withModes();
        (q('[data-testid=select-all-finished]') as HTMLButtonElement).click();
        await settle();
        expect([...cmp.selected()].sort()).toEqual(['run-gone', 'run-v']);
      });

      it('"delete all finished" never reaches a run of a hidden mode: it names the ones in the list', async () => {
        await withModes();
        confirmWith(true);
        (q('[data-testid=delete-all-finished]') as HTMLButtonElement).click();
        await settle();
        const req = http.expectOne('/api/runs/delete');
        expect(req.request.body.ids.sort()).toEqual(['run-gone', 'run-v']);
        expect(req.request.body.states).toBeUndefined();
        req.flush({ deleted: 2, skipped_active: [] });
        await reloadWith([]);
      });
    });

    it('keeps delete buttons disabled while there is nothing to delete', async () => {
      await load([LIST[0]]);
      expect((q('[data-testid=delete-selected]') as HTMLButtonElement).disabled).toBe(true);
      expect((q('[data-testid=delete-all-finished]') as HTMLButtonElement).disabled).toBe(true);
      expect((q('[data-testid=select-all-finished]') as HTMLButtonElement).disabled).toBe(true);
    });

    it('drops from the selection the runs that left the list', async () => {
      await load();
      await tick('run-a');
      await tick('run-b');
      await load(LIST.filter((r) => r.id !== 'run-a'));
      expect([...cmp.selected()]).toEqual(['run-b']);
    });

    it('keeps the selection when the deletion fails', async () => {
      await load();
      await tick('run-a');
      confirmWith(true);
      (q('[data-testid=delete-selected]') as HTMLButtonElement).click();
      await settle();
      http.expectOne('/api/runs/delete').flush({ error: { code: 'internal_error', message: 'x' } }, { status: 500, statusText: 'x' });
      await settle();
      expect(cmp.selected().has('run-a')).toBe(true);
      expect(q('[data-testid=delete-result]')).toBeNull();
    });
  });

  describe('layout', () => {
    const el = () => fixture.nativeElement as HTMLElement;

    it('groups the launch form by purpose: what to run, where, and options', () => {
      const groups = Array.from(el().querySelectorAll('.launch fieldset.group'));
      expect(groups.map((g) => g.querySelector('legend')?.textContent?.trim())).toEqual(['Qué ejecutar', 'Dónde', 'Opciones']);
      expect(groups[0].querySelectorAll('mat-form-field').length).toBe(3); // project, scene, run mode (the modes and origins shown are filters, above)
      expect(groups[1].querySelectorAll('mat-form-field').length).toBe(2); // GPU, VRAM warning
      expect(groups[2].querySelectorAll('mat-checkbox').length).toBe(2); // keep-tmp, force
    });

    it('has a single filled button in the launch form: Launch run', () => {
      const filled = Array.from(el().querySelectorAll('.launch button')).filter((b) => b.className.includes('mat-mdc-unelevated-button'));
      expect(filled.length).toBe(1);
      expect(filled[0].textContent).toContain('Lanzar run');
    });

    it('keeps the flag labels on one line', () => {
      const labels = Array.from(el().querySelectorAll('.launch__flags mat-checkbox')).map((c) => c.textContent?.trim());
      expect(labels).toEqual(['keep-tmp', 'force']);
    });

    it('says no run has been launched yet when the history is empty, and hides the table tools', async () => {
      const p = cmp.reloadHistory();
      http.expectOne('/api/runs').flush([]);
      await p;
      for (let i = 0; i < 6; i++) await Promise.resolve();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(el().querySelector('mo-empty-state')?.textContent).toContain('Todavía no has lanzado ningún run');
      expect(el().querySelector('[data-testid=history-tools]')).toBeNull();
      expect(el().querySelector('.history table')).toBeNull();
    });

    it('right-aligns the durations in their own column', () => {
      const cells = el().querySelectorAll('.history .duration');
      expect(cells.length).toBeGreaterThan(0);
    });
  });

  it('warns before launching when the disk is low, and says nothing when it is not', async () => {
    const store = TestBed.inject(EnvironmentStore);
    const note = () => (fixture.nativeElement as HTMLElement).querySelector('[data-testid=disk-low-warning]');
    expect(note()).toBeNull();
    store.report.update((r) => ({ ...r!, disk: { free_bytes: 3e9, total_bytes: 1e12, warn_below_bytes: 20e9, low: true } }));
    fixture.detectChanges();
    expect(note()?.textContent).toContain('poco espacio');
    expect(note()?.textContent).toContain('2,8 GB');
    store.report.update((r) => ({ ...r!, disk: { free_bytes: 500e9, total_bytes: 1e12, warn_below_bytes: 20e9, low: false } }));
    fixture.detectChanges();
    expect(note()).toBeNull();
  });
});
