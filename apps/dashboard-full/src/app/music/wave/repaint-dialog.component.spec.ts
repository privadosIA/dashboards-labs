import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { MusicManifestEntry, ProjectConfig } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { EnvironmentStore } from '../../core/environment.store';
import { RunStreamService } from '../../core/run-stream.service';
import { MusicStore } from '../music.store';
import { RepaintDialogComponent } from './repaint-dialog.component';

const CONFIG: ProjectConfig = {
  project: 'songs',
  output: { mode: 'music', file: '', contact_sheet: false },
  defaults: { model: '', voice: '', resolution: '', sampler: '', steps: 0, fps: 0, subject_prompt: '', negative_prompt: '', lora_model_dir: '' },
  scenes: [],
  tracks: [{ id: 'ballad', prompt: 'Spanish pop ballad' }],
};

const ENTRY: MusicManifestEntry = {
  track_id: 'ballad', variant: 0, effective_seed: 7, use_lm: false, caption: 'c', lyrics_sung: '[Chorus]\nhola',
  audio_seconds: 100, synth_model: 'acestep-v15-sft.gguf', params: {}, file: 'out/songs/ballad.mp3', sha256: 'h1',
};

describe('RepaintDialogComponent', () => {
  let fixture: ComponentFixture<RepaintDialogComponent>;
  let store: MusicStore;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let close: ReturnType<typeof vi.fn>;
  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => el().querySelector(sel) as T;
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
  };

  async function open(entry: MusicManifestEntry = ENTRY) {
    api = {
      getConfig: vi.fn(() => of({ yaml: '', parsed: structuredClone(CONFIG), valid: true })),
      getMusicManifest: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404 }))),
      listSources: vi.fn(() => of({ sources: [] })),
      copySource: vi.fn((_p: string, _f: string, name?: string) => of({ name: name ?? 'ballad.mp3' })),
      saveConfig: vi.fn(() => of({ saved: true })),
      launchRun: vi.fn(() => of({ run: { id: 'run-1', project: 'songs', state: 'running' }, queue_position: 0 })),
      getPeaks: vi.fn(() => of({ duration: 100, buckets: 4, peaks: [0.2, 1, 0.6, 0.3], active: null })),
      artifactUrl: vi.fn((p: string, rel: string) => `/api/projects/${p}/artifacts/${rel}`),
    };
    close = vi.fn();
    TestBed.configureTestingModule({
      imports: [RepaintDialogComponent],
      providers: [
        MusicStore,
        { provide: ApiService, useValue: api },
        { provide: RunStreamService, useValue: { connect: vi.fn(() => ({ events: signal([]), lines: signal([]), state: signal(null), ended: signal(false), close: vi.fn() })) } },
        { provide: EnvironmentStore, useValue: { report: signal(null) } },
        { provide: MAT_DIALOG_DATA, useValue: { entry } },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    store = TestBed.inject(MusicStore);
    await store.load('songs');
    fixture = TestBed.createComponent(RepaintDialogComponent);
    fixture.detectChanges();
    await settle();
  }

  const drag = (from: number, to: number) => {
    const wave = q('app-song-wave');
    wave.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 64, right: 100, bottom: 64, x: 0, y: 0, toJSON: () => ({}) });
    for (const [type, x] of [['pointerdown', from], ['pointermove', to], ['pointerup', to]] as const) {
      wave.dispatchEvent(new MouseEvent(type, { clientX: x, bubbles: true }));
    }
  };

  it('shows the song as a waveform from its file, and cannot add anything before a part is picked', async () => {
    await open();
    expect(api['getPeaks']).toHaveBeenCalledWith('songs', 'out/songs/ballad.mp3', 1200);
    expect(q('[data-testid=repaint-song]').textContent).toContain('ballad.mp3');
    expect(q('app-song-wave svg path')).toBeTruthy();
    expect(q<HTMLButtonElement>('[data-testid=repaint-create]').disabled).toBe(true);
    expect(q('[data-testid=repaint-other-engine]')).toBeNull();
  });

  it('adds the track with the picked part, creates it alone and closes with its index', async () => {
    await open();
    drag(40, 65);
    fixture.detectChanges();
    expect(q('[data-testid=repaint-range]').textContent).toContain('40 – 65 s');
    q<HTMLButtonElement>('[data-testid=repaint-create]').click();
    await settle();
    expect(api['copySource']).toHaveBeenCalledWith('songs', 'out/songs/ballad.mp3', 'ballad.mp3');
    expect(store.tracks()[1]).toMatchObject({ id: 'ballad_repintado', task: 'repaint', source: 'ballad.mp3', repaint_start: 40, repaint_end: 65 });
    expect(api['saveConfig']).toHaveBeenCalled();
    expect(api['launchRun'].mock.calls.map((c) => (c[1] as { only?: string }).only)).toEqual(['ballad_repintado']);
    expect(close).toHaveBeenCalledWith(1);
  });

  it('says the variant of the song in the name of the track', async () => {
    await open({ ...ENTRY, variant: 2 });
    store.updateTrack(0, { variants: 4 });
    drag(10, 20);
    fixture.detectChanges();
    q<HTMLButtonElement>('[data-testid=repaint-create]').click();
    await settle();
    expect(store.tracks()[1].id).toBe('ballad_v3_repintado');
  });

  it('stays open and says why when the song cannot be copied', async () => {
    await open();
    api['copySource'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404, error: { error: { code: 'not_found', message: 'gone' } } })));
    drag(10, 20);
    fixture.detectChanges();
    q<HTMLButtonElement>('[data-testid=repaint-create]').click();
    await settle();
    expect(close).not.toHaveBeenCalled();
    expect(q('[data-testid=repaint-error]').textContent).toContain('gone');
    expect(store.tracks()).toHaveLength(1);
  });

  it('says the repainted part will sound like ACE-Step when another engine made the song', async () => {
    await open({ ...ENTRY, synth_model: 'heartmula' });
    expect(q('[data-testid=repaint-other-engine]')).toBeTruthy();
  });
});
