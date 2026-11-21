import { TestBed } from '@angular/core/testing';
import { Observable, Subscriber, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MeasureResult, SongAssistResponse, SourceInfo, TranscribeResult } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { RoutingStore } from '../../core/routing.store';
import { AssistModelStore } from '../../editor/assist-model/assist-model.store';
import { MusicStore } from '../music.store';
import { ExtractOptions, SongExtractStore } from './song-extract.store';

const SONG: SourceInfo = { name: 'balada.mp3', kind: 'audio', size: 1, modified: 'x' };
const VIDEO: SourceInfo = { name: 'clip.mp4', kind: 'video', size: 1, modified: 'x' };

const MEASURE: MeasureResult = { duration: 30, bpm: 71.2, bpm_alternatives: [35.6, 142.4], bpm_confidence: 0.41, keyscale: 'F# major', key_confidence: 0.3 };
const HEARD: TranscribeResult = { language: 'es', language_detected: true, text: 'Camino por la calle\nbajo la lluvia', segments: [], dropped: 0, model: 'ggml.bin' };
const DRAFT: SongAssistResponse = { text: 'raw', caption: 'Slow Spanish ballad', lyrics: '[verse]\nCamino por la calle\nbajo la lluvia', tags: 'ballad,slow', unchanged_words: true };

describe('SongExtractStore', () => {
  let store: SongExtractStore;
  const api = {
    measureSource: vi.fn(),
    transcribeSource: vi.fn(),
    describe: vi.fn(),
    assistSong: vi.fn(),
    recognizeSource: vi.fn(),
  };
  const music = {
    projectId: () => 'songs',
    loadSources: vi.fn(),
    separationModels: vi.fn(),
    synthIsTurbo: vi.fn(),
    useMaximumLevel: vi.fn(),
    separateSong: vi.fn(),
    createTracks: vi.fn(),
    resultsOf: vi.fn(),
    adoptExport: vi.fn(),
    cancel: vi.fn(),
    sourceError: () => null,
  };

  const opts = (over: Partial<ExtractOptions> = {}): ExtractOptions => ({
    source: SONG,
    separateVoice: false,
    describePicture: false,
    hint: '',
    method: 'whisper',
    language: '',
    generator: 'ace-step',
    assistantAvailable: true,
    switchToMaximum: false,
    ...over,
  });

  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset());
    Object.values(music).forEach((f) => typeof f === 'function' && 'mockReset' in f && (f as ReturnType<typeof vi.fn>).mockReset());
    api.measureSource.mockReturnValue(of(MEASURE));
    api.transcribeSource.mockReturnValue(of(HEARD));
    api.assistSong.mockReturnValue(of(DRAFT));
    music.loadSources.mockResolvedValue(undefined);
    music.separationModels.mockReturnValue(['acestep-v15-sft-Q8_0.gguf']);
    music.synthIsTurbo.mockReturnValue(false);
    music.createTracks.mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        SongExtractStore,
        { provide: ApiService, useValue: api },
        { provide: MusicStore, useValue: music },
        { provide: AssistModelStore, useValue: { selected: () => '' } },
        { provide: RoutingStore, useValue: { external: () => false } },
      ],
    });
    store = TestBed.inject(SongExtractStore);
  });

  it('reads an mp3: measures it, reads its lyrics and lets the assistant order them', async () => {
    await store.run(opts({ hint: 'una balada' }));
    expect(api.measureSource).toHaveBeenCalledWith('songs', 'balada.mp3');
    expect(api.transcribeSource).toHaveBeenCalledWith('songs', 'balada.mp3', undefined);
    expect(api.describe).not.toHaveBeenCalled();
    expect(api.assistSong).toHaveBeenCalledWith({ text: HEARD.text, generator: 'ace-step', language: 'es', hint: 'una balada', bpm: 71.2, keyscale: 'F# major' });
    expect(store.failure()).toBeNull();
    expect(store.proposal()).toMatchObject({
      source: 'balada.mp3',
      language: 'es',
      languageDetected: true,
      lyrics: DRAFT.lyrics,
      caption: 'Slow Spanish ballad',
      tags: 'ballad,slow',
      bpm: 71.2,
      bpmAlternatives: [35.6, 142.4],
      keyscale: 'F# major',
      picture: '',
      noWords: false,
      wordsKept: false,
      withoutAssistant: false,
    });
    expect(store.busy()).toBe(false);
  });

  it('passes the language when the user gave it', async () => {
    await store.run(opts({ language: 'en' }));
    expect(api.transcribeSource).toHaveBeenCalledWith('songs', 'balada.mp3', 'en');
  });

  it('describes the picture of a video only when asked, and keeps it for the proposal', async () => {
    api.describe.mockReturnValue(of({ prompt: 'a rainy street at night', model: 'gemma4:26b', kind: 'video', frames: 6 }));
    await store.run(opts({ source: VIDEO, describePicture: true }));
    expect(api.describe).toHaveBeenCalledWith('songs', 'clip.mp4');
    expect(api.assistSong.mock.calls[0][0].picture).toBe('a rainy street at night');
    expect(store.proposal()?.picture).toBe('a rainy street at night');
    api.describe.mockClear();
    await store.run(opts({ source: VIDEO, describePicture: false }));
    expect(api.describe).not.toHaveBeenCalled();
  });

  it('a picture that cannot be described is a note and the rest is kept', async () => {
    api.describe.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 422, error: { error: { code: 'describe_minor', message: 'a person looks under 18; the file was deleted' } } })));
    await store.run(opts({ source: VIDEO, describePicture: true }));
    expect(store.proposal()?.lyrics).toBe(DRAFT.lyrics);
    expect(store.proposal()?.notes[0]).toContain('a person looks under 18');
    expect(music.loadSources).toHaveBeenCalled(); // the server may have deleted the video
  });

  it('with Whisper alone LAION-CLAP is not asked', async () => {
    await store.run(opts());
    expect(api.recognizeSource).not.toHaveBeenCalled();
    expect(store.proposal()?.heard).toEqual([]);
  });

  it('with LAION-CLAP the tags it heard go to the assistant as a hint, after the user\'s own', async () => {
    api.recognizeSource.mockReturnValue(of({ method: 'clap', genre: [], mood: [], instrument: [], tags: ['techno', 'synth', 'drums'] }));
    await store.run(opts({ method: 'clap', hint: 'una canción de baile' }));
    expect(api.recognizeSource).toHaveBeenCalledWith('songs', 'balada.mp3', 'clap');
    const hint: string = api.assistSong.mock.calls[0][0].hint;
    expect(hint.startsWith('una canción de baile ')).toBe(true);
    expect(hint).toContain('techno, synth, drums');
    expect(store.proposal()?.heard).toEqual(['techno', 'synth', 'drums']);
  });

  it('the hint never goes over the 500 characters the assistant takes', async () => {
    api.recognizeSource.mockReturnValue(of({ method: 'clap', genre: [], mood: [], instrument: [], tags: ['techno', 'synth'] }));
    await store.run(opts({ method: 'clap', hint: 'x'.repeat(500) }));
    const hint: string = api.assistSong.mock.calls[0][0].hint;
    expect(hint.length).toBeLessThanOrEqual(500);
    expect(hint).toContain('techno, synth');
  });

  it('a CLAP that does not answer is a note and the lyrics are still read', async () => {
    api.recognizeSource.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503, error: { error: { code: 'unavailable', message: 'the CLAP service is not running' } } })));
    await store.run(opts({ method: 'clap' }));
    expect(store.proposal()?.notes[0]).toContain('the CLAP service is not running');
    expect(store.proposal()?.heard).toEqual([]);
    expect(api.assistSong.mock.calls[0][0].hint).toBeUndefined();
  });

  it('a measure that fails is a note and the lyrics are still read', async () => {
    api.measureSource.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503, error: { error: { code: 'unavailable', message: 'ffmpeg is not installed' } } })));
    await store.run(opts());
    expect(store.proposal()?.bpm).toBeNull();
    expect(store.proposal()?.notes[0]).toContain('ffmpeg is not installed');
    expect(api.assistSong.mock.calls[0][0].bpm).toBeUndefined();
  });

  it('a failure of the lyrics stops the reading and shows the server\'s message', async () => {
    api.transcribeSource.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503, error: { error: { code: 'unavailable', message: 'the lyrics reader is not installed' } } })));
    await store.run(opts());
    expect(store.proposal()).toBeNull();
    expect(store.failure()).toBe('the lyrics reader is not installed');
    expect(api.assistSong).not.toHaveBeenCalled();
  });

  it('without the assistant the proposal is the transcription as it is', async () => {
    await store.run(opts({ assistantAvailable: false }));
    expect(api.assistSong).not.toHaveBeenCalled();
    expect(store.proposal()).toMatchObject({ lyrics: HEARD.text, caption: '', tags: '', withoutAssistant: true, bpm: 71.2 });
  });

  it('an assistant that fails is a note and keeps the transcription', async () => {
    api.assistSong.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { error: { code: 'conflict', message: 'a run is active' } } })));
    await store.run(opts());
    expect(store.proposal()).toMatchObject({ lyrics: HEARD.text, withoutAssistant: true });
    expect(store.proposal()?.notes[0]).toContain('a run is active');
  });

  it('a source with no words is reported as such', async () => {
    api.transcribeSource.mockReturnValue(of({ ...HEARD, text: '', language: 'en' }));
    api.assistSong.mockReturnValue(of({ ...DRAFT, lyrics: '' }));
    await store.run(opts());
    expect(store.proposal()).toMatchObject({ noWords: true, lyrics: '' });
    expect(api.assistSong.mock.calls[0][0].text).toBe('');
  });

  it('says when the assistant changed the words and the transcription was kept', async () => {
    api.assistSong.mockReturnValue(of({ ...DRAFT, lyrics: '[verse]\n' + HEARD.text, unchanged_words: false }));
    await store.run(opts());
    expect(store.proposal()?.wordsKept).toBe(true);
  });

  it('separates the voice first, reads the lyrics from it and measures the whole song', async () => {
    music.separateSong.mockResolvedValue(['balada_vocals']);
    music.resultsOf.mockReturnValue([{ track_id: 'balada_vocals', file: 'out/songs/balada_vocals.mp3' }]);
    music.adoptExport.mockResolvedValue('balada_vocals.mp3');
    await store.run(opts({ separateVoice: true, switchToMaximum: true }));
    expect(music.separateSong).toHaveBeenCalledWith(SONG, ['vocals']);
    expect(music.createTracks).toHaveBeenCalledWith(['balada_vocals']);
    expect(api.measureSource).toHaveBeenCalledWith('songs', 'balada.mp3');
    expect(api.transcribeSource).toHaveBeenCalledWith('songs', 'balada_vocals.mp3', undefined);
    expect(store.proposal()?.source).toBe('balada.mp3');
  });

  it('switches the project to the Maximum level only when asked and its model is a turbo one', async () => {
    music.separateSong.mockResolvedValue(['b_vocals']);
    music.resultsOf.mockReturnValue([{ track_id: 'b_vocals', file: 'f.mp3' }]);
    music.adoptExport.mockResolvedValue('v.mp3');
    music.synthIsTurbo.mockReturnValue(true);
    await store.run(opts({ separateVoice: true, switchToMaximum: false }));
    expect(music.useMaximumLevel).not.toHaveBeenCalled();
    await store.run(opts({ separateVoice: true, switchToMaximum: true }));
    expect(music.useMaximumLevel).toHaveBeenCalledTimes(1);
  });

  it('a separation that did not finish stops the reading and says so', async () => {
    music.separateSong.mockResolvedValue(['b_vocals']);
    music.resultsOf.mockReturnValue([]);
    await store.run(opts({ separateVoice: true }));
    expect(store.failure()).toContain('no terminó');
    expect(api.transcribeSource).not.toHaveBeenCalled();
  });

  it('without a synthesis model other than the turbo, separating is refused before adding anything', async () => {
    music.separationModels.mockReturnValue([]);
    await store.run(opts({ separateVoice: true }));
    expect(music.separateSong).not.toHaveBeenCalled();
    expect(store.failure()).toContain('no sea el turbo');
  });

  it('cancelling aborts the request and shows neither a proposal nor an error', async () => {
    let sub!: Subscriber<TranscribeResult>;
    api.transcribeSource.mockReturnValue(new Observable<TranscribeResult>((s) => { sub = s; }));
    const running = store.run(opts());
    await Promise.resolve();
    await Promise.resolve();
    expect(store.step()).toBe('reading');
    store.cancel();
    await running;
    expect(sub.closed).toBe(true);
    expect(store.proposal()).toBeNull();
    expect(store.failure()).toBeNull();
    expect(store.busy()).toBe(false);
    expect(api.assistSong).not.toHaveBeenCalled();
  });

  it('allows one reading at a time', async () => {
    api.transcribeSource.mockReturnValue(new Observable<TranscribeResult>(() => undefined));
    void store.run(opts());
    await Promise.resolve();
    api.measureSource.mockClear();
    await store.run(opts());
    expect(api.measureSource).not.toHaveBeenCalled();
    store.cancel();
  });
});
