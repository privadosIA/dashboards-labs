import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

import { ProjectConfig } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { EnvironmentStore } from '../../core/environment.store';
import { RunStreamService } from '../../core/run-stream.service';
import { MusicStore } from '../music.store';
import { TrackTaskComponent } from './track-task.component';

const CONFIG: ProjectConfig = {
  project: 'songs',
  output: { mode: 'music', file: '', contact_sheet: false },
  defaults: {
    model: '', voice: '', resolution: '', sampler: '', steps: 0, fps: 0,
    subject_prompt: '', negative_prompt: '', lora_model_dir: '',
  },
  scenes: [],
  tracks: [{ id: 'a', prompt: 'jazz' }],
};

describe('TrackTaskComponent', () => {
  let fixture: ComponentFixture<TrackTaskComponent>;
  let store: MusicStore;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  const el = () => fixture.nativeElement as HTMLElement;
  const q = (sel: string) => el().querySelector(sel);
  type Internals = { setTask(t: string): void; useUrlSource(n: string): Promise<void>; upload(i: unknown): Promise<void>; pickExport(f: string): void };

  beforeEach(async () => {
    api = {
      getConfig: vi.fn(() => of({ yaml: '', parsed: structuredClone(CONFIG), valid: true })),
      getMusicManifest: vi.fn(() =>
        of({
          project: 'songs', mode: 'music', generated_at: '',
          tracks: [{ track_id: 'a', variant: 0, effective_seed: 1, use_lm: false, caption: 'c', synth_model: 'm', params: {}, file: 'out/songs/a.mp3' }],
        }),
      ),
      listSources: vi.fn(() => of({ sources: [{ name: 'base.mp3', size: 1, modified: '' }] })),
      uploadSource: vi.fn((_p: string, name: string) => of({ name })),
      addSourceFromUrl: vi.fn((_p: string) => of({ name: 'cancion-de-youtube.mp3' })),
      copySource: vi.fn((_p: string, _f: string, name?: string) => of({ name: name ?? 'a.mp3' })),
      getPeaks: vi.fn(() => of({ duration: 100, buckets: 4, peaks: [0.2, 1, 0.6, 0.3], active: null, beat_offset: 0 })),
      artifactUrl: vi.fn((p: string, rel: string) => `/api/projects/${p}/artifacts/${rel}`),
    };
    TestBed.configureTestingModule({
      imports: [TrackTaskComponent],
      providers: [
        MusicStore,
        { provide: ApiService, useValue: api },
        { provide: RunStreamService, useValue: { connect: vi.fn() } },
        { provide: EnvironmentStore, useValue: { report: signal(null) } },
      ],
    });
    store = TestBed.inject(MusicStore);
    await store.load('songs');
    fixture = TestBed.createComponent(TrackTaskComponent);
    fixture.componentRef.setInput('index', 0);
    fixture.detectChanges();
  });

  it('a new song shows the task selector and an optional reference, and none of the task fields', () => {
    expect(q('[data-testid=task-select]')).toBeTruthy();
    expect(q('[data-testid=source-select]')).toBeTruthy();
    expect(q('[data-testid=source-upload]')).toBeTruthy();
    expect(q('[data-testid=cover-strength]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Referencia');
  });

  it('a reference is written to the reference key, not to the source', async () => {
    const c = fixture.componentInstance as unknown as { setSource(n: string): void };
    c.setSource('base.mp3');
    expect(store.tracks()[0].reference).toBe('base.mp3');
    expect(store.tracks()[0].source).toBeUndefined();
    c.setSource('');
    expect(store.tracks()[0].reference).toBeUndefined();
  });

  it('choosing a task drops the reference and a task uses the source key', () => {
    store.updateTrack(0, { reference: 'base.mp3' });
    const c = fixture.componentInstance as unknown as Internals & { setSource(n: string): void };
    c.setTask('cover');
    expect(store.tracks()[0].reference).toBeUndefined();
    c.setSource('base.mp3');
    expect(store.tracks()[0].source).toBe('base.mp3');
  });

  it('uploading a video stores its audio under an mp3 name and selects it as the reference', async () => {
    const input = { files: [new File(['v'], 'live set.MP4')], value: 'x' };
    await (fixture.componentInstance as unknown as Internals).upload(input);
    expect(api['uploadSource']).toHaveBeenCalledWith('songs', 'live-set.mp3', input.files[0]);
    expect(store.tracks()[0].reference).toBe('live-set.mp3');
  });

  it('offers a YouTube address next to the upload, and the added audio becomes the reference', async () => {
    expect(q('[data-testid=source-url]')).toBeTruthy();
    api['listSources'].mockClear();
    await (fixture.componentInstance as unknown as Internals).useUrlSource('cancion-de-youtube.mp3');
    expect(api['listSources']).toHaveBeenCalled(); // the list is refreshed first
    expect(store.config()!.tracks![0].reference).toBe('cancion-de-youtube.mp3');
  });

  it('a cover takes the added audio as its source', async () => {
    (fixture.componentInstance as unknown as Internals).setTask('cover');
    fixture.detectChanges();
    expect(q('[data-testid=source-url]')).toBeTruthy();
    await (fixture.componentInstance as unknown as Internals).useUrlSource('cancion-de-youtube.mp3');
    expect(store.config()!.tracks![0].source).toBe('cancion-de-youtube.mp3');
  });

  it('a cover shows the source and the strength, and no region or stem', () => {
    (fixture.componentInstance as unknown as Internals).setTask('cover');
    fixture.detectChanges();
    expect(q('[data-testid=source-select]')).toBeTruthy();
    expect(q('[data-testid=source-upload]')).toBeTruthy();
    expect(q('[data-testid=cover-strength]')).toBeTruthy();
    expect(q('[data-testid=repaint-start]')).toBeNull();
    expect(q('[data-testid=extract-stem]')).toBeNull();
  });

  it('a repaint shows the region and an extract shows the stem', () => {
    const c = fixture.componentInstance as unknown as Internals;
    c.setTask('repaint');
    fixture.detectChanges();
    expect(q('[data-testid=repaint-start]')).toBeTruthy();
    expect(q('[data-testid=repaint-end]')).toBeTruthy();
    c.setTask('extract');
    fixture.detectChanges();
    expect(q('[data-testid=extract-stem]')).toBeTruthy();
    expect(q('[data-testid=repaint-start]')).toBeNull();
  });

  it('plays the chosen source', () => {
    (fixture.componentInstance as unknown as Internals).setTask('cover');
    store.updateTrack(0, { source: 'base.mp3' });
    fixture.detectChanges();
    expect(q('mo-audio-player')).toBeTruthy();
    expect(api['artifactUrl']).toHaveBeenCalledWith('songs', 'sources/base.mp3');
  });

  it('offers the exported songs and copies the chosen one as the source', async () => {
    (fixture.componentInstance as unknown as Internals).setTask('cover');
    fixture.detectChanges();
    expect(q('[data-testid=source-export]')).toBeTruthy();
    (fixture.componentInstance as unknown as Internals).pickExport('out/songs/a.mp3');
    await fixture.whenStable();
    expect(api['copySource']).toHaveBeenCalledWith('songs', 'out/songs/a.mp3', 'a.mp3');
    expect(store.tracks()[0].source).toBe('a.mp3');
  });

  it('uploads a file and selects it', async () => {
    (fixture.componentInstance as unknown as Internals).setTask('cover');
    const input = { files: [new File(['x'], 'new song.mp3')], value: 'x' };
    await (fixture.componentInstance as unknown as Internals).upload(input);
    expect(api['uploadSource']).toHaveBeenCalledWith('songs', 'new-song.mp3', input.files[0]);
    expect(store.tracks()[0].source).toBe('new-song.mp3');
  });

  it('shows why an upload failed and selects nothing', async () => {
    api['uploadSource'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { error: { code: 'invalid', message: 'the file is empty' } } })));
    const c = fixture.componentInstance as unknown as Internals;
    c.setTask('cover');
    await c.upload({ files: [new File([''], 'a.mp3')], value: '' });
    fixture.detectChanges();
    expect(q('[data-testid=source-error]')?.textContent).toContain('the file is empty');
    expect(store.tracks()[0].source).toBeUndefined();
  });

  it('says so when the chosen source is no longer there', () => {
    (fixture.componentInstance as unknown as Internals).setTask('cover');
    store.updateTrack(0, { source: 'gone.mp3' });
    fixture.detectChanges();
    expect(q('mo-audio-player')).toBeNull();
    expect((fixture.componentInstance as unknown as { sourceMissing(): boolean }).sourceMissing()).toBe(true);
  });

  it('offers to separate the chosen source into instruments, once there is one', () => {
    (fixture.componentInstance as unknown as Internals).setTask('extract');
    fixture.detectChanges();
    expect(q('[data-testid=source-separate]')).toBeNull();
    store.updateTrack(0, { source: 'base.mp3' });
    fixture.detectChanges();
    expect(q('[data-testid=source-separate]')).toBeTruthy();
    store.updateTrack(0, { source: 'gone.mp3' });
    fixture.detectChanges();
    expect(q('[data-testid=source-separate]')).toBeNull();
  });

  describe('the range of a repaint on the waveform', () => {
    const wave = () => q('app-range-picker app-song-wave') as HTMLElement;
    const pointer = (type: string, x: number, init: MouseEventInit = {}) => wave().dispatchEvent(new MouseEvent(type, { clientX: x, bubbles: true, ...init }));
    const number = (id: string) => (q(`[data-testid=${id}]`) as HTMLInputElement).value;

    async function repaint(extra: Partial<{ repaint_start: number; repaint_end: number; bpm: number }> = {}) {
      (fixture.componentInstance as unknown as Internals).setTask('repaint');
      store.updateTrack(0, { source: 'base.mp3', ...extra });
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r)); // the peaks and the beat answer
      fixture.detectChanges();
      wave().getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 64, right: 100, bottom: 64, x: 0, y: 0, toJSON: () => ({}) });
    }

    it('shows the source as a waveform with its player instead of the bare player', async () => {
      await repaint();
      expect(api['getPeaks']).toHaveBeenCalledWith('songs', 'sources/base.mp3', 1200);
      expect(wave().querySelector('svg path')).toBeTruthy();
      expect(q('app-range-picker mo-audio-player')).toBeTruthy();
      expect(q('[data-testid=wave-range]')).toBeNull(); // nothing picked yet
    });

    it('fills the numbers when a range is dragged, and keeps the fields', async () => {
      await repaint();
      pointer('pointerdown', 40);
      pointer('pointermove', 65);
      pointer('pointerup', 65);
      fixture.detectChanges();
      expect(store.tracks()[0].repaint_start).toBe(40);
      expect(store.tracks()[0].repaint_end).toBe(65);
      expect(number('repaint-start')).toBe('40');
      expect(number('repaint-end')).toBe('65');
      expect((q('[data-testid=wave-range]') as HTMLElement).style.left).toBe('40%');
    });

    it('moves the range when a number is typed', async () => {
      await repaint({ repaint_start: 10, repaint_end: 20 });
      const start = q('[data-testid=repaint-start]') as HTMLInputElement;
      start.value = '50';
      start.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect((q('[data-testid=wave-range]') as HTMLElement).style.left).toBe('50%');
    });

    it('draws a start that is missing from the beginning and an end that is missing up to the end', async () => {
      await repaint({ repaint_end: 30 });
      const r = q('[data-testid=wave-range]') as HTMLElement;
      expect(r.style.left).toBe('0%');
      expect(r.style.width).toBe('30%');
    });

    it('keeps an end past the song as typed and draws it up to the end', async () => {
      await repaint({ repaint_start: 80, repaint_end: 130 });
      expect(store.tracks()[0].repaint_end).toBe(130);
      expect((q('[data-testid=wave-range]') as HTMLElement).style.width).toBe('20%');
      expect(q('[data-testid=wave-range]')?.classList).toContain('wave__range--over');
    });

    it('plays the range alone: from its start, stopping at its end', async () => {
      await repaint({ repaint_start: 40, repaint_end: 65 });
      const audio = q('app-range-picker audio') as HTMLAudioElement;
      Object.defineProperty(audio, 'currentTime', { value: 0, writable: true });
      const play = vi.spyOn(audio, 'play').mockResolvedValue();
      const pause = vi.spyOn(audio, 'pause').mockImplementation(() => undefined);
      (q('[data-testid=hear-range]') as HTMLButtonElement).click();
      expect(audio.currentTime).toBe(40);
      expect(play).toHaveBeenCalled();
      audio.currentTime = 60;
      audio.dispatchEvent(new Event('seeked'));
      expect(pause).not.toHaveBeenCalled();
      audio.currentTime = 64.95;
      audio.dispatchEvent(new Event('seeked'));
      expect(pause).toHaveBeenCalledTimes(1);
    });

    it('cannot play a range that was not picked', async () => {
      await repaint();
      expect((q('[data-testid=hear-range]') as HTMLButtonElement).disabled).toBe(true);
    });

    it('snaps to the beat when the track has a tempo, and not when the box is cleared', async () => {
      await repaint({ bpm: 30 }); // a beat every two seconds
      expect(api['getPeaks']).toHaveBeenCalledWith('songs', 'sources/base.mp3', undefined, 30);
      pointer('pointerdown', 40.5);
      pointer('pointermove', 65);
      pointer('pointerup', 65);
      expect([store.tracks()[0].repaint_start, store.tracks()[0].repaint_end]).toEqual([40, 66]);
      (q('[data-testid=snap-beat] input') as HTMLInputElement).click();
      fixture.detectChanges();
      pointer('pointerdown', 40.5);
      pointer('pointermove', 65);
      pointer('pointerup', 65);
      expect([store.tracks()[0].repaint_start, store.tracks()[0].repaint_end]).toEqual([40.5, 65]);
    });

    it('offers no snap without a tempo', async () => {
      await repaint();
      expect(q('[data-testid=snap-beat]')).toBeNull();
    });

    it('keeps the player and the numbers when the peaks cannot be read', async () => {
      api['getPeaks'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
      await repaint({ repaint_start: 10, repaint_end: 20 });
      expect(wave().querySelector('svg')).toBeNull();
      expect(q('app-range-picker mo-audio-player')).toBeTruthy();
      expect(number('repaint-start')).toBe('10');
    });
  });
});
