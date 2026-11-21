import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { MusicManifestEntry, ProjectConfig } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { EnvironmentStore } from '../../core/environment.store';
import { RunStreamService } from '../../core/run-stream.service';
import { MusicStore } from '../music.store';
import { SeparateDialogComponent } from './separate-dialog.component';

const CONFIG: ProjectConfig = {
  project: 'songs',
  output: { mode: 'music', file: '', contact_sheet: false },
  defaults: { model: '', voice: '', resolution: '', sampler: '', steps: 0, fps: 0, subject_prompt: '', negative_prompt: '', lora_model_dir: '' },
  scenes: [],
  tracks: [{ id: 'ballad', prompt: 'Spanish pop ballad' }],
};
const ENTRY = { track_id: 'ballad', variant: 0, effective_seed: 7, use_lm: false, caption: 'c', synth_model: 'm', params: {}, file: 'out/songs/ballad.mp3' } as MusicManifestEntry;
const SFT = [{ name: 'acestep-v15-sft-Q8_0.gguf', size: 1 }];
const TURBO = [{ name: 'acestep-v15-turbo-Q8_0.gguf', size: 1 }];

describe('SeparateDialogComponent', () => {
  let fixture: ComponentFixture<SeparateDialogComponent>;
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
  const tick = async (stem: string) => {
    q(`[data-testid=stem-${stem}] input`).click();
    await settle();
  };

  async function open(music: { name: string; size: number }[], from: unknown = ENTRY) {
    api = {
      getConfig: vi.fn(() => of({ yaml: '', parsed: structuredClone(CONFIG), valid: true })),
      getMusicManifest: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404 }))),
      listSources: vi.fn(() => of({ sources: [] })),
      copySource: vi.fn((_p: string, _f: string, name?: string) => of({ name: name ?? 'ballad.mp3' })),
      saveConfig: vi.fn(() => of({ saved: true })),
      launchRun: vi.fn(() => of({ run: { id: 'run-1', project: 'songs', state: 'running' }, queue_position: 0 })),
    };
    close = vi.fn();
    TestBed.configureTestingModule({
      imports: [SeparateDialogComponent],
      providers: [
        provideRouter([]),
        MusicStore,
        { provide: ApiService, useValue: api },
        { provide: RunStreamService, useValue: { connect: vi.fn(() => ({ events: signal([]), lines: signal([]), state: signal(null), ended: signal(false), close: vi.fn() })) } },
        { provide: EnvironmentStore, useValue: { report: signal({ music }) } },
        { provide: MAT_DIALOG_DATA, useValue: { from } },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    store = TestBed.inject(MusicStore);
    await store.load('songs');
    fixture = TestBed.createComponent(SeparateDialogComponent);
    fixture.detectChanges();
    await settle();
  }

  const stems = () => el().querySelectorAll('[data-testid^=stem-]');
  const create = () => q<HTMLButtonElement>('[data-testid=separate-create]');
  const launched = () => api['launchRun'].mock.calls.map((c) => (c[1] as { only?: string }).only);

  it('lists the twelve stems with none ticked, and says the extraction is not made with the turbo model', async () => {
    await open(SFT);
    expect(stems()).toHaveLength(12);
    expect(q('[data-testid=separate-model]').textContent).toContain('SFT');
    expect(create().disabled).toBe(true);
    expect(el().querySelectorAll('input:checked')).toHaveLength(1); // only the switch to the Maximum level
  });

  it('says how many tracks it creates', async () => {
    await open(SFT);
    await tick('vocals');
    expect(create().textContent).toContain('Crear 1 pista');
    await tick('drums');
    expect(create().textContent).toContain('Crear 2 pistas');
  });

  it('says how long it takes only when there are more than three', async () => {
    await open(SFT);
    for (const s of ['vocals', 'drums', 'bass']) await tick(s);
    expect(q('[data-testid=separate-many]')).toBeNull();
    await tick('guitar');
    expect(q('[data-testid=separate-many]').textContent).toContain('4 generaciones');
    expect(create().textContent).toContain('Crear 4 pistas');
  });

  it('adds the tracks, switches the project to the Maximum level, creates the first one and closes with its index', async () => {
    await open(SFT);
    await tick('vocals');
    await tick('drums');
    expect(q('[data-testid=separate-switch-note]').textContent).toContain('demás canciones');
    create().click();
    await settle();
    expect(store.tracks().slice(1).map((t) => [t.id, t.task, t.stem, t.source])).toEqual([
      ['ballad_vocals', 'extract', 'vocals', 'ballad.mp3'],
      ['ballad_drums', 'extract', 'drums', 'ballad.mp3'],
    ]);
    expect(store.settings()).toMatchObject({ synth_model: 'acestep-v15-sft-Q8_0.gguf', inference_steps: 50, shift: 1 });
    expect(api['saveConfig']).toHaveBeenCalled();
    expect(launched()).toEqual(['ballad_vocals']); // the rest follow when this run ends
    expect(close).toHaveBeenCalledWith(1);
  });

  it('leaves the project model alone when the switch is unticked, and warns the engine will refuse', async () => {
    await open(SFT);
    q('[data-testid=separate-switch] input').click();
    await settle();
    expect(q('[data-testid=separate-turbo]')).toBeTruthy();
    expect(q('[data-testid=separate-switch-note]')).toBeNull();
    await tick('bass');
    create().click();
    await settle();
    expect(store.settings().synth_model).toBeUndefined();
    expect(store.tracks()[1].id).toBe('ballad_bass');
  });

  it('offers no switch when the project already has a model that can separate', async () => {
    await open(SFT);
    store.updateSettings({ synth_model: 'acestep-v15-sft-Q8_0.gguf' });
    fixture.detectChanges();
    expect(q('[data-testid=separate-switch]')).toBeNull();
    expect(q('[data-testid=separate-turbo]')).toBeNull();
  });

  it('takes a stem back when it is unticked', async () => {
    await open(SFT);
    await tick('bass');
    await tick('bass');
    expect(create().disabled).toBe(true);
  });

  it('says so, links the catalog and offers no confirmation when only the turbo model is installed', async () => {
    await open(TURBO);
    expect(q('[data-testid=separate-missing]')).toBeTruthy();
    expect(q('[data-testid=separate-models]').getAttribute('href')).toBe('/models');
    expect(q('[data-testid=separate-create]')).toBeNull();
    expect(el().querySelectorAll('mat-checkbox')).toHaveLength(0);
  });

  it('separates a source of the project without copying anything', async () => {
    await open(SFT, { name: 'base.mp3', size: 1, modified: '' });
    expect(q('[data-testid=separate-song]').textContent).toContain('base.mp3');
    await tick('guitar');
    create().click();
    await settle();
    expect(api['copySource']).not.toHaveBeenCalled();
    expect(store.tracks()[1]).toMatchObject({ id: 'base_guitar', source: 'base.mp3', stem: 'guitar' });
    expect(launched()).toEqual(['base_guitar']);
  });

  it('stays open and shows why when the song cannot be copied', async () => {
    await open(SFT);
    api['copySource'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404, error: { error: { code: 'not_found', message: 'gone' } } })));
    await tick('vocals');
    q<HTMLButtonElement>('[data-testid=separate-create]').click();
    await settle();
    expect(close).not.toHaveBeenCalled();
    expect(q('[data-testid=separate-error]').textContent).toContain('gone');
  });
});
