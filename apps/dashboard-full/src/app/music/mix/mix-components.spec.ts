import { CdkDragEnd } from '@angular/cdk/drag-drop';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { MixClip, PeaksResponse, ProjectConfig } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { EnvironmentStore } from '../../core/environment.store';
import { RunStreamService } from '../../core/run-stream.service';
import { MusicStore } from '../music.store';
import { ClipPanelComponent } from './clip-panel.component';
import { MixClipComponent } from './mix-clip.component';
import { MixDialogComponent } from './mix-dialog.component';
import { MixEditorComponent } from './mix-editor.component';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MixTimelineComponent } from './mix-timeline.component';

const PEAKS: PeaksResponse = { duration: 30, buckets: 6, peaks: [0, 0.5, 1, 1, 0.5, 0], active: { start: 1.7, end: 24.6 } };

/** What the CDK reports when a drag ends: how far it went, and a source to reset. */
const dragEnd = (x: number) => ({ distance: { x, y: 0 }, source: { reset: vi.fn() } }) as unknown as CdkDragEnd;

describe('MixClipComponent', () => {
  let fixture: ComponentFixture<MixClipComponent>;
  let c: MixClipComponent & Record<string, (...a: unknown[]) => void>;
  let moved: number[];
  let trimmed: unknown[];

  beforeEach(() => TestBed.configureTestingModule({ imports: [MixClipComponent] }));

  function make(clip: MixClip, peaks: PeaksResponse | null | undefined = PEAKS, px = 20, snap = 1) {
    fixture = TestBed.createComponent(MixClipComponent);
    fixture.componentRef.setInput('clip', clip);
    fixture.componentRef.setInput('label', 'base');
    fixture.componentRef.setInput('peaks', peaks);
    fixture.componentRef.setInput('pxPerSecond', px);
    fixture.componentRef.setInput('snap', snap);
    moved = [];
    trimmed = [];
    fixture.componentInstance.moved.subscribe((v: number) => moved.push(v));
    fixture.componentInstance.trimmed.subscribe((v) => trimmed.push(v));
    fixture.detectChanges();
    c = fixture.componentInstance as unknown as typeof c;
  }
  const host = () => fixture.nativeElement as HTMLElement;

  it('is as wide as the used part and sits at its start', () => {
    make({ track: 'a', start: 5, trim_start: 2, trim_end: 12 });
    expect(host().style.left).toBe('100px');
    expect(host().style.width).toBe('200px');
    expect(host().getAttribute('aria-label')).toContain('segundo 5');
  });

  it('draws the used part of the waveform and says when there is no audio', () => {
    make({ track: 'a' });
    expect(host().querySelector('svg path')?.getAttribute('d')).toContain('M');
    make({ track: 'a' }, null);
    expect(host().querySelector('svg')).toBeNull();
    expect(host().textContent).toContain('sin audio');
    expect(host().classList).toContain('clip--unreadable');
  });

  it('with an anchor, a drag puts the first beat of the song on the grid, not the start of the file', () => {
    // 0.5 s beat; the song's first sound is at 1.7 s, so it starts 0.2 s before a line to land on it at 2 s... or at 1.5 s
    make({ track: 'a' }, PEAKS, 20, 0.5);
    fixture.componentRef.setInput('anchor', 1.7);
    fixture.detectChanges();
    c['onMoved'](dragEnd(100)); // raw start 5 s: first beat at 6.7 s, nearest line 6.5 s -> start 4.8 s
    expect(moved).toEqual([4.8]);
    c['onMoved'](dragEnd(-100)); // before 0: the first line after the anchor, 2 s -> start 0.3 s
    expect(moved[1]).toBe(0.3);
  });

  it('with a pulse, anchors on the first beat the clip still plays', () => {
    // beat every 0.5 s, the pulse falls at 0.2 s in the file
    make({ track: 'a' }, PEAKS, 20, 0.5);
    fixture.componentRef.setInput('anchor', 0.2);
    fixture.componentRef.setInput('period', 0.5);
    fixture.detectChanges();
    c['onMoved'](dragEnd(100)); // raw start 5: first beat at 5.2, nearest line 5 -> start 4.8
    expect(moved).toEqual([4.8]);
    make({ track: 'a', trim_start: 1 }, PEAKS, 20, 0.5); // the first beat it plays is at 1.2 (0.2 into the part)
    fixture.componentRef.setInput('anchor', 0.2);
    fixture.componentRef.setInput('period', 0.5);
    fixture.detectChanges();
    c['onMoved'](dragEnd(100)); // raw 5: beat at 5.2 -> line 5 -> start 4.8
    expect(moved).toEqual([4.8]);
    make({ track: 'a', trim_start: 1.35 }, PEAKS, 20, 0.5); // the first beat it plays is at 1.7: 0.35 into the part
    fixture.componentRef.setInput('anchor', 0.2);
    fixture.componentRef.setInput('period', 0.5);
    fixture.detectChanges();
    c['onMoved'](dragEnd(100)); // raw 5: beat at 5.35 -> line 5.5 -> start 5.15
    expect(moved).toEqual([5.15]);
  });

  it('a trimmed clip anchors on the part it still plays', () => {
    make({ track: 'a', trim_start: 1.2 }, PEAKS, 20, 0.5);
    fixture.componentRef.setInput('anchor', 1.7);
    fixture.detectChanges();
    c['onMoved'](dragEnd(100)); // the sound is 0.5 s into the part: raw 5 -> line 5.5 -> start 5 s
    expect(moved).toEqual([5]);
    make({ track: 'a', trim_start: 3 }, PEAKS, 20, 0.5); // trimmed past the first sound: the start snaps
    fixture.componentRef.setInput('anchor', 1.7);
    fixture.detectChanges();
    c['onMoved'](dragEnd(110));
    expect(moved).toEqual([5.5]);
  });

  it('a drag moves it by the distance, snapped to the grid and never before 0', () => {
    make({ track: 'a', start: 2 });
    c['onMoved'](dragEnd(59)); // +2.95 s
    expect(moved.at(-1)).toBe(5);
    c['onMoved'](dragEnd(-200)); // far to the left
    expect(moved.at(-1)).toBe(0);
    make({ track: 'a', start: 2 }, PEAKS, 20, 0); // free
    c['onMoved'](dragEnd(25));
    expect(moved.at(-1)).toBe(3.25);
  });

  it('the arrow keys move it by a grid step, ten times more with shift', () => {
    make({ track: 'a', start: 4 }, PEAKS, 20, 1);
    c['onKey']({ key: 'ArrowRight', shiftKey: false, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    c['onKey']({ key: 'ArrowLeft', shiftKey: true, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(moved).toEqual([5, 0]);
  });

  it('Enter selects it', () => {
    make({ track: 'a' });
    const picked = vi.fn();
    fixture.componentInstance.picked.subscribe(picked);
    c['onKey']({ key: 'Enter', shiftKey: false, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    host().click();
    expect(picked).toHaveBeenCalledTimes(2);
  });

  it('trimming the left edge moves the clip with it so the sound stays in place', () => {
    make({ track: 'a', start: 10 });
    c['onTrimStart'](dragEnd(40)); // +2 s
    expect(trimmed.at(-1)).toEqual({ trim_start: 2, start: 12 });
    make({ track: 'a', start: 10, trim_start: 2 });
    c['onTrimStart'](dragEnd(-40)); // back to the start of the file
    expect(trimmed.at(-1)).toEqual({ trim_start: undefined, start: 10 - 2 });
  });

  it('trimming the right edge sets trim_end, and the end of the file clears it', () => {
    make({ track: 'a', trim_end: 20 });
    c['onTrimEnd'](dragEnd(-100)); // -5 s
    expect(trimmed.at(-1)).toEqual({ trim_end: 15 });
    c['onTrimEnd'](dragEnd(400)); // past the end of the 30 s file
    expect(trimmed.at(-1)).toEqual({ trim_end: undefined });
  });
});

describe('the timeline, the panel and the editor', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let store: MusicStore;
  const dialogData = { index: 0 };
  const dialogClose = vi.fn();
  const dialogAddClass = vi.fn();
  const dialogRemoveClass = vi.fn();
  const CONFIG: ProjectConfig = {
    project: 'songs',
    output: { mode: 'music', file: '', contact_sheet: false },
    defaults: { model: '', voice: '', resolution: '', sampler: '', steps: 0, fps: 0, subject_prompt: '', negative_prompt: '', lora_model_dir: '' },
    scenes: [],
    tracks: [{ id: 'base', prompt: 'calm' }, { id: 'voz', prompt: 'choir' }],
    mixes: [{ id: 'final', clips: [{ track: 'base' }, { track: 'voz', start: 10 }, { file: 'fx.mp3' }] }],
  };
  const MANIFEST = {
    project: 'songs', mode: 'music', generated_at: '',
    tracks: [
      { track_id: 'base', variant: 0, effective_seed: 1, use_lm: false, caption: 'c', synth_model: 'm', params: {}, file: 'out/songs/base.mp3' },
      { track_id: 'voz', variant: 0, effective_seed: 2, use_lm: false, caption: 'c', synth_model: 'm', params: {}, file: 'out/songs/voz.mp3' },
    ],
  };

  beforeEach(async () => {
    api = {
      getConfig: vi.fn(() => of({ yaml: '', parsed: structuredClone(CONFIG), valid: true })),
      saveConfig: vi.fn(() => of({ saved: true })),
      launchRun: vi.fn(() => of({ run: { id: 'run-1', project: 'songs', state: 'running' }, queue_position: 0 })),
      getMusicManifest: vi.fn(() => of(structuredClone(MANIFEST))),
      listSources: vi.fn(() => of({ sources: [{ name: 'fx.mp3', kind: 'audio', size: 1, modified: '' }, { name: 'cover.png', kind: 'image', size: 1, modified: '' }] })),
      getPeaks: vi.fn((_p: string, file: string, _b?: number, bpm?: number) =>
        file.includes('fx') ? throwError(() => new Error('x')) : of(bpm ? { ...PEAKS, beat_offset: 0.3 } : PEAKS),
      ),
      getLoudness: vi.fn((_p: string, file: string) => of({ lufs: file.includes('voz') ? -20 : -26 })),
      artifactUrl: vi.fn((p: string, rel: string) => `/api/projects/${p}/artifacts/${rel}`),
    };
    TestBed.configureTestingModule({
      providers: [
        MusicStore,
        { provide: MAT_DIALOG_DATA, useValue: dialogData },
        { provide: MatDialogRef, useValue: { close: dialogClose, addPanelClass: dialogAddClass, removePanelClass: dialogRemoveClass } },
        { provide: ApiService, useValue: api },
        { provide: RunStreamService, useValue: { connect: vi.fn(() => ({ events: signal([]), lines: signal([]), state: signal(null), ended: signal(false), close: vi.fn() })) } },
        { provide: EnvironmentStore, useValue: { report: signal(null) } },
      ],
    });
    store = TestBed.inject(MusicStore);
    await store.load('songs');
  });

  async function settle(f: ComponentFixture<unknown>): Promise<void> {
    for (let i = 0; i < 3; i++) {
      f.detectChanges();
      await f.whenStable();
      await new Promise((r) => setTimeout(r)); // the peaks arrive through promises
    }
    f.detectChanges();
  }
  const q = (f: ComponentFixture<unknown>, sel: string) => (f.nativeElement as HTMLElement).querySelector(sel) as HTMLElement | null;
  const qa = (f: ComponentFixture<unknown>, sel: string) => Array.from((f.nativeElement as HTMLElement).querySelectorAll(sel)) as HTMLElement[];

  describe('MixTimelineComponent', () => {
    let f: ComponentFixture<MixTimelineComponent>;
    beforeEach(async () => {
      f = TestBed.createComponent(MixTimelineComponent);
      f.componentRef.setInput('mix', store.mixes()[0]);
      f.componentRef.setInput('mixIndex', 0);
      await settle(f);
    });

    it('offers the beat and the bar of the first song with a tempo, and draws their lines when chosen', async () => {
      const song = (track_id: string, file: string, bpm?: number) => ({ track_id, variant: 0, effective_seed: 1, use_lm: false, caption: 'c', synth_model: 'm', params: {}, file, bpm, timesignature: '3' });
      store.results.set([song('base', 'out/songs/base.mp3'), song('voz', 'out/songs/voz.mp3', 120)]); // the first one says no tempo
      await settle(f);
      const labels = () => qa(f, '[data-testid=snap] option').map((o) => o.textContent?.trim());
      expect(labels()).toEqual(['libre', '0.1 s', '0.5 s', '1 s', '5 s', 'pulso · 120 bpm', 'compás · 3 pulsos']);
      expect(qa(f, '[data-testid=grid-line]')).toHaveLength(0); // the default snap is 1 s: no beat lines
      const select = q(f, '[data-testid=snap]') as HTMLSelectElement;
      select.value = '1.5'; // the bar: 3 beats of 0.5 s
      select.dispatchEvent(new Event('change'));
      await settle(f);
      const lines = qa(f, '[data-testid=grid-line]');
      expect(lines.length).toBeGreaterThan(10);
      expect(lines[1].style.left).toBe('30px'); // 1.5 s at 20 px/s
      expect(lines.every((l) => l.classList.contains('tl__grid--bar'))).toBe(true);
      select.value = '0.5'; // the beat: every third line is a bar
      select.dispatchEvent(new Event('change'));
      await settle(f);
      const beats = qa(f, '[data-testid=grid-line]');
      expect(beats[1].classList.contains('tl__grid--bar')).toBe(false);
      expect(beats[3].classList.contains('tl__grid--bar')).toBe(true);
    });

    it('crossfades the overlaps in one undo step, and disables itself once nothing is left to fade', async () => {
      const button = () => q(f, '[data-testid=crossfade]') as HTMLButtonElement;
      const refresh = async () => {
        f.componentRef.setInput('mix', store.mixes()[0]);
        await settle(f);
      };
      store.updateClip(0, 2, { mute: true }); // the effect clip is left out
      store.updateClip(0, 1, { start: 25 }); // base plays 0-30 (the peaks' length), voz starts at 25
      await refresh();
      expect(button().disabled).toBe(false);
      button().click();
      await refresh();
      const clips = store.mixes()[0].clips;
      expect(clips[0].fade_out).toBe(5);
      expect(clips[1].fade_in).toBe(5);
      expect(button().disabled).toBe(true);
      store.undo();
      expect(store.mixes()[0].clips[0].fade_out).toBeUndefined();
      expect(store.mixes()[0].clips[1].start).toBe(25); // only the fades were undone
    });

    it('asks where the pulse falls only while the snap follows the beat, and gives it to the clips', async () => {
      const song = (track_id: string, file: string, bpm?: number) => ({ track_id, variant: 0, effective_seed: 1, use_lm: false, caption: 'c', synth_model: 'm', params: {}, file, bpm, timesignature: '4' });
      store.results.set([song('base', 'out/songs/base.mp3', 120), song('voz', 'out/songs/voz.mp3', 120)]);
      await settle(f);
      const withBpm = () => api['getPeaks'].mock.calls.filter((c) => c[3] !== undefined);
      expect(withBpm()).toHaveLength(0); // the snap is in seconds
      const select = q(f, '[data-testid=snap]') as HTMLSelectElement;
      select.value = '0.5';
      select.dispatchEvent(new Event('change'));
      await settle(f);
      expect(withBpm().map((c) => [c[1], c[3]])).toEqual([['out/songs/base.mp3', 120], ['out/songs/voz.mp3', 120]]);
      const clips = qa(f, 'app-mix-clip');
      expect(clips.length).toBe(3);
      const inst = f.debugElement.queryAll((d) => d.name === 'app-mix-clip').map((d) => d.componentInstance as { anchor(): number; period(): number });
      expect([inst[0].anchor(), inst[0].period()]).toEqual([0.3, 0.5]); // the pulse found, and the beat
      expect([inst[2].anchor(), inst[2].period()]).toEqual([0, 0]); // fx.mp3 is not a song with a tempo: its first sound, none readable
    });

    it('draws a row per clip, with the waveform of the ones that have audio', () => {
      expect(qa(f, 'app-mix-clip')).toHaveLength(3);
      expect(qa(f, 'app-mix-clip svg')).toHaveLength(2); // fx.mp3 cannot be read
      expect(api['getPeaks']).toHaveBeenCalledTimes(3);
      expect(api['getPeaks'].mock.calls.map((c) => c[1]).sort()).toEqual(['out/songs/base.mp3', 'out/songs/voz.mp3', 'sources/fx.mp3']);
    });

    it('has a ruler, zoom that changes the scale and a snap selector', async () => {
      expect(qa(f, '.tl__tick').length).toBeGreaterThan(3);
      const width = () => parseFloat(q(f, '.tl__canvas')!.style.width);
      const w = width();
      q(f, '[data-testid=zoom-in]')!.click();
      await settle(f);
      expect(q(f, '[data-testid=zoom-value]')!.textContent).toContain('30');
      expect(width()).toBeGreaterThan(w);
      expect(qa(f, '[data-testid=snap] option').map((o) => o.textContent?.trim())).toEqual(['libre', '0.1 s', '0.5 s', '1 s', '5 s']);
    });

    it('moving a clip writes its start into the project and selects it; start 0 leaves the key out', async () => {
      const comp = f.componentInstance as unknown as { move(i: number, s: number): void };
      comp.move(1, 14.5);
      expect(store.mixes()[0].clips[1].start).toBe(14.5);
      expect(store.dirty()).toBe(true);
      expect(f.componentInstance.selected()).toBe(1);
      comp.move(1, 0);
      expect('start' in store.mixes()[0].clips[1]).toBe(false);
    });

    it('trimming writes the trims and moves the start with the left edge', () => {
      const comp = f.componentInstance as unknown as { trim(i: number, t: object): void };
      comp.trim(1, { trim_start: 2, start: 12 });
      expect(store.mixes()[0].clips[1]).toMatchObject({ trim_start: 2, start: 12 });
      comp.trim(1, { trim_end: 20 });
      expect(store.mixes()[0].clips[1].trim_end).toBe(20);
      comp.trim(1, { trim_end: undefined });
      expect('trim_end' in store.mixes()[0].clips[1]).toBe(false);
    });
    describe('listening to one clip alone', () => {
      type Listener = () => void;
      class FakeAudio {
        static last: FakeAudio;
        src = '';
        volume = 1;
        currentTime = 0;
        preload = '';
        paused = true;
        private listeners = new Map<string, Listener[]>();
        constructor() {
          FakeAudio.last = this;
        }
        addEventListener(ev: string, fn: Listener): void {
          this.listeners.set(ev, [...(this.listeners.get(ev) ?? []), fn]);
        }
        emit(ev: string): void {
          for (const fn of this.listeners.get(ev) ?? []) fn();
        }
        play(): Promise<void> {
          this.paused = false;
          this.emit('play');
          return Promise.resolve();
        }
        pause(): void {
          if (this.paused) return;
          this.paused = true;
          this.emit('pause');
        }
      }
      const play = (i: number) => q(f, `[data-testid=play-${i}]`) as HTMLButtonElement;

      beforeEach(() => vi.stubGlobal('Audio', FakeAudio));
      afterEach(() => vi.unstubAllGlobals());

      it('has a listen button per row, disabled when the clip has no audio', () => {
        expect(qa(f, '.tl__head')).toHaveLength(3);
        expect(play(0).disabled).toBe(false);
        expect(play(2).disabled).toBe(true); // fx.mp3 cannot be read
      });

      it('plays the used part of that clip at its volume, and the same button stops it', async () => {
        store.updateClip(0, 1, { trim_start: 2, trim_end: 9, gain: 1.5 });
        f.componentRef.setInput('mix', store.mixes()[0]); // the editor passes the edited mix down
        await settle(f);
        play(1).click();
        await settle(f);
        const a = FakeAudio.last;
        expect(a.src).toBe('/api/projects/songs/artifacts/out/songs/voz.mp3');
        expect(a.volume).toBe(1); // a gain above 1 cannot be heard louder than the file
        a.emit('loadedmetadata');
        expect(a.currentTime).toBe(2);
        expect(a.paused).toBe(false);
        expect(play(1).getAttribute('aria-pressed')).toBe('true');

        a.currentTime = 9.1;
        a.emit('timeupdate'); // the clip's end
        await settle(f);
        expect(a.paused).toBe(true);
        expect(play(1).getAttribute('aria-pressed')).toBe('false');

        play(1).click();
        a.emit('loadedmetadata');
        await settle(f);
        play(1).click(); // asking again stops it
        await settle(f);
        expect(a.paused).toBe(true);
      });

      it('shows a small marker only in the row being listened to, where its second falls on the timeline', async () => {
        store.updateClip(0, 1, { start: 10, trim_start: 2 });
        f.componentRef.setInput('mix', store.mixes()[0]);
        await settle(f);
        expect(q(f, '[data-testid=solo-marker]')).toBeNull();
        play(1).click();
        const a = FakeAudio.last;
        a.emit('loadedmetadata');
        a.currentTime = 5; // 3 s into the used part
        a.emit('timeupdate');
        await settle(f);
        const marks = qa(f, '[data-testid=solo-marker]');
        expect(marks).toHaveLength(1);
        expect(marks[0].closest('[data-testid=lane-1]')).not.toBeNull();
        expect(marks[0].style.left).toBe(`${(10 + 3) * 20}px`);
        play(1).click(); // stops
        await settle(f);
        expect(q(f, '[data-testid=solo-marker]')).toBeNull();
      });

      it('draws one bar across the rows at the second of the mix being played', async () => {
        expect(q(f, '[data-testid=playhead]')).toBeNull();
        f.componentRef.setInput('playhead', 7.5);
        await settle(f);
        expect(q(f, '[data-testid=playhead]')!.style.left).toBe(`${7.5 * 20}px`);
        f.componentRef.setInput('playhead', null);
        await settle(f);
        expect(q(f, '[data-testid=playhead]')).toBeNull();
      });

      describe('changes heard while a track plays alone', () => {
        const listen = async (clip: Partial<MixClip> = {}) => {
          store.updateClip(0, 1, clip);
          f.componentRef.setInput('mix', store.mixes()[0]);
          await settle(f);
          play(1).click();
          const a = FakeAudio.last;
          Object.assign(a, { duration: 30 });
          a.emit('loadedmetadata');
          await settle(f);
          return a;
        };
        const edit = async (patch: Partial<MixClip>) => {
          store.updateClip(0, 1, patch);
          f.componentRef.setInput('mix', store.mixes()[0]);
          await settle(f);
        };

        it('a new volume is heard at once', async () => {
          const a = await listen({ gain: 1 });
          expect(a.volume).toBe(1);
          await edit({ gain: 0.4 });
          expect(a.volume).toBeCloseTo(0.4);
        });

        it('a fade in is heard as the playback advances through it', async () => {
          const a = await listen({ trim_start: 2, fade_in: 4 });
          a.currentTime = 4; // 2 s into a 4 s fade
          a.emit('timeupdate');
          expect(a.volume).toBeCloseTo(0.5);
          await edit({ fade_in: 0 }); // the fade is removed while it plays
          expect(a.volume).toBe(1);
        });

        it('a fade out is heard near the end of the used part', async () => {
          const a = await listen({ trim_end: 20, fade_out: 4 });
          a.currentTime = 18;
          a.emit('timeupdate');
          expect(a.volume).toBeCloseTo(0.5);
        });

        it('a trim moved while it plays takes effect: a new end stops it, a start ahead of the playhead jumps to it', async () => {
          const a = await listen({});
          a.currentTime = 6;
          await edit({ trim_start: 10 });
          expect(a.currentTime).toBe(10);
          a.currentTime = 11;
          await edit({ trim_end: 10.5 }); // already past the new end
          expect(a.paused).toBe(true);
        });

        it('shows in the clip panel that the changes are heard live', async () => {
          const panel = TestBed.createComponent(ClipPanelComponent);
          panel.componentRef.setInput('mixIndex', 0);
          panel.componentRef.setInput('clipIndex', 1);
          await settle(panel);
          expect(q(panel, '[data-testid=live-hint]')!.textContent).toContain('se oyen al momento');
        });
      });

      describe('moving what is playing', () => {
        const drag = (el: HTMLElement, type: string, clientX: number) => el.dispatchEvent(new MouseEvent(type, { clientX, bubbles: true }));
        const startSolo = async (clip: Partial<MixClip> = {}) => {
          store.updateClip(0, 1, clip);
          f.componentRef.setInput('mix', store.mixes()[0]);
          await settle(f);
          play(1).click();
          const a = FakeAudio.last;
          Object.assign(a, { duration: 30 });
          a.emit('loadedmetadata');
          a.emit('timeupdate');
          await settle(f);
          return a;
        };

        it('dragging the small marker moves the playback to that second of the file', async () => {
          const a = await startSolo({ start: 10, trim_start: 2, trim_end: 20 });
          const marker = q(f, '[data-testid=solo-marker]')!;
          drag(marker, 'pointerdown', 300); // second 15 of the timeline: 5 s into the used part -> second 7 of the file
          expect(a.currentTime).toBe(7);
          drag(marker, 'pointermove', 400); // second 20 -> 12
          expect(a.currentTime).toBe(12);
          drag(marker, 'pointermove', 1000); // far beyond the end: kept inside the used part
          expect(a.currentTime).toBeLessThan(20);
          expect(a.currentTime).toBeGreaterThan(19.9);
          drag(marker, 'pointermove', 0); // before the clip starts: its first used second
          expect(a.currentTime).toBe(2);
          drag(marker, 'pointerup', 0);
          drag(marker, 'pointermove', 400); // no longer following
          expect(a.currentTime).toBe(2);
        });

        it('a click on the ruler plays the track that is playing alone from there', async () => {
          const a = await startSolo({ start: 0 });
          drag(q(f, '[data-testid=ruler]')!, 'click', 160); // second 8
          expect(a.currentTime).toBe(8);
        });

        it('without a track playing alone, the bar and the ruler move the mix', async () => {
          const seeks: number[] = [];
          f.componentInstance.seek.subscribe((s) => seeks.push(s));
          f.componentRef.setInput('playhead', 4);
          await settle(f);
          drag(q(f, '[data-testid=playhead]')!, 'pointerdown', 100);
          drag(q(f, '[data-testid=playhead]')!, 'pointermove', 240);
          drag(q(f, '[data-testid=ruler]')!, 'click', 60);
          expect(seeks).toEqual([5, 12, 3]);
        });

        it('the arrow keys move a bar a second, ten with shift', async () => {
          const seeks: number[] = [];
          f.componentInstance.seek.subscribe((s) => seeks.push(s));
          f.componentRef.setInput('playhead', 4);
          await settle(f);
          const bar = q(f, '[data-testid=playhead]')!;
          bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
          bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true }));
          expect(seeks).toEqual([5, 0]);
        });
      });

      it('listening to another clip replaces the first one', async () => {
        play(0).click();
        FakeAudio.last.emit('loadedmetadata');
        await settle(f);
        expect(play(0).getAttribute('aria-pressed')).toBe('true');
        play(1).click();
        await settle(f);
        expect(play(0).getAttribute('aria-pressed')).toBe('false');
        expect(play(1).getAttribute('aria-pressed')).toBe('true');
        expect(FakeAudio.last.src).toContain('voz.mp3');
      });
    });
  });

  describe('ClipPanelComponent', () => {
    let f: ComponentFixture<ClipPanelComponent>;
    const type = async (testid: string, value: string) => {
      const el = q(f, `[data-testid=${testid}]`) as HTMLInputElement;
      el.value = value;
      el.dispatchEvent(new Event('change'));
      await settle(f);
    };
    beforeEach(async () => {
      f = TestBed.createComponent(ClipPanelComponent);
      f.componentRef.setInput('mixIndex', 0);
      f.componentRef.setInput('clipIndex', 1);
      await settle(f);
    });

    it('edits the numbers of the clip and clears a field that is emptied', async () => {
      await type('clip-gain', '0.5');
      await type('clip-fade-in', '1.5');
      await type('clip-start', '12');
      expect(store.mixes()[0].clips[1]).toMatchObject({ gain: 0.5, fade_in: 1.5, start: 12 });
      await type('clip-fade-in', '');
      expect('fade_in' in store.mixes()[0].clips[1]).toBe(false);
    });

    it('mutes, and shows the rule that a value breaks next to its field', async () => {
      (q(f, '[data-testid=clip-mute] input') as HTMLInputElement).click();
      await settle(f);
      expect(store.mixes()[0].clips[1].mute).toBe(true);
      await type('clip-gain', '3');
      expect(f.nativeElement.textContent).toContain('El volumen va de 0 a 2');
    });

    it('«Recortar silencios» sets the trims from the audible range', async () => {
      q(f, '[data-testid=trim-silences]')!.click();
      await settle(f);
      expect(store.mixes()[0].clips[1]).toMatchObject({ trim_start: 1.7, trim_end: 24.6 });
    });

    it('says so when there is nothing to trim, no audio yet, or it cannot be read', async () => {
      api['getPeaks'].mockReturnValue(of({ ...PEAKS, active: { start: 0, end: 30 } }));
      store.updateClip(0, 1, { trim_start: undefined });
      f.componentRef.setInput('clipIndex', 1);
      store['peaksCache' as keyof MusicStore] && (store as unknown as { peaksCache: Map<string, unknown> }).peaksCache.clear();
      q(f, '[data-testid=trim-silences]')!.click();
      await settle(f);
      expect(q(f, '[data-testid=trim-note]')!.textContent).toContain('No hay silencio');
      expect('trim_start' in store.mixes()[0].clips[1]).toBe(false);
      // a clip of a track with no song yet
      store.addClip(0, { track: 'voz', variant: 2 });
      f.componentRef.setInput('clipIndex', 3);
      await settle(f);
      q(f, '[data-testid=trim-silences]')!.click();
      await settle(f);
      expect(q(f, '[data-testid=trim-note]')!.textContent).toContain('crea la pista primero');
    });

    it('removes the clip', async () => {
      q(f, '[data-testid=remove-clip]')!.click();
      expect(store.mixes()[0].clips).toHaveLength(2);
    });
  });

  describe('MixEditorComponent', () => {
    let f: ComponentFixture<MixEditorComponent>;
    const open = async (index = 0) => {
      f = TestBed.createComponent(MixEditorComponent);
      f.componentRef.setInput('index', index);
      await settle(f);
    };

    it('puts «Añadir pista» in its own row above the timeline, not in the header', async () => {
      await open();
      const add = q(f, '[data-testid=add-clip]')!;
      expect(add.closest('.mix__tracks')).not.toBeNull();
      expect(add.closest('.mix__head')).toBeNull();
      expect(add.textContent).toContain('Añadir pista');
      expect(q(f, '[data-testid=track-count]')!.textContent).toContain('3 pistas');
    });

    it('normalised: the preview scales the clips by the estimated gain to -14 LUFS, and only reads what it needs', async () => {
      store.results.set(MANIFEST.tracks.map((t) => ({ ...t, bpm: undefined })));
      await open();
      const ed = f.componentInstance as unknown as { previewGain(): number };
      store.updateMix(0, { gain: 0.5 });
      await settle(f);
      expect(ed.previewGain()).toBe(0.5); // not normalised: the master volume
      expect(api['getLoudness']).not.toHaveBeenCalled();
      store.updateClip(0, 2, { mute: true }); // the effect clip is left out
      store.updateMix(0, { normalize: true });
      await settle(f);
      expect(api['getLoudness'].mock.calls.map((c) => c[1]).sort()).toEqual(['out/songs/base.mp3', 'out/songs/voz.mp3']);
      // base plays 0-30 at -26, voz 10-40 at -20: powers add over 40 s of sound
      const power = (30 * 10 ** (-2.6) + 30 * 10 ** (-2.0)) / 40;
      const expected = 10 ** ((-14 - 10 * Math.log10(power)) / 20);
      expect(ed.previewGain()).toBeCloseTo(expected, 4);
      store.updateClip(0, 0, { gain: 0.5 }); // a quieter clip needs more gain to reach the target
      await settle(f);
      expect(ed.previewGain()).toBeGreaterThan(expected);
    });

    it('shows the loudness of the rendered mix', async () => {
      store.mixResults.set([{ id: 'final', file: 'out/songs/final.mp3', audio_seconds: 40, hash: 'h', clips: structuredClone(CONFIG.mixes![0].clips), lufs: -14.2 }]);
      await open();
      expect(q(f, '[data-testid=mix-result]')!.textContent).toContain('-14,2 LUFS');
    });

    it('lists the favorite songs first in the menu to add a clip, marked with a star', async () => {
      store.results.set([
        { track_id: 'base', variant: 0, effective_seed: 1, use_lm: false, caption: 'c', synth_model: 'm', params: {}, file: 'out/songs/base.mp3' },
        { track_id: 'voz', variant: 0, effective_seed: 2, use_lm: false, caption: 'c', synth_model: 'm', params: {}, file: 'out/songs/voz.mp3' },
      ]);
      store.toggleFavorite(store.results()[1]);
      await open();
      const choices = (f.componentInstance as unknown as { songChoices(): { label: string; favorite?: boolean }[] }).songChoices();
      expect(choices.map((c) => [c.label, !!c.favorite])).toEqual([['voz', true], ['base', false]]);
    });

    it('edits the master volume and the normalisation of the mix', async () => {
      await open();
      const gain = q(f, '[data-testid=mix-gain]') as HTMLInputElement;
      expect(gain.value).toBe('1');
      gain.value = '0.6';
      gain.dispatchEvent(new Event('change'));
      (q(f, '[data-testid=mix-normalize] input') as HTMLInputElement).click();
      await settle(f);
      expect(store.mixes()[0]).toMatchObject({ gain: 0.6, normalize: true });
      gain.value = '5';
      gain.dispatchEvent(new Event('change'));
      await settle(f);
      expect(q(f, '[data-testid=mix-master]')!.textContent).toContain('0 a 2');
    });

    it('lists the exported songs and the audio sources to add as clips, not the pictures', async () => {
      await open();
      const choices = (f.componentInstance as unknown as { songChoices(): { label: string }[]; sourceChoices(): { label: string }[] });
      expect(choices.songChoices().map((c) => c.label)).toEqual(['base', 'voz']);
      expect(choices.sourceChoices().map((c) => c.label)).toEqual(['fx.mp3']);
    });

    describe('the preview without mixing', () => {
      class PreviewAudio {
        static all: PreviewAudio[] = [];
        src = '';
        preload = '';
        volume = 1;
        currentTime = 0;
        duration = 30;
        paused = true;
        constructor() {
          PreviewAudio.all.push(this);
        }
        addEventListener(): void {}
        removeAttribute(): void {}
        load(): void {}
        play(): Promise<void> {
          this.paused = false;
          return Promise.resolve();
        }
        pause(): void {
          this.paused = true;
        }
      }
      beforeEach(() => {
        PreviewAudio.all = [];
        vi.stubGlobal('Audio', PreviewAudio);
        vi.stubGlobal('requestAnimationFrame', () => 1);
      });
      afterEach(() => vi.unstubAllGlobals());

      it('has a button that plays every track together without rendering, and a stop once it has started', async () => {
        await open();
        expect(q(f, '[data-testid=live-stop]')).toBeNull();
        q(f, '[data-testid=live-play]')!.click();
        await settle(f);
        // base and voz have songs; fx.mp3 is a source: the three of them are read
        expect(PreviewAudio.all.map((a) => a.src).sort()).toEqual([
          '/api/projects/songs/artifacts/out/songs/base.mp3',
          '/api/projects/songs/artifacts/out/songs/voz.mp3',
          '/api/projects/songs/artifacts/sources/fx.mp3',
        ]);
        expect(q(f, '[data-testid=live-play]')!.getAttribute('aria-pressed')).toBe('true');
        expect(q(f, '[data-testid=live-stop]')).not.toBeNull();
        expect(api['saveConfig']).not.toHaveBeenCalled(); // nothing was saved or rendered
        expect(api['launchRun']).not.toHaveBeenCalled();
        q(f, '[data-testid=live-play]')!.click(); // pause
        await settle(f);
        expect(q(f, '[data-testid=live-play]')!.getAttribute('aria-pressed')).toBe('false');
      });

      it('is disabled when no track has a song to hear', async () => {
        store.updateClip(0, 0, { mute: true });
        store.updateClip(0, 1, { mute: true });
        store.updateClip(0, 2, { mute: true });
        await open();
        expect((q(f, '[data-testid=live-play]') as HTMLButtonElement).disabled).toBe(true);
      });

      it('moving the bar before playing sets where the preview starts', async () => {
        await open();
        const comp = f.componentInstance as unknown as { seekMix(s: number): void; live: { position(): number | null } };
        comp.seekMix(7);
        expect(comp.live.position()).toBe(7);
        await settle(f);
        expect(q(f, '[data-testid=playhead]')).not.toBeNull();
      });
    });


    it('adds a chosen clip and selects it', async () => {
      await open();
      (f.componentInstance as unknown as { add(c: { clip: MixClip }): void }).add({ clip: { track: 'base' } });
      expect(store.mixes()[0].clips).toHaveLength(4);
      await settle(f);
      expect(qa(f, 'app-clip-panel')).toHaveLength(1);
    });

    it('renames the mix and blocks Mezclar on a bad id or without clips', async () => {
      await open();
      const input = q(f, '[data-testid=mix-id]') as HTMLInputElement;
      input.value = 'a b';
      input.dispatchEvent(new Event('change'));
      await settle(f);
      expect(f.nativeElement.textContent).toContain('El id solo admite');
      expect((q(f, '[data-testid=mix-now]') as HTMLButtonElement).disabled).toBe(true);
    });

    it('tells which tracks have no song yet', async () => {
      api['getMusicManifest'].mockReturnValue(of({ ...MANIFEST, tracks: [MANIFEST.tracks[0]] }));
      await store.reloadResults();
      await open();
      expect(q(f, '[data-testid=mix-missing]')!.textContent).toContain('voz');
    });

    it('Mezclar saves and runs only this mix', async () => {
      await open();
      store.updateClip(0, 0, { gain: 0.9 });
      await settle(f);
      (q(f, '[data-testid=mix-now]') as HTMLButtonElement).click();
      await settle(f);
      expect(api['saveConfig']).toHaveBeenCalled();
      expect(api['launchRun'].mock.calls[0][1]).toMatchObject({ only: 'final' });
    });

    it('plays the rendered mix only when it matches the clips on screen', async () => {
      api['getMusicManifest'].mockReturnValue(
        of({
          ...MANIFEST,
          mixes: [{ id: 'final', file: 'out/songs/final.mp3', audio_seconds: 41.5, hash: 'h', clips: [{ track: 'base', variant: 1, start: 0, gain: 1 }, { track: 'voz', variant: 1, start: 10, gain: 1 }, { file: 'fx.mp3', start: 0, gain: 1 }] }],
        }),
      );
      await store.reloadResults();
      await open();
      expect(q(f, 'mo-audio-player')).not.toBeNull();
      expect(q(f, '[data-testid=mix-result]')!.textContent).toMatch(/41[.,]5/);
      store.updateClip(0, 1, { start: 11 });
      await settle(f);
      expect(q(f, 'mo-audio-player')).toBeNull();
      expect(q(f, '[data-testid=mix-stale]')).not.toBeNull();
    });

    it('shows the server rejection of this mix', async () => {
      await open();
      store.serverMixIssues.set([{ mixId: 'final', clip: 2, text: 'mix "final" clip 2: boom' }]);
      await settle(f);
      expect(q(f, '[data-testid=mix-server-error]')!.textContent).toContain('clip 2: boom');
    });
  });

  describe('MixDialogComponent', () => {
    const make = async (index = 0) => {
      dialogClose.mockClear();
      dialogData.index = index;
      const f = TestBed.createComponent(MixDialogComponent);
      await settle(f);
      return f;
    };

    it('holds the mixer of the chosen mix, with a way to close it', async () => {
      const f = await make();
      expect(qa(f, 'app-mix-editor')).toHaveLength(1);
      expect(q(f, '[data-testid=mix-0]')).not.toBeNull();
      expect(q(f, '[data-testid=close-mixer]')).not.toBeNull();
      expect(q(f, '[data-testid=mixer-handle]')).not.toBeNull(); // the title moves the window
    });

    it('has a grip on each side and corner to resize it from any of them', async () => {
      const f = await make();
      expect(qa(f, '[data-edge]').map((e) => e.getAttribute('data-edge')).sort()).toEqual(['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w']);
    });

    it('maximizes and restores, from the button and with a double click on the bar', async () => {
      const f = await make();
      dialogAddClass.mockClear();
      q(f, '[data-testid=maximize-mixer]')!.click();
      await settle(f);
      expect(dialogAddClass).toHaveBeenCalledWith('mo-maximized');
      expect(qa(f, '[data-edge]')).toHaveLength(0); // nothing to resize while it fills the screen
      expect(q(f, '[data-testid=maximize-mixer]')!.getAttribute('aria-pressed')).toBe('true');
      q(f, '[data-testid=mixer-handle]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await settle(f);
      expect(dialogRemoveClass).toHaveBeenCalledWith('mo-maximized');
      expect(qa(f, '[data-edge]')).toHaveLength(8);
    });

    it('the X closes it', async () => {
      const f = await make();
      q(f, '[data-testid=close-mixer]')!.click();
      await settle(f);
      expect(q(f, '[data-testid=close-mixer]')!.hasAttribute('mat-dialog-close')).toBe(true);
    });

    it('undoes and redoes the last edit with the buttons and with Ctrl+Z, but not while typing in a field', async () => {
      const f = await make();
      const undo = q(f, '[data-testid=mix-undo]') as HTMLButtonElement;
      expect(undo.disabled).toBe(true);
      store.updateClip(0, 1, { start: 20 });
      await settle(f);
      expect(undo.disabled).toBe(false);
      undo.click();
      await settle(f);
      expect(store.mixes()[0].clips[1].start).toBe(10);
      (q(f, '[data-testid=mix-redo]') as HTMLButtonElement).click();
      await settle(f);
      expect(store.mixes()[0].clips[1].start).toBe(20);

      const key = (target: Element, init: KeyboardEventInit) => {
        const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
        target.dispatchEvent(e);
        return e;
      };
      const host = f.nativeElement as HTMLElement;
      expect(key(host, { key: 'z', ctrlKey: true }).defaultPrevented).toBe(true);
      expect(store.mixes()[0].clips[1].start).toBe(10);
      key(host, { key: 'z', ctrlKey: true, shiftKey: true });
      expect(store.mixes()[0].clips[1].start).toBe(20);
      const input = q(f, '[data-testid=mix-id]')!;
      expect(key(input, { key: 'z', ctrlKey: true }).defaultPrevented).toBe(false); // the browser undoes typing there
      expect(store.mixes()[0].clips[1].start).toBe(20);
    });

    it('closes by itself when its mix is removed', async () => {
      const f = await make();
      expect(dialogClose).not.toHaveBeenCalled();
      store.removeMix(0);
      await settle(f);
      expect(dialogClose).toHaveBeenCalled();
    });
  });
});
