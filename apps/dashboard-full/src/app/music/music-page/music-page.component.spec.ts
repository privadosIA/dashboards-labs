import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router, provideRouter } from '@angular/router';
import { load } from 'js-yaml';
import { signal } from '@angular/core';
import { Observable, of } from 'rxjs';

import { EnvironmentReport, MusicManifest, MusicManifestEntry, ProjectConfig, Run } from '../../core/api.models';
import { ModelsStore } from '../../core/models.store';
import { RunStreamService } from '../../core/run-stream.service';
import { RepaintDialogComponent } from '../wave/repaint-dialog.component';
import { SeparateDialogComponent } from '../wave/separate-dialog.component';
import { MixDialogComponent } from '../mix/mix-dialog.component';
import { MusicStore } from '../music.store';
import { MusicPageComponent } from './music-page.component';
import { AvailabilityStore } from '../../core/availability.store';
import { EnginesStore } from '../../core/engines.store';
import { fakeEngines } from '../../core/engines.fake';
import { ALL_AVAILABLE } from '../../core/availability.fake';

class FakeES {
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: MessageEvent<string>) => void) | null = null;
  listeners = new Map<string, (e: MessageEvent<string>) => void>();
  addEventListener(t: string, fn: (e: MessageEvent<string>) => void): void {
    this.listeners.set(t, fn);
  }
  close(): void {}
  feed(events: object[]): void {
    this.onopen?.({});
    for (const e of events) this.onmessage?.({ data: JSON.stringify(e) } as MessageEvent<string>);
  }
  end(state: object): void {
    this.listeners.get('run-state')?.({ data: JSON.stringify(state) } as MessageEvent<string>);
    this.listeners.get('stream-end')?.({ data: '{}' } as MessageEvent<string>);
  }
}

const CONFIG: ProjectConfig = {
  project: 'songs',
  output: { mode: 'music', file: '', contact_sheet: false },
  defaults: {
    model: '', voice: '', resolution: '', sampler: '', steps: 0, fps: 0,
    subject_prompt: '', negative_prompt: '', lora_model_dir: '',
  },
  scenes: [],
  tracks: [
    { id: 'ballad', prompt: 'Spanish pop ballad', lyrics: '[Verse]\nhola', vocal_language: 'es', seed: 7 },
    { id: 'idea', prompt: 'lofi beat', instrumental: true },
  ],
};

const REPORT: EnvironmentReport = {
  binaries: [
    { name: 'ace-synth', required: false, present: true, path: '/x/ace-synth' },
    { name: 'ace-lm', required: false, present: true, path: '/x/ace-lm' },
  ],
  models: [], voices: [], loras: [],
  music: [
    { name: 'acestep-5Hz-lm-1.7B-Q8_0.gguf', size: 1 },
    { name: 'acestep-v15-turbo-Q8_0.gguf', size: 1 },
    { name: 'vae-BF16.gguf', size: 1 },
  ],
  gpus: [{ index: 0, name: 'RTX 4070', free_vram_mb: 9000 }, { index: 1, name: 'RTX 5060 Ti', free_vram_mb: 15000 }],
};

const entry = (over: Partial<MusicManifestEntry> = {}): MusicManifestEntry => ({
  track_id: 'ballad', variant: 0, effective_seed: 7, use_lm: false,
  caption: 'Spanish pop ballad', lyrics_requested: '[Verse]\nhola', lyrics_sung: '[Verse]\nhola',
  bpm: 96, audio_seconds: 125, keyscale: 'G minor', synth_model: 'acestep-v15-turbo-Q8_0.gguf',
  params: {}, file: 'out/songs/ballad.mp3', ...over,
});
const manifest = (...tracks: MusicManifestEntry[]): MusicManifest =>
  ({ project: 'songs', mode: 'music', generated_at: 'x', tracks });

const RUN: Run = {
  id: 'run-1', project: 'songs', state: 'running', gpu: '1', keep_tmp: true, force: false,
  vram_warn_mb: 2048, created_at: '2026-10-10T10:00:00Z',
};

describe('MusicPageComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<MusicPageComponent>;
  let es: FakeES;
  let confirm = true;

  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends Element = HTMLElement>(sel: string) => el().querySelector(sel) as T;
  const qa = (sel: string) => Array.from(el().querySelectorAll(sel)) as HTMLElement[];
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
  };
  const type = async (sel: string, value: string) => {
    const input = q<HTMLInputElement | HTMLTextAreaElement>(sel);
    input.value = value;
    input.dispatchEvent(new Event('change'));
    await settle();
  };
  const click = async (sel: string) => {
    q<HTMLButtonElement>(sel).click();
    await settle();
  };
  const manifestUrl = '/api/projects/songs/artifacts/out/songs/manifest.json';

  /** The names on the track cards, as they read. */
  const titles = () => qa('mat-expansion-panel.track > mat-expansion-panel-header mat-panel-title').map((t) => Array.from(t.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent ?? '').join('').trim()); // the name only, not the checkbox or the warning icon around it
  const isOpen = (i: number) => q(`[data-testid="track-${i}"] mat-expansion-panel-header`).getAttribute('aria-expanded') === 'true';

  async function open(opts: { config?: ProjectConfig; report?: EnvironmentReport; results?: MusicManifest | null; sources?: { name: string; size: number; modified: string }[] } = {}) {
    fixture = TestBed.createComponent(MusicPageComponent);
    fixture.componentRef.setInput('id', 'songs');
    fixture.detectChanges();
    http.expectOne('/api/environment').flush(opts.report ?? REPORT);
    http.expectOne('/api/projects/songs/config').flush({ yaml: '', parsed: structuredClone(opts.config ?? CONFIG), valid: true });
    await settle();
    http.match('/api/projects/songs/sources').forEach((r) => r.flush({ sources: opts.sources ?? [] }));
    const m = http.match(manifestUrl)[0];
    if (m) {
      if (opts.results) m.flush(opts.results);
      else m.flush({}, { status: 404, statusText: 'Not Found' });
    }
    await settle();
  }

  const dialogOpen = vi.fn((..._args: unknown[]) => ({ afterClosed: (): Observable<unknown> => of(confirm) }));

  let engines = fakeEngines();

  beforeEach(async () => {
    engines = fakeEngines();
    confirm = true;
    dialogOpen.mockClear();
    await TestBed.configureTestingModule({
      imports: [MusicPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MatDialog, useValue: { open: dialogOpen } },
        // The studio reads the catalog to offer covers; its requests are not the subject of these tests.
        { provide: EnginesStore, useValue: engines },
        { provide: ModelsStore, useValue: { catalog: signal([]), refresh: vi.fn(() => Promise.resolve()) } },
      ],
    }).compileComponents();
    TestBed.inject(AvailabilityStore).data.set(ALL_AVAILABLE);
    TestBed.inject(RunStreamService).esFactory = () => {
      es = new FakeES();
      return es;
    };
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.match((r) => r.url.endsWith('/resources')).forEach((r) => r.flush({}));
    http.match((r) => r.url.endsWith('/sources')).forEach((r) => r.flush({ sources: [] }));
    http.match((r) => r.urlWithParams.includes('/peaks')).forEach((r) => r.flush({}, { status: 404, statusText: 'Not Found' })); // the waveforms are not the subject unless a test answers them
    http.verify();
  });

  describe('the create view', () => {
    it('Easy mode "apply and create" writes the plan and launches the songs in one click', async () => {
      await open();
      const store = fixture.debugElement.injector.get(MusicStore);
      const launch = vi.spyOn(store, 'launch').mockResolvedValue(undefined as never);
      const apply = vi.spyOn(store, 'applyAuto');
      await click('[data-testid="auto-create"]');
      expect(apply).toHaveBeenCalled();
      expect(launch).toHaveBeenCalledTimes(1);
      expect(apply.mock.invocationCallOrder[0]).toBeLessThan(launch.mock.invocationCallOrder[0]);
    });

    it('shows each track as a card with only the fields that apply to a song', async () => {
      await open();
      expect(qa('mat-expansion-panel.track').length).toBe(2);
      const first = q('[data-testid="track-0"]');
      expect(first.querySelector<HTMLInputElement>('[data-testid="track-id"]')!.value).toBe('ballad');
      expect(first.querySelector<HTMLTextAreaElement>('[data-testid="track-prompt"]')!.value).toBe('Spanish pop ballad');
      expect(first.querySelector<HTMLTextAreaElement>('[data-testid="track-lyrics"]')!.value).toBe('[Verse]\nhola');
      for (const id of ['duration', 'bpm', 'key', 'timesignature', 'seed', 'variants', 'language', 'instrumental']) {
        expect(first.querySelector(`[data-testid="track-${id}"]`), id).not.toBeNull();
      }
      // nothing from the video or image editors
      for (const word of ['tts_text', 'negative_prompt', 'motion', 'resolution', 'sampler', 'fps']) {
        expect(el().textContent).not.toContain(word);
      }
      expect(first.querySelector<HTMLInputElement>('[data-testid="track-seed"]')!.value).toBe('7');
    });

    it('disables the lyrics for an instrumental track and does not send them', async () => {
      await open();
      const second = q('[data-testid="track-1"]');
      expect(second.querySelector<HTMLTextAreaElement>('[data-testid="track-lyrics"]')!.disabled).toBe(true);
      // switch the first track to instrumental: its lyrics stay on screen but leave the file
      q('[data-testid="track-0"] [data-testid="track-instrumental"] button').click();
      await settle();
      expect(q<HTMLTextAreaElement>('[data-testid="track-0"] [data-testid="track-lyrics"]').disabled).toBe(true);
      expect(q<HTMLTextAreaElement>('[data-testid="track-0"] [data-testid="track-lyrics"]').value).toBe('[Verse]\nhola');
      await click('[data-testid="save"]');
      const req = http.expectOne('/api/projects/songs/config');
      const doc = load(req.request.body.yaml) as { tracks: Record<string, unknown>[] };
      expect(doc.tracks[0]['instrumental']).toBe(true);
      expect('lyrics' in doc.tracks[0]).toBe(false);
      req.flush({ saved: true });
    });

    it('saves edits as a music scenes.yaml and keeps Save off until something changed', async () => {
      await open();
      expect(q<HTMLButtonElement>('[data-testid="save"]').disabled).toBe(true);
      await type('[data-testid="track-0"] [data-testid="track-prompt"]', 'Rock ballad');
      await type('[data-testid="track-0"] [data-testid="track-duration"]', '120');
      await type('[data-testid="track-0"] [data-testid="track-variants"]', '3');
      expect(q<HTMLButtonElement>('[data-testid="save"]').disabled).toBe(false);
      await click('[data-testid="save"]');
      const req = http.expectOne('/api/projects/songs/config');
      expect(req.request.method).toBe('PUT');
      const doc = load(req.request.body.yaml) as { output: object; tracks: Record<string, unknown>[]; scenes?: unknown };
      expect(doc.output).toEqual({ mode: 'music' });
      expect(doc.tracks[0]).toMatchObject({ id: 'ballad', prompt: 'Rock ballad', duration_seconds: 120, variants: 3, seed: 7 });
      expect('scenes' in doc).toBe(false);
      req.flush({ saved: true });
      await settle();
      expect(q<HTMLButtonElement>('[data-testid="save"]').disabled).toBe(true);
    });

    it('evens the loudness of the songs: writes the level, and removes it when left as the engine makes them', async () => {
      await open();
      q('[data-testid="engine-panel"] mat-expansion-panel-header').click();
      await settle();
      const pick = async (i: number) => {
        q('[data-testid="loudness"] .mat-mdc-select-trigger').click();
        await settle();
        (document.querySelectorAll('mat-option')[i] as HTMLElement).click();
        await settle();
      };
      await pick(1);
      await click('[data-testid="save"]');
      let req = http.expectOne('/api/projects/songs/config');
      expect((load(req.request.body.yaml) as { defaults: { music: Record<string, unknown> } }).defaults.music['loudness_lufs']).toBe(-14);
      req.flush({ saved: true });
      await settle();
      await pick(0);
      await click('[data-testid="save"]');
      req = http.expectOne('/api/projects/songs/config');
      expect(req.request.body.yaml).not.toContain('loudness_lufs');
      req.flush({ saved: true });
    });

    it('empties an optional field into an absent key', async () => {
      await open();
      await type('[data-testid="track-0"] [data-testid="track-seed"]', '');
      await click('[data-testid="save"]');
      const req = http.expectOne('/api/projects/songs/config');
      const doc = load(req.request.body.yaml) as { tracks: Record<string, unknown>[] };
      expect('seed' in doc.tracks[0]).toBe(false);
      req.flush({ saved: true });
    });

    it('labels the empty language option as automatic and removes the field when it is chosen again', async () => {
      await open();
      const lang = '[data-testid="track-0"] [data-testid="track-language"]';
      q(`${lang} .mat-mdc-select-trigger`).click();
      await settle();
      const options = Array.from(document.querySelectorAll('mat-option')).map((o) => o.textContent ?? '');
      expect(options[0]).toContain('Automático (según la letra; inglés si no hay)');
      expect(options.join('|')).not.toContain('decida el modelo');
      (document.querySelector('mat-option') as HTMLElement).click(); // the automatic option
      await settle();
      await click('[data-testid="save"]');
      const req = http.expectOne('/api/projects/songs/config');
      const doc = load(req.request.body.yaml) as { tracks: Record<string, unknown>[] };
      expect('vocal_language' in doc.tracks[0]).toBe(false);
      req.flush({ saved: true });
    });

    it('writes the chosen voice of a track and of the project, and removes the key when automatic is chosen again', async () => {
      await open();
      const choose = async (select: string, label: string) => {
        const trigger = q(`${select} .mat-mdc-select-trigger`);
        trigger.click();
        await settle();
        const panel = document.getElementById(q(select).getAttribute('aria-controls') ?? '');
        const opt = Array.from(panel?.querySelectorAll('mat-option') ?? []).find((o) => (o.textContent ?? '').includes(label));
        (opt as HTMLElement).click();
        await settle();
      };
      await choose('[data-testid="track-0"] [data-testid="track-vocals"]', 'Mujer');
      await choose('[data-testid="default-vocals"]', 'Coro');
      await click('[data-testid="save"]');
      let req = http.expectOne('/api/projects/songs/config');
      let doc = load(req.request.body.yaml) as { defaults: { music: Record<string, unknown> }; tracks: Record<string, unknown>[] };
      expect(doc.tracks[0]['vocals']).toBe('female');
      expect(doc.defaults.music['vocals']).toBe('choir');
      req.flush({ saved: true });
      await settle();
      await choose('[data-testid="track-0"] [data-testid="track-vocals"]', 'Automática');
      await click('[data-testid="save"]');
      req = http.expectOne('/api/projects/songs/config');
      doc = load(req.request.body.yaml) as typeof doc;
      expect('vocals' in doc.tracks[0]).toBe(false);
      req.flush({ saved: true });
    });

    it('mixes the ticked tracks, in list order, and opens the mixer on the new mix', async () => {
      await open();
      expect(q('[data-testid="pickbar"]')).toBeNull();
      q('[data-testid="pick-track-1"] input').click();
      await settle();
      q('[data-testid="pick-track-0"] input').click();
      await settle();
      expect(isOpen(0)).toBe(false); // ticking does not unfold the card
      expect(q('[data-testid="pickbar"]').textContent).toContain('2 pistas elegidas');
      await click('[data-testid="mix-picked"]');
      expect(q('[data-testid="pickbar"]')).toBeNull();
      expect(q('[data-testid="mixrow-0"]').textContent).toContain('2 pistas');
      await click('[data-testid="save"]');
      const req = http.expectOne('/api/projects/songs/config');
      const doc = load(req.request.body.yaml) as { mixes: { clips: { track: string }[] }[] };
      expect(doc.mixes[0].clips.map((c) => c.track)).toEqual(['ballad', 'idea']);
      req.flush({ saved: true });
    });

    it('blocks saving a track without a style and says why next to the field', async () => {
      await open();
      await type('[data-testid="track-1"] [data-testid="track-prompt"]', '   ');
      expect(q<HTMLButtonElement>('[data-testid="save"]').disabled).toBe(true);
      expect(q('[data-testid="track-1"]').textContent).toContain('prompt no puede estar vacío');
      expect(q<HTMLButtonElement>('[data-testid="track-1"] [data-testid="create-track"]').disabled).toBe(true);
    });

    it('shows the server\'s rejection on the track and field it names', async () => {
      await open();
      await type('[data-testid="track-0"] [data-testid="track-bpm"]', '90');
      await click('[data-testid="save"]');
      http.expectOne('/api/projects/songs/config').flush(
        { error: { code: 'validation_failed', message: 'config: track "ballad": bpm must be > 0, got 0\nconfig: music synthesis model "x.gguf" not found in models/music' } },
        { status: 422, statusText: 'Unprocessable' },
      );
      await settle();
      expect(q('[data-testid="track-0"]').textContent).toContain('bpm must be > 0');
      expect(q('[data-testid="track-1"]').textContent).not.toContain('bpm must be > 0');
      expect(q('.server-error').textContent).toContain('not found in models/music'); // project-level, above the tracks
      expect(q<HTMLButtonElement>('[data-testid="save"]').disabled).toBe(false); // still dirty
    });

    it('adds, reorders and removes tracks', async () => {
      await open();
      await click('[data-testid="add-track"]');
      expect(qa('mat-expansion-panel.track').length).toBe(3);
      expect(titles()).toEqual(['ballad', 'idea', 'pista_3']);
      q('[data-testid="track-2"] button[aria-label="Subir pista"]').click();
      await settle();
      expect(titles()).toEqual(['ballad', 'pista_3', 'idea']);
      expect(q<HTMLButtonElement>('[data-testid="track-0"] button[aria-label="Subir pista"]').disabled).toBe(true);
      await click('[data-testid="track-1"] [data-testid="remove-track"]');
      expect(titles()).toEqual(['ballad', 'idea']);
    });

    it('does not remove a track when the confirmation is declined', async () => {
      confirm = false;
      await open();
      await click('[data-testid="track-1"] [data-testid="remove-track"]');
      expect(qa('mat-expansion-panel.track').length).toBe(2);
    });

    it('shows an empty state with a way to add the first track', async () => {
      await open({ config: { ...CONFIG, tracks: [] } });
      expect(el().textContent).toContain('aún no tiene pistas');
      await click('mo-empty-state button');
      expect(qa('mat-expansion-panel.track').length).toBe(1);
    });

    it('sends a project that is not a music project to the scene editor', async () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      await open({ config: { ...CONFIG, output: { mode: 'video', file: 'o.mp4', contact_sheet: false }, tracks: undefined } });
      expect(navigate).toHaveBeenCalledWith(['/projects', 'songs', 'editor'], { replaceUrl: true });
    });
  });

  describe('engine settings', () => {
    it('offers the installed models and writes the choice, the format and the steps into defaults.music', async () => {
      await open();
      await click('[data-testid="format"] mat-button-toggle[value="wav"] button');
      await type('[data-testid="steps"]', '8');
      await click('[data-testid="save"]');
      const req = http.expectOne('/api/projects/songs/config');
      const doc = load(req.request.body.yaml) as { defaults: { music: object } };
      expect(doc.defaults.music).toEqual({ output_format: 'wav', inference_steps: 8 });
      req.flush({ saved: true });
    });

    it('writes the shared style into defaults.music.style_prefix, and removes the key when emptied', async () => {
      await open();
      await type('[data-testid="style-prefix"]', 'producción analógica cálida');
      await click('[data-testid="save"]');
      let req = http.expectOne('/api/projects/songs/config');
      let doc = load(req.request.body.yaml) as { defaults?: { music?: Record<string, unknown> } };
      expect(doc.defaults?.music).toEqual({ style_prefix: 'producción analógica cálida' });
      req.flush({ saved: true });
      await settle();
      await type('[data-testid="style-prefix"]', '');
      await click('[data-testid="save"]');
      req = http.expectOne('/api/projects/songs/config');
      doc = load(req.request.body.yaml) as { defaults?: { music?: Record<string, unknown> } };
      expect(doc.defaults?.music).toBeUndefined(); // nothing left to write: the whole block goes
      req.flush({ saved: true });
    });

    it('shows each track\'s prompt as typed, without the prefix', async () => {
      await open({ config: { ...CONFIG, defaults: { ...CONFIG.defaults, music: { style_prefix: 'warm analog' } } } });
      expect(q<HTMLInputElement>('[data-testid="style-prefix"]').value).toBe('warm analog');
      expect(q<HTMLTextAreaElement>('[data-testid="track-0"] [data-testid="track-prompt"]').value).toBe('Spanish pop ballad');
    });

    describe('quality levels', () => {
      const pick = async (label: string) => {
        q('[data-testid="quality"] .mat-mdc-select-trigger').click();
        await settle();
        const opt = Array.from(document.querySelectorAll('mat-option')).find((o) => (o.textContent ?? '').includes(label)) as HTMLElement;
        opt.click();
        await settle();
      };
      const withSft = { ...REPORT, music: [...REPORT.music!, { name: 'acestep-v15-sft-Q8_0.gguf', size: 1 }, { name: 'acestep-v15-xl-turbo-Q8_0.gguf', size: 1 }] };

      it('starts on Normal, and Máxima writes the SFT with its 50 steps and shift 1; Normal clears them again', async () => {
        await open({ report: withSft });
        expect(q('[data-testid="quality"]').textContent).toContain('Normal');
        await pick('Máxima');
        await click('[data-testid="save"]');
        let req = http.expectOne('/api/projects/songs/config');
        let doc = load(req.request.body.yaml) as { defaults: { music: Record<string, unknown> } };
        expect(doc.defaults.music).toMatchObject({ synth_model: 'acestep-v15-sft-Q8_0.gguf', inference_steps: 50, shift: 1 });
        req.flush({ saved: true });
        await settle();
        await pick('Normal');
        await click('[data-testid="save"]');
        req = http.expectOne('/api/projects/songs/config');
        doc = load(req.request.body.yaml) as typeof doc;
        expect(doc.defaults?.music ?? {}).not.toHaveProperty('synth_model');
        expect(doc.defaults?.music ?? {}).not.toHaveProperty('inference_steps');
        expect(doc.defaults?.music ?? {}).not.toHaveProperty('shift');
        req.flush({ saved: true });
      });

      it('flags a level whose model is not installed, and calls a hand-made mix Personalizada', async () => {
        await open({ config: { ...CONFIG, defaults: { ...CONFIG.defaults, music: { inference_steps: 12 } } } });
        expect(q('[data-testid="quality"]').textContent).toContain('Personalizada');
        q('[data-testid="quality"] .mat-mdc-select-trigger').click();
        await settle();
        const options = Array.from(document.querySelectorAll('mat-option')).map((o) => o.textContent ?? '');
        expect(options.find((o) => o.includes('Máxima'))).toContain('modelo no instalado');
        expect(options.find((o) => o.includes('Rápida'))).not.toContain('modelo no instalado'); // the turbo is installed
      });
    });

    it('keeps a configured model that is not installed visible and flagged', async () => {
      await open({ config: { ...CONFIG, defaults: { ...CONFIG.defaults, music: { synth_model: 'acestep-v15-sft-Q8_0.gguf' } } } });
      const select = q('[data-testid="synth-model"]');
      select.click();
      await settle();
      const options = Array.from(document.querySelectorAll('mat-option')).map((o) => o.textContent ?? '');
      expect(options.some((o) => o.includes('acestep-v15-sft-Q8_0.gguf') && o.includes('no está en disco'))).toBe(true);
      expect(options.some((o) => o.includes('acestep-v15-turbo-Q8_0.gguf') && !o.includes('no está en disco'))).toBe(true);
    });
  });

  describe('creating', () => {
    const launch = async (sel = '[data-testid="create-all"]') => {
      await click(sel);
      return http.expectOne('/api/projects/songs/runs');
    };

    it('runs the whole project and shows compose and synth live, with a way to cancel', async () => {
      await open();
      const req = await launch();
      expect(req.request.body).toMatchObject({ keep_tmp: true });
      expect(req.request.body.only).toBeUndefined();
      req.flush({ run: RUN, queue_position: 0 });
      await settle();

      es.feed([
        { timestamp: 't', type: 'phase_start', scene_id: 'idea', phase: 'compose' },
        { timestamp: 't', type: 'phase_end', scene_id: 'idea', phase: 'compose', duration_ms: 2000 },
        { timestamp: 't', type: 'phase_start', scene_id: 'idea', phase: 'synth' },
      ]);
      await settle();
      expect(qa('app-phase-strip .strip__phase').map((p) => p.textContent?.trim())).toEqual(['compose', 'synth', 'export']);
      expect(q('[data-testid="run-panel"]').textContent).toContain('idea');
      expect(q<HTMLButtonElement>('[data-testid="cancel"]').disabled).toBe(false);
      expect(q<HTMLButtonElement>('[data-testid="create-all"]').disabled).toBe(true);

      await click('[data-testid="cancel"]');
      http.expectOne('/api/runs/run-1/cancel').flush({ run: RUN });
    });

    it('runs one track with --only, and passes the chosen GPU and force', async () => {
      await open();
      q('[data-testid="gpu"] .mat-mdc-select-trigger').click();
      await settle();
      (document.querySelectorAll('mat-option')[1] as HTMLElement).click();
      await settle();
      await click('[data-testid="force"] input');
      const req = await launch('[data-testid="track-1"] [data-testid="create-track"]');
      expect(req.request.body).toEqual({ only: 'idea', force: true, gpu: '1', keep_tmp: true });
      req.flush({ run: RUN, queue_position: 0 });
    });

    it('saves unsaved edits before running', async () => {
      await open();
      await type('[data-testid="track-0"] [data-testid="track-prompt"]', 'Rock ballad');
      await click('[data-testid="create-all"]');
      http.expectOne('/api/projects/songs/config').flush({ saved: true });
      await settle();
      const launch = http.expectOne('/api/projects/songs/runs');
      expect(launch.request.method).toBe('POST');
      launch.flush({ run: RUN, queue_position: 0 });
    });

    it('when the run ends, lists the songs it exported', async () => {
      await open();
      const req = await launch();
      req.flush({ run: RUN, queue_position: 0 });
      await settle();
      es.feed([{ timestamp: 't', type: 'pipeline_start' }]);
      es.end({ id: 'run-1', state: 'succeeded' });
      await settle();
      http.expectOne(manifestUrl).flush(manifest(entry()));
      await settle();
      expect(qa('app-track-results .song').length).toBe(1);
      expect(q('[data-testid="track-0"] audio')).not.toBeNull();
    });

    it('explains a missing engine and links to the Environment page', async () => {
      await open();
      const req = await launch();
      req.flush(
        { error: { code: 'validation_failed', message: 'required binary "ace-synth" not found on PATH (output mode "music")' } },
        { status: 422, statusText: 'Unprocessable' },
      );
      await settle();
      const box = q('[data-testid="launch-error"]');
      expect(box.textContent).toContain('ace-synth');
      expect(box.querySelector('a[href="/environment"]')).not.toBeNull();
      expect(box.querySelector('a[href="/models"]')).toBeNull();
      expect(q<HTMLButtonElement>('[data-testid="create-all"]').disabled).toBe(false);
    });

    it('explains a missing model and links to the Música tab of Models', async () => {
      await open();
      const req = await launch();
      req.flush(
        { error: { code: 'validation_failed', message: 'config: music synthesis model "x.gguf" not found in models/music: install it' } },
        { status: 422, statusText: 'Unprocessable' },
      );
      await settle();
      const box = q('[data-testid="launch-error"]');
      expect(box.textContent).toContain('x.gguf');
      expect(box.querySelector('a[href="/models"]')).not.toBeNull();
    });

    it('warns up front when the engine or the models are not installed', async () => {
      await open({ report: { ...REPORT, binaries: [{ name: 'ace-synth', required: false, present: false, fix: 'bash scripts/build-acestep.sh' }], music: [] } });
      const notice = q('[data-testid="setup-issue"]');
      expect(notice.querySelector('a[href="/environment"]')).not.toBeNull();
      expect(notice.querySelector('a[href="/models"]')).not.toBeNull();
    });

    it('is quiet when everything is installed', async () => {
      await open();
      expect(q('[data-testid="setup-issue"]')).toBeNull();
    });
  });

  describe('results', () => {
    const two = manifest(
      entry({ variant: 0, effective_seed: 7, file: 'out/songs/ballad_v1.mp3' }),
      entry({ variant: 1, effective_seed: 8, file: 'out/songs/ballad_v2.mp3' }),
      entry({ track_id: 'idea', effective_seed: 99, use_lm: true, caption: 'A lo-fi beat', lyrics_requested: undefined, lyrics_sung: '[Instrumental]', instrumental: true, file: 'out/songs/idea.mp3' }),
    );

    it('lists the variants of each track with a player, the seed and the metadata', async () => {
      await open({ results: two });
      const first = qa('[data-testid="track-0"] .song');
      expect(first.length).toBe(2);
      expect(first[0].querySelector('audio')!.getAttribute('src')).toBe('/api/projects/songs/artifacts/out/songs/ballad_v1.mp3');
      expect(first[0].textContent).toContain('v1 · seed 7');
      expect(first[0].textContent).toContain('96 bpm');
      expect(first[0].textContent).toContain('2:05');
      expect(first[0].textContent).toContain('G minor');
      expect(first[1].textContent).toContain('v2 · seed 8');
      expect(qa('[data-testid="track-1"] .song').length).toBe(1);
    });

    describe('waveforms', () => {
      const PEAKS = { duration: 100, buckets: 4, peaks: [0.2, 1, 0.6, 0.3], active: null };
      const peaksOf = (file: string) => http.match((r) => r.urlWithParams.includes('/peaks') && r.urlWithParams.includes('file=' + encodeURIComponent(file)));
      const wave = () => q('[data-testid="track-0"] .song app-song-wave');

      it('draws the waveform of each song once the server answers, with the playhead at the start', async () => {
        await open({ results: manifest(entry({ file: 'out/songs/ballad.mp3', sha256: 'h1' })) });
        const [req] = peaksOf('out/songs/ballad.mp3');
        expect(req.request.urlWithParams).toContain('buckets=600');
        req.flush(PEAKS);
        await settle();
        expect(wave().querySelector('svg path')?.getAttribute('d')).toContain('M');
        expect((wave().querySelector('[data-testid="wave-head"]') as HTMLElement).style.left).toBe('0%');
        expect(wave().getAttribute('aria-label')).toContain('1:40');
      });

      it('keeps the player and shows no waveform when the peaks cannot be read', async () => {
        await open({ results: manifest(entry()) });
        peaksOf('out/songs/ballad.mp3')[0].flush({}, { status: 404, statusText: 'Not Found' });
        await settle();
        expect(q('[data-testid="track-0"] .song audio')).not.toBeNull();
        expect(q('[data-testid="track-0"] .song svg')).toBeNull();
        expect(q('[data-testid="song-missing"]')).toBeNull();
      });

      it('moves the song to the second that was clicked', async () => {
        await open({ results: manifest(entry()) });
        peaksOf('out/songs/ballad.mp3')[0].flush(PEAKS);
        await settle();
        const audio = q<HTMLAudioElement>('[data-testid="track-0"] .song audio');
        Object.defineProperty(audio, 'currentTime', { value: 0, writable: true });
        wave().getBoundingClientRect = () => ({ left: 0, width: 200, top: 0, height: 64, right: 200, bottom: 64, x: 0, y: 0, toJSON: () => ({}) });
        wave().dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, bubbles: true }));
        wave().dispatchEvent(new MouseEvent('pointerup', { clientX: 100, bubbles: true }));
        expect(audio.currentTime).toBe(50);
        await settle();
        expect((wave().querySelector('[data-testid="wave-head"]') as HTMLElement).style.left).toBe('50%'); // without waiting for the player to say so
      });

      it('follows the player: the playhead goes where the song is', async () => {
        await open({ results: manifest(entry()) });
        peaksOf('out/songs/ballad.mp3')[0].flush(PEAKS);
        await settle();
        const audio = q<HTMLAudioElement>('[data-testid="track-0"] .song audio');
        Object.defineProperty(audio, 'currentTime', { value: 25, writable: true });
        audio.dispatchEvent(new Event('seeked'));
        await settle();
        expect((wave().querySelector('[data-testid="wave-head"]') as HTMLElement).style.left).toBe('25%');
      });

      it('draws no waveform for a file that turns out to be missing', async () => {
        await open({ results: manifest(entry()) });
        peaksOf('out/songs/ballad.mp3')[0].flush(PEAKS);
        await settle();
        q<HTMLAudioElement>('[data-testid="track-0"] .song audio').dispatchEvent(new Event('error'));
        await settle();
        expect(q('[data-testid="track-0"] .song app-song-wave')).toBeNull();
      });
    });

    it('says what a song transforms: the task, the instrument taken out and the source', async () => {
      await open({ results: manifest(entry({ task: 'extract', source: 'balada.mp3', params: { track: 'vocals' } }), entry({ variant: 1, file: 'out/songs/b.mp3', task: 'repaint', source: 'balada.mp3' })) });
      const [extract, repaint] = qa('[data-testid="track-0"] [data-testid="song-task"]').map((t) => t.textContent ?? '');
      expect(extract).toContain('Extraer: Voz');
      expect(extract).toContain('balada.mp3');
      expect(repaint).toContain('Repaint');
      expect(repaint).not.toContain(':');
    });

    it('shows what was sung, and marks when the model changed the lyrics', async () => {
      await open({ results: manifest(entry({ lyrics_requested: '[Verse]\nhola', lyrics_sung: '[Verse]\nadiós' })) });
      expect(q('[data-testid="lyrics-sung"]').textContent).toContain('adiós');
      const differ = q('[data-testid="lyrics-differ"]');
      expect(differ.textContent).toContain('cambió tu letra');
      expect(differ.textContent).toContain('hola');
    });

    it('does not mark a difference when the lyrics are the ones that were asked for', async () => {
      await open({ results: manifest(entry()) });
      expect(q('[data-testid="lyrics-differ"]')).toBeNull();
    });

    it('shows a file that can no longer be played as missing, without breaking the others', async () => {
      await open({ results: two });
      const audios = qa('[data-testid="track-0"] audio');
      audios[0].dispatchEvent(new Event('error'));
      await settle();
      const songs = qa('[data-testid="track-0"] .song');
      expect(songs[0].querySelector('[data-testid="song-missing"]')).not.toBeNull();
      expect(songs[0].querySelector('audio')).toBeNull();
      expect(songs[0].querySelector('[data-testid="download"]')).toBeNull();
      expect(songs[1].querySelector('audio')).not.toBeNull();
    });

    describe('comparing and keeping variants', () => {
      const withVariants = { ...CONFIG, tracks: [{ ...CONFIG.tracks![0], variants: 2 }, CONFIG.tracks![1]] };

      it('compares the variants of a track with one player, switching between them', async () => {
        await open({ results: two, config: withVariants });
        const compare = q('[data-testid="track-0"] [data-testid="compare"]');
        expect(compare.querySelector('audio')!.getAttribute('src')).toBe('/api/projects/songs/artifacts/out/songs/ballad_v1.mp3');
        expect(q('[data-testid="track-1"] [data-testid="compare"]')).toBeNull(); // one song: nothing to compare
        const audio = compare.querySelector('audio')!;
        audio.currentTime = 0; // jsdom has no media: the position is what the player reports
        compare.querySelector<HTMLButtonElement>('[data-testid="compare-1"]')!.click();
        await settle();
        await new Promise((r) => setTimeout(r));
        expect(compare.querySelector('audio')!.getAttribute('src')).toBe('/api/projects/songs/artifacts/out/songs/ballad_v2.mp3');
        expect(compare.querySelector('[data-testid="compare-1"]')!.getAttribute('aria-pressed')).toBe('true');
        expect(compare.querySelector('[data-testid="compare-0"]')!.getAttribute('aria-pressed')).toBe('false');
      });

      it('offers to keep a variant only for a track that has several, and asks first', async () => {
        await open({ results: two, config: withVariants });
        expect(qa('[data-testid="track-0"] [data-testid="keep-variant"]')).toHaveLength(2);
        expect(qa('[data-testid="track-1"] [data-testid="keep-variant"]')).toHaveLength(0);
        confirm = false;
        qa('[data-testid="track-0"] [data-testid="keep-variant"]')[1].click();
        await settle();
        expect(dialogOpen).toHaveBeenCalled();
        http.expectNone('/api/projects/songs/config'); // declined: nothing saved
      });

      it('keeps the variant: saves the seed and one variant, then creates the track', async () => {
        await open({ results: two, config: withVariants });
        qa('[data-testid="track-0"] [data-testid="keep-variant"]')[1].click();
        await settle();
        const save = http.expectOne('/api/projects/songs/config');
        const doc = load(save.request.body.yaml) as { tracks: Record<string, unknown>[] };
        expect(doc.tracks[0]['seed']).toBe(8);
        expect('variants' in doc.tracks[0]).toBe(false);
        save.flush({ saved: true });
        await settle();
        const run = http.expectOne('/api/projects/songs/runs');
        expect(run.request.body.only).toBe('ballad');
        run.flush({ run: RUN, queue_position: 0 });
      });

      it('does not offer to keep when the track has a single variant', async () => {
        await open({ results: two });
        expect(qa('[data-testid="keep-variant"]')).toHaveLength(0);
      });
    });

    describe('deleting a song', () => {
      it('asks first and does nothing when declined', async () => {
        await open({ results: two });
        confirm = false;
        qa('[data-testid="track-0"] [data-testid="delete-song"]')[1].click();
        await settle();
        expect(dialogOpen).toHaveBeenCalled();
        http.expectNone('/api/projects/songs/songs/ballad/1');
      });

      it('deletes the variant on the server and reloads the manifest', async () => {
        await open({ results: two });
        qa('[data-testid="track-0"] [data-testid="delete-song"]')[1].click();
        await settle();
        http.expectOne('/api/projects/songs/songs/ballad/1').flush(null, { status: 204, statusText: 'No Content' });
        await settle();
        http.expectOne(manifestUrl).flush(manifest(entry({ variant: 0, effective_seed: 7, file: 'out/songs/ballad_v1.mp3' })));
        await settle();
        expect(qa('[data-testid="track-0"] .song')).toHaveLength(1);
      });
    });

    describe('favorites', () => {
      it('stars a song, saves the mark and marks the track in the list', async () => {
        await open({ results: two });
        expect(q('[data-testid="track-favorite"]')).toBeNull();
        qa('[data-testid="track-0"] [data-testid="favorite"]')[1].click();
        await settle();
        expect(qa('[data-testid="track-0"] [data-testid="favorite"]')[1].getAttribute('aria-pressed')).toBe('true');
        expect(qa('[data-testid="track-0"] [data-testid="favorite"]')[0].getAttribute('aria-pressed')).toBe('false');
        expect(q('[data-testid="track-0"] [data-testid="track-favorite"]')).not.toBeNull();
        await click('[data-testid="save"]');
        const req = http.expectOne('/api/projects/songs/config');
        const doc = load(req.request.body.yaml) as { favorites: unknown[] };
        expect(doc.favorites).toEqual([{ track: 'ballad', seed: 8 }]);
        req.flush({ saved: true });
      });

      it('lists only the tracks with a favorite when asked', async () => {
        await open({ results: two, config: { ...CONFIG, favorites: [{ track: 'idea', seed: 99 }] } });
        const visible = () => qa('mat-expansion-panel.track').filter((p) => !p.classList.contains('track--hidden')).length;
        expect(visible()).toBe(2);
        await click('[data-testid="only-favorites"]');
        expect(visible()).toBe(1);
        expect(q('[data-testid="track-1"]').classList.contains('track--hidden')).toBe(false);
        await click('[data-testid="only-favorites"]');
        expect(visible()).toBe(2);
      });

      it('has no filter until a song is marked', async () => {
        await open({ results: two });
        expect(q('[data-testid="favbar"]')).toBeNull();
      });
    });

    describe('repainting a part', () => {
      const repaintCalls = () => (dialogOpen.mock.calls as unknown as unknown[][]).filter((c) => c[0] === RepaintDialogComponent);

      it('opens the dialog with the song, and opens the card of the track it added', async () => {
        await open({ results: manifest(entry({ audio_seconds: 30 }), entry({ track_id: 'idea', file: 'out/songs/idea.mp3', audio_seconds: 20 })) });
        // the dialog answers with the index of the track it added
        dialogOpen.mockImplementationOnce(() => ({ afterClosed: () => of(1) }));
        q('[data-testid="track-0"] .song [data-testid="repaint"]').click();
        await settle();
        expect(repaintCalls()).toHaveLength(1);
        expect((repaintCalls()[0][1] as { data: { entry: MusicManifestEntry } }).data.entry.file).toBe('out/songs/ballad.mp3');
        expect(isOpen(1)).toBe(true);
      });

      it('does nothing when the dialog is closed without a part', async () => {
        await open({ results: manifest(entry({ audio_seconds: 30 })) });
        dialogOpen.mockImplementationOnce(() => ({ afterClosed: () => of(undefined) }));
        q('[data-testid="track-0"] .song [data-testid="repaint"]').click();
        await settle();
        expect(isOpen(0)).toBe(false);
      });

      it('is not offered for a song with no length or a file that is missing', async () => {
        await open({ results: manifest(entry({ audio_seconds: undefined, duration_seconds: undefined })) });
        expect(q('[data-testid="repaint"]')).toBeNull();
      });
    });

    describe('taking back what the last action added', () => {
      const songs = manifest(entry({ audio_seconds: 30 }), entry({ track_id: 'idea', file: 'out/songs/idea.mp3', audio_seconds: 20 }));
      const store = () => fixture.debugElement.injector.get(MusicStore);

      it('offers it on the first added track once every one has its song, and asks before removing', async () => {
        await open({ results: songs });
        store().lastAdded.set({ ids: ['ballad', 'idea'], source: null });
        await settle();
        const offer = q('[data-testid="track-0"] [data-testid="added"]');
        expect(offer.textContent).toContain('2');
        expect(q('[data-testid="track-1"] [data-testid="added"]')).toBeNull(); // only on the first of them
        confirm = false;
        q('[data-testid="track-0"] [data-testid="remove-added"]').click();
        await settle();
        expect(dialogOpen).toHaveBeenCalled();
        expect(titles()).toEqual(['ballad', 'idea']); // declined: nothing removed
        expect(store().lastAdded()).not.toBeNull();
      });

      it('is not offered while a track of the action has no song yet, or when there is nothing to take back', async () => {
        await open({ results: manifest(entry({ audio_seconds: 30 })) });
        expect(q('[data-testid="added"]')).toBeNull();
        store().lastAdded.set({ ids: ['ballad', 'idea'], source: null });
        await settle();
        expect(q('[data-testid="added"]')).toBeNull(); // idea has no song
      });
    });

    it('says which track of the queue is being made', async () => {
      await open({ results: manifest(entry({ audio_seconds: 30 })) });
      const store = fixture.debugElement.injector.get(MusicStore);
      store.stream.set({ events: signal([]), lines: signal([]), state: signal(null), ended: signal(false), close: vi.fn() });
      store.queue.set({ done: 1, total: 3 });
      await settle();
      expect(q('[data-testid="queue"]').textContent).toContain('Pista 2 de 3');
      store.queue.set({ done: 0, total: 1 });
      await settle();
      expect(q('[data-testid="queue"]')).toBeNull(); // a single track needs no count
    });

    describe('separating into instruments', () => {
      it('opens the dialog with the song and shows the first track it added', async () => {
        await open({ results: manifest(entry({ audio_seconds: 30 }), entry({ track_id: 'idea', file: 'out/songs/idea.mp3', audio_seconds: 20 })) });
        dialogOpen.mockImplementationOnce(() => ({ afterClosed: () => of(1) }));
        q('[data-testid="track-0"] .song [data-testid="separate"]').click();
        await settle();
        const calls = (dialogOpen.mock.calls as unknown as unknown[][]).filter((c) => c[0] === SeparateDialogComponent);
        expect(calls).toHaveLength(1);
        expect(isOpen(1)).toBe(true);
      });

      it('is not offered for a song that is missing', async () => {
        await open({ results: manifest(entry()) });
        q<HTMLAudioElement>('[data-testid="track-0"] .song audio').dispatchEvent(new Event('error'));
        await settle();
        expect(q('[data-testid="separate"]')).toBeNull();
        expect(q('[data-testid="repaint"]')).toBeNull();
      });
    });

    describe('lengthening a song', () => {
      it('sets the seconds up, adds the track and opens its card', async () => {
        await open({ results: manifest(entry({ audio_seconds: 30 }), entry({ track_id: 'idea', file: 'out/songs/idea.mp3', audio_seconds: 20 })) });
        const song = () => q('[data-testid="track-0"] .song');
        expect(song().querySelector('[data-testid="extend-panel"]')).toBeNull();
        song().querySelector<HTMLButtonElement>('[data-testid="extend"]')!.click();
        await settle();
        const seconds = song().querySelector<HTMLInputElement>('[data-testid="extend-seconds"]')!;
        expect(seconds.value).toBe('30');
        seconds.value = '2';
        seconds.dispatchEvent(new Event('input'));
        await settle();
        expect(song().querySelector('[data-testid="extend-range"]')).not.toBeNull();
        expect(song().querySelector<HTMLButtonElement>('[data-testid="extend-create"]')!.disabled).toBe(true);
        seconds.value = '45';
        seconds.dispatchEvent(new Event('input'));
        await settle();
        song().querySelector<HTMLButtonElement>('[data-testid="extend-create"]')!.click();
        const copy = http.expectOne((r) => r.method === 'POST' && r.url === '/api/projects/songs/sources');
        expect(copy.request.body).toMatchObject({ from: 'out/songs/ballad.mp3' });
        copy.flush({ name: 'ballad.mp3' });
        await settle();
        http.match('/api/projects/songs/sources').forEach((r) => r.flush({ sources: [] }));
        await settle();
        expect(titles()).toEqual(['ballad', 'idea', 'ballad_larga']);
        expect(isOpen(2)).toBe(true);
        expect(isOpen(0)).toBe(false);
        expect(song().querySelector('[data-testid="extend-panel"]')).toBeNull();
        await click('[data-testid="save"]');
        const req = http.expectOne('/api/projects/songs/config');
        const doc = load(req.request.body.yaml) as { tracks: Record<string, unknown>[] };
        expect(doc.tracks[2]).toMatchObject({ id: 'ballad_larga', task: 'repaint', source: 'ballad.mp3', repaint_start: 26, repaint_end: 75 });
        req.flush({ saved: true });
      });
    });

    it('pins the seed of a variant into its track and saves it', async () => {
      await open({ results: two });
      const second = qa('[data-testid="track-0"] .song')[1];
      second.querySelector<HTMLButtonElement>('[data-testid="pin-seed"]')!.click();
      await settle();
      const req = http.expectOne('/api/projects/songs/config');
      const doc = load(req.request.body.yaml) as { tracks: Record<string, unknown>[] };
      expect(doc.tracks[0]['seed']).toBe(8);
      req.flush({ saved: true });
      await settle();
      expect(el().textContent).toContain('ballad ← seed 8');
    });

    it('regenerates a track with --only', async () => {
      await open({ results: two });
      qa('[data-testid="track-1"] [data-testid="regenerate"]')[0].click();
      await settle();
      const req = http.expectOne('/api/projects/songs/runs');
      expect(req.request.body.only).toBe('idea');
      req.flush({ run: RUN, queue_position: 0 });
    });

    it('offers the file to download', async () => {
      await open({ results: two });
      const link = q<HTMLAnchorElement>('[data-testid="track-1"] [data-testid="download"]');
      expect(link.getAttribute('href')).toBe('/api/projects/songs/artifacts/out/songs/idea.mp3');
      expect(link.hasAttribute('download')).toBe(true);
    });

    it('after regenerating one track shows the manifest as the server merged it: the others stay', async () => {
      await open({ results: two });
      qa('[data-testid="track-1"] [data-testid="regenerate"]')[0].click();
      await settle();
      http.expectOne('/api/projects/songs/runs').flush({ run: RUN, queue_position: 0 });
      await settle();
      es.feed([{ timestamp: 't', type: 'pipeline_start' }]);
      es.end({ id: 'run-1', state: 'succeeded' });
      await settle();
      // the server's manifest keeps the other track's entries next to the regenerated one
      http.expectOne(manifestUrl).flush(manifest(
        entry({ variant: 0, effective_seed: 7, file: 'out/songs/ballad_v1.mp3' }),
        entry({ variant: 1, effective_seed: 8, file: 'out/songs/ballad_v2.mp3' }),
        entry({ track_id: 'idea', effective_seed: 123, file: 'out/songs/idea.mp3' }),
      ));
      await settle();
      expect(qa('[data-testid="track-0"] .song').length).toBe(2);
      expect(q('[data-testid="track-1"] .song').textContent).toContain('seed 123');
    });

    it('shows the loudness of a song and what its checks found wrong with it', async () => {
      await open({ results: manifest(
        entry({ check: { lufs: -14.2, peak_db: -3 } }),
        entry({ variant: 1, file: 'out/songs/ballad_v2.mp3', check: { lufs: -5.1, peak_db: -0.1, issues: [
          { code: 'clipping', detail: 'peak -0.1 dBFS' }, { code: 'silence', detail: 'silence of 8 s at 1:05' },
        ] } }),
      ) });
      const songs = qa('[data-testid="track-0"] .song');
      expect(songs[0].textContent).toContain('-14.2 LUFS');
      expect(songs[0].querySelector('[data-testid="song-issue"]')).toBeNull();
      const issues = Array.from(songs[1].querySelectorAll('[data-testid="song-issue"]')).map((n) => n.textContent ?? '');
      expect(issues.length).toBe(2);
      expect(issues[0]).toContain('Suena saturada');
      expect(issues[0]).toContain('peak -0.1 dBFS');
      expect(issues[1]).toContain('silencio largo');
    });

    it('stays quiet when nothing has been exported yet', async () => {
      await open();
      expect(qa('app-track-results .song').length).toBe(0);
    });
  });

  describe('the song assistant', () => {
    const assistUrl = '/api/assist';
    const openAssist = async (track = 0) => {
      q<HTMLButtonElement>(`[data-testid="track-${track}"] [data-testid="assist-toggle"]`).click();
      await settle();
    };
    const describe_ = async (track: number, text: string) => {
      const ta = q<HTMLTextAreaElement>(`[data-testid="track-${track}"] [data-testid="assist-description"]`);
      ta.value = text;
      ta.dispatchEvent(new Event('input'));
      await settle();
    };
    const ask = async (track = 0) => {
      q<HTMLButtonElement>(`[data-testid="track-${track}"] [data-testid="assist-ask"]`).click();
      await settle();
    };
    const PROPOSAL = { text: 'raw', caption: 'Slow pop ballad with piano', lyrics: '[Verse]\nCamino bajo la lluvia' };

    it('offers the action on every track, closed until asked for', async () => {
      await open();
      expect(qa('[data-testid="assist-toggle"]').length).toBe(2);
      expect(qa('[data-testid="assist-description"]').length).toBe(0);
      await openAssist(0);
      expect(qa('[data-testid="track-0"] [data-testid="assist-description"]').length).toBe(1);
    });

    it('cannot ask with an empty description', async () => {
      await open();
      await openAssist(0);
      expect(q<HTMLButtonElement>('[data-testid="track-0"] [data-testid="assist-ask"]').disabled).toBe(true);
      await describe_(0, 'una balada');
      expect(q<HTMLButtonElement>('[data-testid="track-0"] [data-testid="assist-ask"]').disabled).toBe(false);
    });

    it('a refusal by the model shows its message and the selector, and leaves the track untouched', async () => {
      await open();
      await openAssist(0);
      await describe_(0, 'una canción');
      await ask(0);
      const msg = 'qwen3:8b refused to write this text. The refusal comes from the model: choose another installed model';
      http.expectOne(assistUrl).flush({ error: { code: 'assist_refused', message: msg } }, { status: 422, statusText: 'Unprocessable Entity' });
      await settle();
      expect(q('[data-testid="track-0"] [data-testid="assist-error"]').textContent).toContain('«qwen3:8b» se ha negado a escribirlo. ¿Estás pensando en porno?');
      expect(q('[data-testid="track-0"] [data-testid="assist-model-select"]')).not.toBeNull();
      expect(q('[data-testid="assist-proposal"]')).toBeNull();
      expect(q<HTMLTextAreaElement>('[data-testid="track-0"] [data-testid="track-prompt"]').value).toBe('Spanish pop ballad');
    });

    it('describe, receive a proposal and apply it: the prompt and the lyrics change and the track is marked as changed', async () => {
      await open();
      await openAssist(0);
      await describe_(0, 'Una balada triste sobre volver a casa');
      await ask(0);
      const req = http.expectOne(assistUrl);
      expect(req.request.body).toEqual({ task: 'music', text: 'Una balada triste sobre volver a casa' });
      expect(q('[data-testid="track-0"] [data-testid="assist-wait"]')).not.toBeNull();
      req.flush(PROPOSAL);
      await settle();
      expect(q('[data-testid="assist-proposal-style"]').textContent).toContain('Slow pop ballad with piano');
      expect(q('[data-testid="assist-proposal-lyrics"]').textContent).toContain('Camino bajo la lluvia');
      // nothing applied by itself
      expect(q<HTMLTextAreaElement>('[data-testid="track-0"] [data-testid="track-prompt"]').value).toBe('Spanish pop ballad');
      expect(q<HTMLButtonElement>('[data-testid="save"]').disabled).toBe(true);
      q<HTMLButtonElement>('[data-testid="assist-apply"]').click();
      await settle();
      expect(q<HTMLTextAreaElement>('[data-testid="track-0"] [data-testid="track-prompt"]').value).toBe('Slow pop ballad with piano');
      expect(q<HTMLTextAreaElement>('[data-testid="track-0"] [data-testid="track-lyrics"]').value).toBe('[Verse]\nCamino bajo la lluvia');
      expect(q<HTMLButtonElement>('[data-testid="save"]').disabled).toBe(false);
      expect(q('[data-testid="assist-proposal"]')).toBeNull();
    });

    it('with HeartMuLa the request names the generator and applying the proposal fills the tags too', async () => {
      await open();
      const store = fixture.debugElement.injector.get(MusicStore);
      store.updateSettings({ generator: 'heartmula' });
      await settle();
      await openAssist(0);
      await describe_(0, 'una canción de boda');
      await ask(0);
      const req = http.expectOne(assistUrl);
      expect(req.request.body).toEqual({ task: 'music', text: 'una canción de boda', generator: 'heartmula' });
      req.flush({ ...PROPOSAL, lyrics: '[intro]\n[verse]\nCamino bajo la lluvia', tags: 'piano,acoustic,wedding' });
      await settle();
      expect(q('[data-testid="assist-proposal-tags"]').textContent).toContain('piano,acoustic,wedding');
      q<HTMLButtonElement>('[data-testid="assist-apply"]').click();
      await settle();
      expect(q<HTMLInputElement>('[data-testid="track-0"] [data-testid="track-tags"]').value).toBe('piano,acoustic,wedding');
      expect(q<HTMLTextAreaElement>('[data-testid="track-0"] [data-testid="track-lyrics"]').value).toBe('[intro]\n[verse]\nCamino bajo la lluvia');
    });

    it('with HeartMuLa a proposal without tags says that they are missing and keeps the track\'s own', async () => {
      await open();
      const store = fixture.debugElement.injector.get(MusicStore);
      store.updateSettings({ generator: 'heartmula' });
      await settle();
      await openAssist(0);
      await describe_(0, 'una balada');
      await ask(0);
      http.expectOne(assistUrl).flush(PROPOSAL);
      await settle();
      q<HTMLButtonElement>('[data-testid="assist-apply"]').click();
      await settle();
      expect(q<HTMLInputElement>('[data-testid="track-0"] [data-testid="track-tags"]').value).toBe('');
      expect(q('[data-testid="track-0"]').textContent).toContain('La propuesta no trajo etiquetas');
    });

    it('discarding leaves the track as it was', async () => {
      await open();
      await openAssist(0);
      await describe_(0, 'una balada');
      await ask(0);
      http.expectOne(assistUrl).flush(PROPOSAL);
      await settle();
      q<HTMLButtonElement>('[data-testid="assist-discard"]').click();
      await settle();
      expect(q('[data-testid="assist-proposal"]')).toBeNull();
      expect(q<HTMLTextAreaElement>('[data-testid="track-0"] [data-testid="track-prompt"]').value).toBe('Spanish pop ballad');
      expect(q<HTMLButtonElement>('[data-testid="save"]').disabled).toBe(true);
    });

    it('an instrumental track asks for the style only and keeps its lyrics when the proposal is applied', async () => {
      const cfg = structuredClone(CONFIG);
      cfg.tracks![0] = { ...cfg.tracks![0], instrumental: true };
      await open({ config: cfg });
      await openAssist(0);
      await describe_(0, 'una balada');
      await ask(0);
      const req = http.expectOne(assistUrl);
      expect(req.request.body).toEqual({ task: 'music', text: 'una balada', instrumental: true });
      req.flush({ text: 'raw', caption: 'Soft piano instrumental', lyrics: '' });
      await settle();
      expect(qa('[data-testid="assist-proposal-lyrics"]').length).toBe(0);
      q<HTMLButtonElement>('[data-testid="assist-apply"]').click();
      await settle();
      expect(q<HTMLTextAreaElement>('[data-testid="track-0"] [data-testid="track-prompt"]').value).toBe('Soft piano instrumental');
      expect(q<HTMLTextAreaElement>('[data-testid="track-0"] [data-testid="track-lyrics"]').value).toBe('[Verse]\nhola'); // untouched
    });

    it('a proposal without lyrics leaves the track\'s own lyrics alone', async () => {
      await open();
      await openAssist(0);
      await describe_(0, 'una balada');
      await ask(0);
      http.expectOne(assistUrl).flush({ text: 'raw', caption: 'Folk guitar', lyrics: '' });
      await settle();
      q<HTMLButtonElement>('[data-testid="assist-apply"]').click();
      await settle();
      expect(q<HTMLTextAreaElement>('[data-testid="track-0"] [data-testid="track-lyrics"]').value).toBe('[Verse]\nhola');
    });

    it('the proposal belongs to the track it was asked from', async () => {
      await open();
      await openAssist(0);
      await describe_(0, 'una balada');
      await ask(0);
      http.expectOne(assistUrl).flush(PROPOSAL);
      await settle();
      expect(qa('[data-testid="track-0"] [data-testid="assist-proposal"]').length).toBe(1);
      expect(qa('[data-testid="track-1"] [data-testid="assist-proposal"]').length).toBe(0);
    });

    it('explains an unavailable assistant next to the track and changes nothing', async () => {
      await open();
      await openAssist(0);
      await describe_(0, 'una balada');
      await ask(0);
      http.expectOne(assistUrl).flush(
        { error: { code: 'unavailable', message: 'model "qwen3:8b" is not installed: ollama pull qwen3:8b' } },
        { status: 503, statusText: 'Service Unavailable' },
      );
      await settle();
      expect(q('[data-testid="track-0"] [data-testid="assist-error"]').textContent).toContain('ollama pull qwen3:8b');
      expect(q<HTMLTextAreaElement>('[data-testid="track-0"] [data-testid="track-prompt"]').value).toBe('Spanish pop ballad');
      expect(q<HTMLButtonElement>('[data-testid="save"]').disabled).toBe(true);
    });

    it('says a run is in progress when the server refuses while one is active', async () => {
      await open();
      await openAssist(0);
      await describe_(0, 'una balada');
      await ask(0);
      http.expectOne(assistUrl).flush({ error: { code: 'conflict', message: 'run x is queued or active' } }, { status: 409, statusText: 'Conflict' });
      await settle();
      expect(q('[data-testid="assist-error"]').textContent).toContain('ejecución en marcha');
    });

    it('can be cancelled while waiting, with no proposal and no error', async () => {
      await open();
      await openAssist(0);
      await describe_(0, 'una balada');
      await ask(0);
      const req = http.expectOne(assistUrl);
      q<HTMLButtonElement>('[data-testid="assist-cancel"]').click();
      await settle();
      expect(req.cancelled).toBe(true);
      expect(q('[data-testid="assist-wait"]')).toBeNull();
      expect(q('[data-testid="assist-proposal"]')).toBeNull();
      expect(q('[data-testid="assist-error"]')).toBeNull();
    });

    it('allows one request at a time: the other track cannot ask while one is in flight', async () => {
      await open();
      await openAssist(0);
      await openAssist(1);
      await describe_(0, 'una balada');
      await describe_(1, 'lo-fi');
      await ask(0);
      expect(q<HTMLButtonElement>('[data-testid="track-1"] [data-testid="assist-ask"]').disabled).toBe(true);
      http.expectOne(assistUrl).flush(PROPOSAL);
    });
  });

  describe('HeartMuLa generator', () => {
        it('does not show the generator option when the engine is not available', async () => {
      await open();
      expect(q('[data-testid="generator"]')).toBeNull();
      expect(q('[data-testid="heartmula-install"]')).toBeNull();
      expect(q('[data-testid="track-0"] [data-testid="track-tags"]')).toBeNull();
    });

    it('says how to install it only when something local is missing', async () => {
      engines.heartmulaInstallable.set(true);
      await open();
      expect(q('[data-testid="generator"]')).toBeNull();
      expect(q('[data-testid="heartmula-install"]')).not.toBeNull();
    });

    it('offers the generator when the engine is available and writes it into defaults.music', async () => {
      engines.heartmulaAvailable.set(true);
      await open();
      expect(q('[data-testid="generator"]')).not.toBeNull();
      q('[data-testid="generator"] .mat-mdc-select-trigger').click();
      await settle();
      (Array.from(document.querySelectorAll('mat-option')).find((o) => o.textContent?.includes('HeartMuLa')) as HTMLElement).click();
      await settle();
      // the ACE-Step only controls are gone and the tags take the place of the style for the engine
      expect(q('[data-testid="lm-model"]')).toBeNull();
      expect(q('[data-testid="quality"]')).toBeNull();
      expect(q('[data-testid="track-0"] [data-testid="track-tags"]')).not.toBeNull();
      expect(q('[data-testid="track-0"] [data-testid="track-bpm"]')).toBeNull();
      expect(q('[data-testid="track-0"] [data-testid="track-key"]')).toBeNull();
      await click('[data-testid="save"]');
      const req = http.expectOne('/api/projects/songs/config');
      const doc = load(req.request.body.yaml) as { defaults: { music: Record<string, unknown> } };
      expect(doc.defaults.music['generator']).toBe('heartmula');
      req.flush({ saved: true });
    });

    it('keeps showing the option of a project that uses it when the engine is gone, and says so', async () => {
      engines.heartmulaAvailable.set(false);
      await open();
      const store = fixture.debugElement.injector.get(MusicStore);
      store.updateSettings({ generator: 'heartmula' });
      await settle();
      expect(q('[data-testid="generator"]')).not.toBeNull();
      expect(q('[data-testid="generator-unavailable"]')).not.toBeNull();
    });
  });

  describe('A generator whose container is stopped', () => {
    it('stays offered, says to start it from Environment and cannot create songs', async () => {
      engines.heartmulaAvailable.set(true);
      engines.heartmulaStopped.set(true);
      await open();
      const store = fixture.debugElement.injector.get(MusicStore);
      store.updateSettings({ generator: 'heartmula' });
      await settle();
      expect(q('[data-testid="generator"]')).not.toBeNull();
      expect(q('[data-testid="container-stopped"]')?.textContent).toContain('arráncalo desde Entorno');
      expect(q('[data-testid="container-stopped"] a')?.getAttribute('href')).toBe('/environment');
      expect(q<HTMLButtonElement>('[data-testid="create-all"]').disabled).toBe(true);
      engines.heartmulaStopped.set(false);
      await settle();
      expect(q('[data-testid="container-stopped"]')).toBeNull();
    });
  });

  describe('DiffRhythm2 generator', () => {
    it('does not offer it when the engine is not available', async () => {
      await open();
      expect(q('[data-testid="generator"]')).toBeNull();
      expect(q('[data-testid="diffrhythm2-install"]')).toBeNull();
    });

    it('says how to install it when only something local is missing', async () => {
      engines.diffrhythm2Installable.set(true);
      await open();
      expect(q('[data-testid="generator"]')).toBeNull();
      expect(q('[data-testid="diffrhythm2-install"]')).not.toBeNull();
    });

    it('warns about what it cannot do, hides those controls and writes the generator into defaults.music', async () => {
      engines.diffrhythm2Available.set(true);
      await open();
      expect(q('[data-testid="generator"]')).not.toBeNull();
      expect(q('[data-testid="dr2-notice"]')).toBeNull();
      q('[data-testid="generator"] .mat-mdc-select-trigger').click();
      await settle();
      (Array.from(document.querySelectorAll('mat-option')).find((o) => o.textContent?.includes('DiffRhythm2')) as HTMLElement).click();
      await settle();
      expect(q('[data-testid="dr2-notice"]')).not.toBeNull();
      // ACE-Step's own controls are gone, the tags take the place of the style, and what the engine cannot do is not offered
      expect(q('[data-testid="lm-model"]')).toBeNull();
      expect(q('[data-testid="track-0"] [data-testid="track-tags"]')).not.toBeNull();
      expect(q('[data-testid="track-0"] [data-testid="track-bpm"]')).toBeNull();
      expect(q('[data-testid="track-0"] [data-testid="track-key"]')).toBeNull();
      expect(q('[data-testid="track-0"] [data-testid="track-vocals"]')).toBeNull();
      expect(q('[data-testid="track-0"] [data-testid="track-instrumental"]')).toBeNull();
      await click('[data-testid="save"]');
      const req = http.expectOne('/api/projects/songs/config');
      const doc = load(req.request.body.yaml) as { defaults: { music: Record<string, unknown> } };
      expect(doc.defaults.music['generator']).toBe('diffrhythm2');
      req.flush({ saved: true });
    });

    it('offers English only as the voice language', async () => {
      engines.diffrhythm2Available.set(true);
      await open();
      const store = fixture.debugElement.injector.get(MusicStore);
      store.updateSettings({ generator: 'diffrhythm2' });
      await settle();
      q('[data-testid="track-0"] [data-testid="track-language"] .mat-mdc-select-trigger').click();
      await settle();
      const labels = Array.from(document.querySelectorAll('mat-option')).map((o) => o.textContent?.trim() ?? '');
      expect(labels).not.toContain('Español');
      expect(labels).toContain('English');
      expect(labels).not.toContain('Français');
    });

    it('lists the tracks it cannot make and leaves them as they are', async () => {
      engines.diffrhythm2Available.set(true);
      await open();
      const store = fixture.debugElement.injector.get(MusicStore);
      store.updateSettings({ generator: 'diffrhythm2' });
      await settle();
      // the project has a Spanish track and an instrumental one: neither is changed
      const list = q('[data-testid="dr2-unmakeable"]')!.textContent ?? '';
      expect(list).toContain('ballad');
      expect(list).toContain('idea');
      expect(store.tracks()[0].vocal_language).toBe('es');
      expect(store.tracks()[1].instrumental).toBe(true);
      expect(q('[data-testid="track-0"] [data-testid="track-dr2-cannot"]')).not.toBeNull();
    });

    it('does not offer to lengthen a song', async () => {
      engines.diffrhythm2Available.set(true);
      await open();
      const store = fixture.debugElement.injector.get(MusicStore);
      store.updateSettings({ generator: 'diffrhythm2' });
      await settle();
      expect(q('[data-testid="extend"]')).toBeNull();
    });

    it('offers neither repainting a part nor separating, keeps the waveform and says why in one line', async () => {
      engines.diffrhythm2Available.set(true);
      await open({ results: manifest(entry({ audio_seconds: 30, synth_model: 'diffrhythm2' })) });
      expect(q('[data-testid="transform-engine-note"]')).toBeNull(); // ACE-Step: nothing to say
      expect(q('[data-testid="repaint"]')).not.toBeNull();
      expect(q('[data-testid="separate"]')).not.toBeNull();
      const store = fixture.debugElement.injector.get(MusicStore);
      store.updateSettings({ generator: 'diffrhythm2' });
      await settle();
      expect(q('[data-testid="repaint"]')).toBeNull();
      expect(q('[data-testid="separate"]')).toBeNull();
      expect(qa('[data-testid="transform-engine-note"]')).toHaveLength(1);
      expect(q('[data-testid="transform-engine-note"]')!.textContent).toContain('ACE-Step');
      expect(q('[data-testid="track-0"] .song app-song-wave')).not.toBeNull();
    });

    it('says nothing while there are no songs', async () => {
      engines.diffrhythm2Available.set(true);
      await open();
      fixture.debugElement.injector.get(MusicStore).updateSettings({ generator: 'diffrhythm2' });
      await settle();
      expect(q('[data-testid="transform-engine-note"]')).toBeNull();
    });
  });

  describe('engine', () => {
    const chooseServer = async () => {
      q('[data-testid="engine"] .mat-mdc-select-trigger').click();
      await settle();
      (Array.from(document.querySelectorAll('mat-option')).find((o) => o.textContent?.includes('Servidor')) as HTMLElement).click();
      await settle();
    };

    it('uses the programs by default and shows no server option', async () => {
      await open();
      expect(q('[data-testid="engine"]').textContent).toContain('Programas');
      expect(q('[data-testid="keep-loaded"]')).toBeNull();
    });

    it('writes the server engine into defaults.music and offers to keep the models loaded', async () => {
      await open();
      await chooseServer();
      expect(q('[data-testid="keep-loaded"]')).not.toBeNull();
      await click('[data-testid="save"]');
      const req = http.expectOne('/api/projects/songs/config');
      const doc = load(req.request.body.yaml) as { defaults: { music: Record<string, unknown> } };
      expect(doc.defaults.music).toEqual({ engine: 'server' });
      req.flush({ saved: true });
    });

    it('unticking keep-loaded writes false; going back to the programs removes both keys', async () => {
      const cfg = structuredClone(CONFIG);
      cfg.defaults.music = { engine: 'server' };
      await open({ config: cfg });
      q('[data-testid="keep-loaded"] input').click();
      await settle();
      await click('[data-testid="save"]');
      let req = http.expectOne('/api/projects/songs/config');
      expect((load(req.request.body.yaml) as { defaults: { music: Record<string, unknown> } }).defaults.music).toEqual({ engine: 'server', keep_loaded: false });
      req.flush({ saved: true });
      await settle();
      q('[data-testid="engine"] .mat-mdc-select-trigger').click();
      await settle();
      (Array.from(document.querySelectorAll('mat-option')).find((o) => o.textContent?.includes('Programas')) as HTMLElement).click();
      await settle();
      await click('[data-testid="save"]');
      req = http.expectOne('/api/projects/songs/config');
      expect(load(req.request.body.yaml) as Record<string, unknown>).not.toHaveProperty('defaults');
      req.flush({ saved: true });
    });

    it('asks for ace-server, not ace-synth, when the project uses the server', async () => {
      const cfg = structuredClone(CONFIG);
      cfg.defaults.music = { engine: 'server' };
      const report: EnvironmentReport = {
        ...REPORT,
        binaries: [
          { name: 'ace-synth', required: false, present: true, path: '/x/ace-synth' },
          { name: 'ace-server', required: false, present: false },
        ],
      };
      await open({ config: cfg, report });
      expect(q('[data-testid="setup-issue"]').textContent).toContain('ace-server');
    });
  });

  describe('adapters (LoRA)', () => {
    const WITH_ADAPTERS: EnvironmentReport = { ...REPORT, music_adapters: [{ name: 'chinese-new-year', size: 88 }, { name: 'style.safetensors', size: 10 }] };

    it('offers no selector when none is installed, only a pointer to the Música tab of Models', async () => {
      await open();
      expect(q('[data-testid="adapter"]')).toBeNull();
      expect(q('[data-testid="track-adapter"]')).toBeNull();
      expect(q('[data-testid="no-adapters"] a[href="/models"]')).not.toBeNull();
    });

    it('lists the installed adapters, files and folders, in the project selector', async () => {
      await open({ report: WITH_ADAPTERS });
      expect(q('[data-testid="no-adapters"]')).toBeNull();
      q('[data-testid="adapter"] .mat-mdc-select-trigger').click();
      await settle();
      const options = Array.from(document.querySelectorAll('mat-option')).map((o) => o.textContent?.trim());
      expect(options).toEqual(expect.arrayContaining(['chinese-new-year', 'style.safetensors']));
    });

    it('writes the default adapter and its strength into defaults.music, keeping a strength of zero', async () => {
      await open({ report: WITH_ADAPTERS });
      q('[data-testid="adapter"] .mat-mdc-select-trigger').click();
      await settle();
      (Array.from(document.querySelectorAll('mat-option')).find((o) => o.textContent?.includes('chinese-new-year')) as HTMLElement).click();
      await settle();
      await type('[data-testid="adapter-scale"]', '0');
      await click('[data-testid="save"]');
      const req = http.expectOne('/api/projects/songs/config');
      const doc = load(req.request.body.yaml) as { defaults: { music: Record<string, unknown> } };
      expect(doc.defaults.music).toEqual({ adapter: 'chinese-new-year', adapter_scale: 0 });
      req.flush({ saved: true });
    });

    it('lets a track choose its own adapter and strength, overriding the project\'s', async () => {
      await open({ report: WITH_ADAPTERS });
      const track = q('[data-testid="track-1"]');
      track.querySelector<HTMLElement>('[data-testid="track-adapter"] .mat-mdc-select-trigger')!.click();
      await settle();
      (Array.from(document.querySelectorAll('mat-option')).find((o) => o.textContent?.includes('style.safetensors')) as HTMLElement).click();
      await settle();
      await type('[data-testid="track-1"] [data-testid="track-adapter-scale"]', '0.7');
      await click('[data-testid="save"]');
      const req = http.expectOne('/api/projects/songs/config');
      const doc = load(req.request.body.yaml) as { tracks: Record<string, unknown>[] };
      expect(doc.tracks[1]['adapter']).toBe('style.safetensors');
      expect(doc.tracks[1]['adapter_scale']).toBe(0.7);
      expect('adapter' in doc.tracks[0]).toBe(false); // the other track inherits
      req.flush({ saved: true });
    });

    it('keeps an adapter the project names but is not installed visible, flagged', async () => {
      const cfg = structuredClone(CONFIG);
      cfg.defaults.music = { adapter: 'gone' };
      await open({ config: cfg, report: WITH_ADAPTERS });
      q('[data-testid="adapter"] .mat-mdc-select-trigger').click();
      await settle();
      const options = Array.from(document.querySelectorAll('mat-option')).map((o) => o.textContent ?? '');
      expect(options.some((o) => o.includes('gone') && o.includes('no está en disco'))).toBe(true);
    });

    it('still shows the selector for a named adapter even when none is installed, so it can be seen and cleared', async () => {
      const cfg = structuredClone(CONFIG);
      cfg.defaults.music = { adapter: 'gone' };
      await open({ config: cfg });
      expect(q('[data-testid="adapter"]')).not.toBeNull();
    });

    it('removes the key when the choice is emptied', async () => {
      const cfg = structuredClone(CONFIG);
      cfg.defaults.music = { adapter: 'chinese-new-year' };
      await open({ config: cfg, report: WITH_ADAPTERS });
      q('[data-testid="adapter"] .mat-mdc-select-trigger').click();
      await settle();
      (Array.from(document.querySelectorAll('mat-option')).find((o) => o.textContent?.includes('ninguno')) as HTMLElement).click();
      await settle();
      await click('[data-testid="save"]');
      const req = http.expectOne('/api/projects/songs/config');
      const doc = load(req.request.body.yaml) as { defaults?: { music?: Record<string, unknown> } };
      expect(doc.defaults?.music?.['adapter']).toBeUndefined();
      req.flush({ saved: true });
    });

    it('blocks saving a negative strength and says why next to the field', async () => {
      await open({ report: WITH_ADAPTERS });
      await type('[data-testid="track-0"] [data-testid="track-adapter-scale"]', '-1');
      expect(q<HTMLButtonElement>('[data-testid="save"]').disabled).toBe(true);
      expect(q('[data-testid="track-0"]').textContent).toContain('no puede ser negativa');
    });

    it('shows the server\'s message when the adapter turns out not to be installed', async () => {
      await open({ report: WITH_ADAPTERS });
      await type('[data-testid="track-0"] [data-testid="track-prompt"]', 'x');
      await click('[data-testid="save"]');
      http.expectOne('/api/projects/songs/config').flush(
        { error: { code: 'validation_failed', message: 'config: music adapter "gone" not found in models/music/adapters: install it from the Models screen (Música tab)' } },
        { status: 422, statusText: 'Unprocessable' },
      );
      await settle();
      expect(q('.server-error').textContent).toContain('adapter "gone" not found');
    });

    describe('collapsible cards', () => {
      it('«Motor y ejecución» is a collapsible card, closed to begin with, that summarizes its settings', async () => {
        await open();
        const header = q('[data-testid="engine-panel"] mat-expansion-panel-header');
        expect(header.getAttribute('aria-expanded')).toBe('false');
        expect(header.textContent).toContain('mp3');
        header.click();
        await settle();
        expect(header.getAttribute('aria-expanded')).toBe('true');
      });

      it('starts with every card closed when there are several tracks, showing the start of the style', async () => {
        await open();
        expect(isOpen(0)).toBe(false);
        expect(isOpen(1)).toBe(false);
        expect(q('[data-testid="track-0"] mat-expansion-panel-header').textContent).toContain('Spanish pop ballad');
      });

      it('a project with one track opens it', async () => {
        await open({ config: { ...CONFIG, tracks: [CONFIG.tracks![0]] } });
        expect(isOpen(0)).toBe(true);
      });

      it('adding a track closes the previous ones and opens the new one', async () => {
        await open();
        q('[data-testid="track-0"] mat-expansion-panel-header').click();
        await settle();
        expect(isOpen(0)).toBe(true);
        await click('[data-testid="add-track"]');
        expect(isOpen(0)).toBe(false);
        expect(isOpen(2)).toBe(true);
      });

      it('moving a track keeps each card open or closed with its track', async () => {
        await open();
        await click('[data-testid="add-track"]'); // pista_3 open
        q('[data-testid="track-2"] button[aria-label="Subir pista"]').click();
        await settle();
        expect(titles()).toEqual(['ballad', 'pista_3', 'idea']);
        expect(isOpen(1)).toBe(true);
        expect(isOpen(2)).toBe(false);
      });

      it('a closed card says that something in it needs fixing', async () => {
        await open({ config: { ...CONFIG, tracks: [{ id: 'a', prompt: '' }, { id: 'b', prompt: 'x' }] } });
        expect(q('[data-testid="track-0"] [data-testid="track-invalid"]')).not.toBeNull();
        expect(q('[data-testid="track-1"]').querySelector('[data-testid="track-invalid"]')).toBeNull();
      });
    });

    describe('the mixer in a modal', () => {
      const mixDialogCalls = () => (dialogOpen.mock.calls as unknown as unknown[][]).filter((c) => c[0] === MixDialogComponent);

      it('lists the mixes as rows and opens one in a dialog, not inline', async () => {
        await open({ config: { ...CONFIG, mixes: [{ id: 'final', clips: [{ track: 'ballad' }] }] } });
        expect(q('[data-testid="mixes"] mat-expansion-panel-header').getAttribute('aria-expanded')).toBe('true'); // it has mixes
        expect(q('[data-testid="mixrow-0"]').textContent).toContain('final');
        expect(q('[data-testid="mixrow-0"]').textContent).toContain('1 pista');
        expect(el().querySelector('app-mix-editor')).toBeNull();
        q('[data-testid="open-mix-0"]').click();
        expect(mixDialogCalls()).toHaveLength(1);
        expect(mixDialogCalls()[0][1]).toMatchObject({ data: { index: 0 }, panelClass: 'mo-resizable-dialog' });
      });

      describe('managing a mix from its row', () => {
        const MIXED = { ...CONFIG, mixes: [{ id: 'final', clips: [{ track: 'ballad', start: 2 }] }] };
        const ids = () => qa('[data-testid^="mixrow-"] .mixrow__name').map((n) => (n.textContent ?? '').trim());
        const save = async () => {
          await click('[data-testid="save"]');
          const req = http.expectOne('/api/projects/songs/config');
          const doc = load(req.request.body.yaml) as { mixes?: { id: string; clips: object[] }[] };
          req.flush({ saved: true });
          await settle();
          return doc;
        };

        it('removes a mix after confirming, without opening the mixer', async () => {
          await open({ config: MIXED });
          await click('[data-testid="remove-mix-0"]');
          expect(dialogOpen).toHaveBeenCalled();
          expect(ids()).toEqual([]);
          expect(mixDialogCalls()).toHaveLength(0);
          expect((await save()).mixes).toBeUndefined();
        });

        it('keeps the mix when the confirmation is declined', async () => {
          confirm = false;
          await open({ config: MIXED });
          await click('[data-testid="remove-mix-0"]');
          expect(ids()).toEqual(['final']);
        });

        it('duplicates a mix right after it, with its own clips and a free name', async () => {
          await open({ config: MIXED });
          await click('[data-testid="duplicate-mix-0"]');
          await click('[data-testid="duplicate-mix-0"]');
          expect(ids()).toEqual(['final', 'final_copia2', 'final_copia']);
          const doc = await save();
          expect(doc.mixes![1].clips).toEqual([{ track: 'ballad', start: 2 }]);
        });

        it('renames a mix in its row, and says when the name is not valid', async () => {
          await open({ config: MIXED });
          await click('[data-testid="rename-mix-0"]');
          const input = q<HTMLInputElement>('[data-testid="rename-mix-input-0"]');
          input.value = 'cancion final';
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
          await settle();
          expect(ids()).toEqual(['cancion final']);
          expect(q('[data-testid="mixrow-0"] [role="alert"]').textContent).toContain('El id solo admite');
          await click('[data-testid="rename-mix-0"]');
          const again = q<HTMLInputElement>('[data-testid="rename-mix-input-0"]');
          again.value = 'cancion';
          again.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
          await settle();
          expect(ids()).toEqual(['cancion']);
          expect(q('[data-testid="mixrow-0"] [role="alert"]')).toBeNull();
        });

        it('flags a mix whose song was regenerated, and mixes it again from the row', async () => {
          await open({
            config: MIXED,
            results: {
              project: 'songs', mode: 'music', generated_at: '',
              tracks: [{ track_id: 'ballad', variant: 0, effective_seed: 1, use_lm: false, caption: 'c', synth_model: 'm', params: {}, file: 'out/songs/ballad_v1.mp3', sha256: 'new' }],
              mixes: [{ id: 'final', file: 'out/songs/final.mp3', audio_seconds: 42, hash: 'h', clips: [], inputs: [{ file: 'out/songs/ballad_v1.mp3', sha256: 'old' }] }],
            },
          });
          expect(q('[data-testid="mix-outdated-0"]').textContent).toContain('Desactualizada');
          await click('[data-testid="remix-mix-0"]');
          const run = http.expectOne((r) => r.url === '/api/projects/songs/runs');
          expect(run.request.body).toMatchObject({ only: 'final' });
          run.flush({ run: { id: 'r1', project: 'songs', state: 'running' }, queue_position: 0 });
        });

        it('shows nothing about being outdated when the songs are the ones it used', async () => {
          await open({
            config: MIXED,
            results: {
              project: 'songs', mode: 'music', generated_at: '',
              tracks: [{ track_id: 'ballad', variant: 0, effective_seed: 1, use_lm: false, caption: 'c', synth_model: 'm', params: {}, file: 'out/songs/ballad_v1.mp3', sha256: 'same' }],
              mixes: [{ id: 'final', file: 'out/songs/final.mp3', audio_seconds: 42, hash: 'h', clips: [], inputs: [{ file: 'out/songs/ballad_v1.mp3', sha256: 'same' }] }],
            },
          });
          expect(q('[data-testid="mix-outdated-0"]')).toBeNull();
        });

        it('offers no listening while the mix has not been rendered', async () => {
          await open({ config: MIXED });
          expect(q('[data-testid="listen-mix-0"]')).toBeNull();
        });

        it('listens to the rendered mix from the row', async () => {
          await open({
            config: MIXED,
            results: { project: 'songs', mode: 'music', generated_at: '', tracks: [], mixes: [{ id: 'final', file: 'out/songs/final.mp3', audio_seconds: 42, hash: 'h', clips: [] }] },
          });
          expect(q('[data-testid="mix-player-0"]')).toBeNull();
          await click('[data-testid="listen-mix-0"]');
          expect(q('[data-testid="mix-player-0"] audio').getAttribute('src')).toBe('/api/projects/songs/artifacts/out/songs/final.mp3');
          await click('[data-testid="listen-mix-0"]');
          expect(q('[data-testid="mix-player-0"]')).toBeNull();
        });
      });

      it('adding a mix opens it straight away', async () => {
        await open();
        q('[data-testid="mixes"] mat-expansion-panel-header').click();
        await settle();
        await click('[data-testid="add-mix"]');
        expect(mixDialogCalls()).toHaveLength(1);
        expect(mixDialogCalls()[0][1]).toMatchObject({ data: { index: 0 } });
        expect(q('[data-testid="mixrow-0"]').textContent).toContain('mezcla_1');
      });
    });
  });
});

