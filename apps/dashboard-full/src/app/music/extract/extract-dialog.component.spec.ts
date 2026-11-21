import { ActivityService } from '../../core/activity.service';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { ProjectConfig, Recognizer, SourceInfo } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { AvailabilityStore } from '../../core/availability.store';
import { EnvironmentStore } from '../../core/environment.store';
import { RoutingStore } from '../../core/routing.store';
import { RunStreamService } from '../../core/run-stream.service';
import { AssistModelStore } from '../../editor/assist-model/assist-model.store';
import { MusicStore } from '../music.store';
import { ExtractDialogComponent } from './extract-dialog.component';

const CONFIG: ProjectConfig = {
  project: 'songs',
  output: { mode: 'music', file: '', contact_sheet: false },
  defaults: { model: '', voice: '', resolution: '', sampler: '', steps: 0, fps: 0, subject_prompt: '', negative_prompt: '', lora_model_dir: '' },
  scenes: [],
  tracks: [{ id: 'ballad', prompt: 'old style', lyrics: 'old lyrics', vocal_language: 'en' }],
};
const SOURCES: SourceInfo[] = [
  { name: 'balada.mp3', kind: 'audio', size: 1, modified: 'a' },
  { name: 'clip.mp4', kind: 'video', size: 1, modified: 'b' },
  { name: 'foto.png', kind: 'image', size: 1, modified: 'c' },
];
const HEARD = { language: 'es', language_detected: true, text: 'Camino por la calle\nbajo la lluvia', segments: [], dropped: 0, model: 'm' };
const MEASURE = { duration: 30, bpm: 71, bpm_alternatives: [35.5, 142], bpm_confidence: 0.4, keyscale: 'F# major', key_confidence: 0.3 };
const DRAFT = { text: 'raw', caption: 'Slow Spanish ballad', lyrics: '[Verse]\nCamino por la calle\nbajo la lluvia', tags: 'ballad,slow', unchanged_words: true };

const RECOGNIZERS: Recognizer[] = [
  { id: 'whisper', available: true },
  { id: 'clap', available: true },
  { id: 'muq', available: false, reason: 'no_weights', detail: 'not converted' },
];

describe('ExtractDialogComponent', () => {
  let fixture: ComponentFixture<ExtractDialogComponent>;
  let music: MusicStore;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let close: ReturnType<typeof vi.fn>;
  let env: { report: ReturnType<typeof signal>; whisperReady: ReturnType<typeof signal<boolean>>; whisperMissing: ReturnType<typeof signal<'' | 'program' | 'model'>> };
  let available: Record<string, boolean>;
  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => el().querySelector(sel) as T | null;
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
  };
  const click = async (sel: string) => {
    q(sel)!.click();
    await settle();
  };

  async function open(over: { config?: ProjectConfig; whisper?: '' | 'program' | 'model'; sources?: SourceInfo[]; pick?: string; unavailable?: string[]; recognizers?: Recognizer[] } = {}) {
    api = {
      getConfig: vi.fn(() => of({ yaml: '', parsed: structuredClone(over.config ?? CONFIG), valid: true })),
      getMusicManifest: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404 }))),
      listSources: vi.fn(() => of({ sources: over.sources ?? SOURCES })),
      measureSource: vi.fn(() => of(MEASURE)),
      transcribeSource: vi.fn(() => of(HEARD)),
      assistSong: vi.fn(() => of(DRAFT)),
      recognizers: vi.fn(() => of({ recognizers: over.recognizers ?? RECOGNIZERS })),
      recognizeSource: vi.fn(() => of({ method: 'clap', genre: [], mood: [], instrument: [], tags: ['techno', 'synth'] })),
      describe: vi.fn(() => of({ prompt: 'a rainy street', model: 'gemma4:26b', kind: 'video', frames: 6 })),
    };
    close = vi.fn();
    available = { assistant: true, describe_video: true };
    for (const task of over.unavailable ?? []) available[task] = false;
    env = { report: signal({ music: [] }), whisperReady: signal(!over.whisper), whisperMissing: signal(over.whisper ?? '') };
    TestBed.configureTestingModule({
      imports: [ExtractDialogComponent],
      providers: [
        provideRouter([]),
        MusicStore,
        { provide: ApiService, useValue: api },
        { provide: ActivityService, useValue: { track: vi.fn() } },
        { provide: RunStreamService, useValue: { connect: vi.fn() } },
        { provide: EnvironmentStore, useValue: env },
        { provide: AvailabilityStore, useValue: { available: (t: string) => available[t] === true } },
        { provide: RoutingStore, useValue: { external: () => false } },
        { provide: AssistModelStore, useValue: { selected: () => '' } },
        { provide: MAT_DIALOG_DATA, useValue: { index: 0 } },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    music = TestBed.inject(MusicStore);
    await music.load('songs');
    fixture = TestBed.createComponent(ExtractDialogComponent);
    fixture.detectChanges();
    await settle();
    if (over.pick) {
      (fixture.componentInstance as unknown as { pick(n: string): void }).pick(over.pick);
      await settle();
    }
  }
  const track = () => music.tracks()[0];

  it('says what it does, that the lyrics are to be reviewed, that the measures are estimates and to use only what one has rights to', async () => {
    await open();
    const notes = q('[data-testid="extract-notes"]')!.textContent!;
    expect(notes).toContain('revísala');
    expect(notes).toContain('estimaciones');
    expect(notes).toContain('derechos');
  });

  it('offers the audios and the kept videos, not the pictures, and chooses the first', async () => {
    await open();
    const cmp = fixture.componentInstance as unknown as { sources(): SourceInfo[]; picked(): string };
    expect(cmp.sources().map((s) => s.name)).toEqual(['balada.mp3', 'clip.mp4']);
    expect(cmp.picked()).toBe('balada.mp3');
    expect(q<HTMLButtonElement>('[data-testid="extract-start"]')!.disabled).toBe(false);
  });

  it('says what to do first when the project has no song or video yet', async () => {
    await open({ sources: [] });
    expect(q<HTMLButtonElement>('[data-testid="extract-start"]')!.disabled).toBe(true);
    expect(q('[data-testid="extract-pick-first"]')!.textContent).toContain('Elige o sube');
  });

  it('offers Whisper, LAION-CLAP and MuQ: Whisper is chosen and MuQ cannot be, with its reason', async () => {
    await open();
    const radio = (id: string) => q<HTMLElement>(`[data-testid="extract-method-${id}"] input`) as HTMLInputElement;
    expect(radio('whisper').checked).toBe(true);
    expect(radio('clap').disabled).toBe(false);
    expect(radio('muq').disabled).toBe(true);
    expect(q('[data-testid="extract-method-muq-why"]')!.textContent).toContain('Faltan sus pesos');
    expect(q('[data-testid="extract-method-clap-why"]')).toBeNull();
  });

  it('LAION-CLAP stopped cannot be chosen and says where to start it', async () => {
    await open({ recognizers: [{ id: 'whisper', available: true }, { id: 'clap', available: false, reason: 'not_running' }, { id: 'muq', available: true }] });
    expect(q<HTMLInputElement>('[data-testid="extract-method-clap"] input')!.disabled).toBe(true);
    const why = q('[data-testid="extract-method-clap-why"]')!;
    expect(why.textContent).toContain('parado');
    expect(why.querySelector('a')!.getAttribute('href')).toBe('/environment');
  });

  it('choosing LAION-CLAP asks it for the sound and shows what it heard in the proposal', async () => {
    await open();
    q<HTMLInputElement>('[data-testid="extract-method-clap"] input')!.click();
    await settle();
    await click('[data-testid="extract-start"]');
    expect(api['recognizeSource']).toHaveBeenCalledWith('songs', 'balada.mp3', 'clap');
    expect(q('[data-testid="extract-heard"]')!.textContent).toContain('techno, synth');
  });

  it('MuQ-MuLan can be chosen when it is ready and is the method that is sent', async () => {
    await open({ recognizers: [{ id: 'whisper', available: true }, { id: 'clap', available: false, reason: 'not_running' }, { id: 'muq', available: true }] });
    expect(q<HTMLInputElement>('[data-testid="extract-method-muq"] input')!.disabled).toBe(false);
    expect(q('[data-testid="extract-method-muq-why"]')).toBeNull();
    q<HTMLInputElement>('[data-testid="extract-method-muq"] input')!.click();
    await settle();
    await click('[data-testid="extract-start"]');
    expect(api['recognizeSource']).toHaveBeenCalledWith('songs', 'balada.mp3', 'muq');
  });

  it('shows the progress and the failures in the actions bar, which stays in view when the content scrolls', async () => {
    await open();
    api['transcribeSource'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503, error: { error: { code: 'unavailable', message: 'not enough memory for Whisper' } } })));
    await click('[data-testid="extract-start"]');
    expect(q('mat-dialog-actions [data-testid="extract-error"]')!.textContent).toContain('not enough memory for Whisper');
    expect(q('mat-dialog-content [data-testid="extract-error"]')).toBeNull();
  });

  it('cannot start without Whisper and says what to install', async () => {
    await open({ whisper: 'program' });
    expect(q<HTMLButtonElement>('[data-testid="extract-start"]')!.disabled).toBe(true);
    expect(q('[data-testid="extract-no-whisper"]')!.textContent).toContain('get-whisper.sh');
    env.whisperMissing.set('model');
    await settle();
    expect(q('[data-testid="extract-no-whisper"]')!.textContent).toContain('modelo de Whisper');
    expect(q('[data-testid="extract-models"]')).not.toBeNull();
  });

  it('an mp3: shows the proposal for review and writes nothing into the track until it is applied', async () => {
    await open();
    await click('[data-testid="extract-start"]');
    expect(api['measureSource']).toHaveBeenCalledWith('songs', 'balada.mp3');
    expect(q<HTMLTextAreaElement>('[data-testid="extract-lyrics"]')!.value).toBe(DRAFT.lyrics);
    expect(q<HTMLTextAreaElement>('[data-testid="extract-style"]')!.value).toBe('Slow Spanish ballad');
    expect(q<HTMLInputElement>('[data-testid="extract-bpm"]')!.value).toBe('71');
    expect(q<HTMLInputElement>('[data-testid="extract-key"]')!.value).toBe('F# major');
    expect(q('[data-testid="extract-bpm-alt-142"]')).not.toBeNull();
    expect(q('[data-testid="extract-picture"]')).toBeNull();
    expect(track()).toMatchObject({ prompt: 'old style', lyrics: 'old lyrics', vocal_language: 'en' }); // untouched
    await click('[data-testid="extract-apply"]');
    expect(track()).toMatchObject({ prompt: 'Slow Spanish ballad', lyrics: DRAFT.lyrics, vocal_language: 'es', bpm: 71, keyscale: 'F# major' });
    expect(close).toHaveBeenCalledWith(true);
  });

  it('what the user edits in the proposal is what is applied, and the tempo can be switched to its double', async () => {
    await open();
    await click('[data-testid="extract-start"]');
    await click('[data-testid="extract-bpm-alt-142"]');
    const lyrics = q<HTMLTextAreaElement>('[data-testid="extract-lyrics"]')!;
    lyrics.value = '[Verse]\nmi letra';
    lyrics.dispatchEvent(new Event('input'));
    await settle();
    await click('[data-testid="extract-apply"]');
    expect(track()).toMatchObject({ lyrics: '[Verse]\nmi letra', bpm: 142 });
  });

  it('the tempo and the key are only written when the box is ticked', async () => {
    await open();
    await click('[data-testid="extract-start"]');
    await click('[data-testid="extract-use-measures"] input');
    await click('[data-testid="extract-apply"]');
    expect(track().bpm).toBeUndefined();
    expect(track().keyscale).toBeUndefined();
    expect(track().lyrics).toBe(DRAFT.lyrics);
  });

  it('discarding (closing) leaves the track as it was', async () => {
    await open();
    await click('[data-testid="extract-start"]');
    await click('[data-testid="extract-close"]');
    expect(track()).toMatchObject({ prompt: 'old style', lyrics: 'old lyrics' });
    expect(close).toHaveBeenCalledWith(false);
  });

  it('with HeartMuLa the tags are proposed and written, and the tempo and the key are shown but not written', async () => {
    const cfg = structuredClone(CONFIG);
    cfg.defaults.music = { generator: 'heartmula' } as never;
    await open({ config: cfg });
    expect(q('[data-testid="extract-separate"]')).toBeNull(); // only ACE-Step separates
    await click('[data-testid="extract-start"]');
    expect(api['assistSong'].mock.calls[0][0].generator).toBe('heartmula');
    expect(q<HTMLInputElement>('[data-testid="extract-tags"]')!.value).toBe('ballad,slow');
    expect(q('[data-testid="extract-measures-shown"]')).not.toBeNull();
    expect(q('[data-testid="extract-use-measures"]')).toBeNull();
    await click('[data-testid="extract-apply"]');
    expect(track()).toMatchObject({ tags: 'ballad,slow', lyrics: DRAFT.lyrics });
    expect(track().bpm).toBeUndefined();
  });

  it('a source with no words says so and offers to mark the track as instrumental, which is done only if ticked', async () => {
    await open();
    api['transcribeSource'].mockReturnValue(of({ ...HEARD, text: '' }));
    api['assistSong'].mockReturnValue(of({ ...DRAFT, lyrics: '' }));
    await click('[data-testid="extract-start"]');
    expect(q('[data-testid="extract-nowords"]')).not.toBeNull();
    expect(q('[data-testid="extract-lyrics"]')).toBeNull();
    await click('[data-testid="extract-apply"]');
    expect(track().instrumental).toBeUndefined();
    expect(track().lyrics).toBe('old lyrics'); // not erased
  });

  it('marking the no-words track as instrumental', async () => {
    await open();
    api['transcribeSource'].mockReturnValue(of({ ...HEARD, text: '' }));
    api['assistSong'].mockReturnValue(of({ ...DRAFT, lyrics: '' }));
    await click('[data-testid="extract-start"]');
    await click('[data-testid="extract-instrumental"] input');
    await click('[data-testid="extract-apply"]');
    expect(track().instrumental).toBe(true);
  });

  it('a video can have its picture described, and a video is not separated', async () => {
    await open({ pick: 'clip.mp4' });
    expect(q('[data-testid="extract-separate"]')).toBeNull();
    expect(q('[data-testid="extract-video-nosep"]')).not.toBeNull();
    await click('[data-testid="extract-describe"] input');
    await click('[data-testid="extract-start"]');
    expect(api['describe']).toHaveBeenCalledWith('songs', 'clip.mp4');
    expect(q<HTMLTextAreaElement>('[data-testid="extract-picture"]')!.value).toBe('a rainy street');
    await click('[data-testid="extract-apply"]');
    expect(JSON.stringify(track())).not.toContain('rainy'); // shown, never written into the track
  });

  it('does not offer to describe the picture with an mp3', async () => {
    await open();
    expect(q('[data-testid="extract-describe"]')).toBeNull();
  });

  it('does not offer to describe the picture of a video when the vision model cannot run', async () => {
    await open({ pick: 'clip.mp4', unavailable: ['describe_video'] });
    expect(q('[data-testid="extract-describe"]')).toBeNull();
    await click('[data-testid="extract-start"]');
    expect(api['describe']).not.toHaveBeenCalled();
    expect(q('[data-testid="extract-picture"]')).toBeNull();
  });

  it('shows the server\'s message when the lyrics cannot be read and keeps the dialog open', async () => {
    await open();
    api['transcribeSource'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { error: { code: 'conflict', message: 'run run-1 is queued or active' } } })));
    await click('[data-testid="extract-start"]');
    expect(q('[data-testid="extract-error"]')!.textContent).toContain('run run-1 is queued or active');
    expect(q('[data-testid="extract-proposal"]')).toBeNull();
    expect(close).not.toHaveBeenCalled();
  });

  it('without the assistant the style is left blank and a line says so', async () => {
    await open();
    available['assistant'] = false;
    await click('[data-testid="extract-start"]');
    expect(api['assistSong']).not.toHaveBeenCalled();
    expect(q('[data-testid="extract-noassist"]')).not.toBeNull();
    expect(q<HTMLTextAreaElement>('[data-testid="extract-lyrics"]')!.value).toBe(HEARD.text);
  });

  it('says so when there is no clear pulse or key, and leaves those fields out', async () => {
    await open();
    api['measureSource'].mockReturnValue(of({ duration: 30, bpm: null, bpm_alternatives: [], bpm_confidence: 0, keyscale: null, key_confidence: 0 }));
    await click('[data-testid="extract-start"]');
    expect(q('[data-testid="extract-nomeasure"]')).not.toBeNull();
    await click('[data-testid="extract-apply"]');
    expect(track().bpm).toBeUndefined();
    expect(track().keyscale).toBeUndefined();
  });
});
