import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { CatalogEntry, MusicManifestEntry, VideoclipPlan } from '../../core/api.models';
import { EnvironmentStore } from '../../core/environment.store';
import { ModelsStore } from '../../core/models.store';
import { VideoclipDialogComponent } from './videoclip-dialog.component';
import { AvailabilityStore } from '../../core/availability.store';
import { ALL_AVAILABLE, missing } from '../../core/availability.fake';
import { provideRouter } from '@angular/router';

const ENTRY = { track_id: 'noche', variant: 0, title: 'Noche', audio_seconds: 12, file: 'out/songs/noche.mp3' } as MusicManifestEntry;

const PLAN: VideoclipPlan = {
  title: 'Noche',
  caption: 'warm pop',
  audio_file: 'out/songs/noche.mp3',
  audio_seconds: 12,
  transition_seconds: 0.8,
  subject_prompt: 'a woman',
  used_ai: false,
  warnings: ['the assistant could not write the pictures'],
  shots: [
    { id: '01_verse', section: 'Verse', start: 0, seconds: 6, duration: 6.8, motion: 'zoom_in', intensity: 0.35, prompt: 'p1' },
    { id: '02_chorus', section: 'Chorus', start: 6, seconds: 6, duration: 6, motion: 'pan_left', intensity: 0.55, prompt: 'p2' },
  ],
};

type Cmp = { prepare(): Promise<void>; create(generate: boolean): Promise<void> };

describe('VideoclipDialogComponent', () => {
  const close = vi.fn();
  let http: HttpTestingController;
  let fixture: ComponentFixture<VideoclipDialogComponent>;
  let cmp: Cmp;

  beforeEach(async () => {
    close.mockClear();
    await TestBed.configureTestingModule({
      imports: [VideoclipDialogComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MatDialogRef, useValue: { close } },
        { provide: MAT_DIALOG_DATA, useValue: { projectId: 'songs', entry: ENTRY } },
        {
          provide: EnvironmentStore,
          useValue: { gpus: signal([{ index: 0, name: 'NVIDIA GeForce RTX 5060 Ti', free_vram_mb: 15000, total_vram_mb: 16311 }]), ram: signal(null), voices: signal([{ name: 'v.onnx', size: 1 }]), ensureLoaded: vi.fn() },
        },
        { provide: ModelsStore, useValue: { catalog: signal<CatalogEntry[]>([]), refresh: vi.fn(() => Promise.resolve()) } },
      ],
    }).compileComponents();
    TestBed.inject(AvailabilityStore).data.set(ALL_AVAILABLE);
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(VideoclipDialogComponent);
    fixture.detectChanges();
    cmp = fixture.componentInstance as unknown as Cmp;
  });

  afterEach(() => http.verify());

  async function prepare(): Promise<void> {
    const done = cmp.prepare();
    await Promise.resolve();
    const req = http.expectOne('/api/projects/songs/videoclip/plan');
    expect(req.request.body).toEqual({ track_id: 'noche', variant: 0, shot_seconds: 6, ai: true });
    req.flush(PLAN);
    await done;
    fixture.detectChanges();
  }

  it('asks the server for the plan of the song with the options and shows its shots and warnings', async () => {
    await prepare();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid=videoclip-summary]')?.textContent).toContain('2');
    expect(el.querySelectorAll('[data-testid=videoclip-shots] li').length).toBe(2);
    expect(el.textContent).toContain('the assistant could not write the pictures');
    expect(el.querySelector('[data-testid=videoclip-song]')?.textContent).toContain('Noche');
  });

  const WAN: CatalogEntry = {
    id: 'wan5q8', kind: 'video', name: 'Wan 5B', description: '', size_bytes: 1, installed: true, quality: 'medium', vram_mb: 8192,
    timing: { seconds: 85, resolution: '832x480', steps: 20, frames: 33, measured: true },
    files: [{ name: 'w.gguf', role: 'model', url: '' }, { name: 't5.gguf', role: 'text_encoder', url: '' }, { name: 'v.vae', role: 'vae', url: '' }],
  };
  const INTO: CatalogEntry = {
    id: 'into', kind: 'model', name: 'Into', description: '', size_bytes: 1, installed: true, styles: ['photo'], style_rank: 1, vram_mb: 8000,
    preset: { steps: 8, cfg_scale: 1, resolution: '1024x576' }, timing: { seconds: 19, resolution: '1024x576', steps: 8, measured: true },
    files: [{ name: 'into.safetensors', role: 'model', url: '' }],
  };

  it('can animate only the shots of the chorus: those scenes animate, the others stay still, and it costs in between', async () => {
    (TestBed.inject(ModelsStore).catalog as WritableSignal<CatalogEntry[]>).set([INTO, WAN]);
    await prepare();
    const cmpAny = fixture.componentInstance as unknown as { animateMode: WritableSignal<string>; autoPlan(): { config: { scenes: { id: string; animate?: boolean }[] }; seconds: number } };
    const still = cmpAny.autoPlan().seconds;
    cmpAny.animateMode.set('chorus');
    const chorus = cmpAny.autoPlan();
    expect(chorus.config.scenes.map((s) => [s.id, !!s.animate])).toEqual([['01_verse', false], ['02_chorus', true]]);
    cmpAny.animateMode.set('all');
    const all = cmpAny.autoPlan();
    expect(all.config.scenes.every((s) => s.animate)).toBe(true);
    expect(chorus.seconds).toBeGreaterThan(still);
    expect(all.seconds).toBeGreaterThan(chorus.seconds);
  });

  it('without an assistant there is no "write with the AI" checkbox, the plan is asked with ai false and a missing model is explained', async () => {
    TestBed.inject(AvailabilityStore).data.set(missing('assistant', 'no_models'));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid=videoclip-ai]')).toBeNull();
    expect(el.querySelector('[data-testid=model-notice]')).not.toBeNull();
    const done = cmp.prepare();
    await Promise.resolve();
    const req = http.expectOne('/api/projects/songs/videoclip/plan');
    expect(req.request.body).toEqual({ track_id: 'noche', variant: 0, shot_seconds: 6, ai: false });
    req.flush(PLAN);
    await done;
  });

  it('with an unreachable assistant the checkbox is hidden too, and no notice appears', async () => {
    TestBed.inject(AvailabilityStore).data.set(missing('assistant', 'unreachable'));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid=videoclip-ai]')).toBeNull();
    expect(el.querySelector('[data-testid=model-notice]')).toBeNull();
  });

  it('offers the chorus option only when the song has one', async () => {
    const noChorus: VideoclipPlan = { ...PLAN, shots: PLAN.shots.map((s) => ({ ...s, section: 'Verse' })) };
    const done = cmp.prepare();
    await Promise.resolve();
    http.expectOne('/api/projects/songs/videoclip/plan').flush(noChorus);
    await done;
    expect((fixture.componentInstance as unknown as { hasChorus(): boolean }).hasChorus()).toBe(false);
  });

  it('says how many cuts were moved to the changes of the song, and nothing when none was', async () => {
    const done = cmp.prepare();
    await Promise.resolve();
    http.expectOne('/api/projects/songs/videoclip/plan').flush({ ...PLAN, sections: 7, aligned_cuts: 5 });
    await done;
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid=videoclip-aligned]')?.textContent).toContain('5 de 6');
    const again = cmp.prepare();
    await Promise.resolve();
    http.expectOne('/api/projects/songs/videoclip/plan').flush(PLAN);
    await again;
    fixture.detectChanges();
    expect(el.querySelector('[data-testid=videoclip-aligned]')).toBeNull();
  });

  it('creates the project with the song as its soundtrack and closes with its id', async () => {
    await prepare();
    const done = cmp.create(false);
    await Promise.resolve();
    const req = http.expectOne('/api/projects/songs/videoclip');
    expect(req.request.body).toMatchObject({ track_id: 'noche', variant: 0, id: 'songs-noche-clip' });
    expect(req.request.body.yaml).toContain('bgm:');
    expect(req.request.body.yaml).toContain('file: song.mp3');
    expect(req.request.body.yaml).toContain('silence_seconds: 6.8');
    req.flush({ id: 'songs-noche-clip' });
    await done;
    expect(close).toHaveBeenCalledWith({ id: 'songs-noche-clip', run: null });
  });

  it('can also launch the run right away', async () => {
    await prepare();
    const done = cmp.create(true);
    await Promise.resolve();
    http.expectOne('/api/projects/songs/videoclip').flush({ id: 'songs-noche-clip' });
    await Promise.resolve();
    await Promise.resolve();
    http.expectOne('/api/projects/songs-noche-clip/runs').flush({ run: { id: 'run-1' }, queue_position: 0 });
    await done;
    expect(close).toHaveBeenCalledWith({ id: 'songs-noche-clip', run: 'run-1' });
  });

  it('shows the server refusal and keeps the dialog open', async () => {
    const done = cmp.prepare();
    await Promise.resolve();
    http.expectOne('/api/projects/songs/videoclip/plan').flush({ error: { message: 'the song is no longer in the project' } }, { status: 422, statusText: 'Unprocessable' });
    await done;
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid=videoclip-error]')?.textContent).toContain('no longer in the project');
    expect(close).not.toHaveBeenCalled();
  });
});
