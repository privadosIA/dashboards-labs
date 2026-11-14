import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { load } from 'js-yaml';
import { of, throwError } from 'rxjs';
import { signal } from '@angular/core';

import { Mix, MixClip, ProjectConfig, Track } from '../core/api.models';
import { ApiService } from '../core/api.service';
import { EnvironmentStore } from '../core/environment.store';
import { RunStreamService } from '../core/run-stream.service';
import { MusicStore } from './music.store';
import { serverMixErrors, serverTrackErrors, validateMixes } from './music-validators';
import { toMusicYaml } from './music-yaml';

const TRACKS: Track[] = [
  { id: 'base', prompt: 'calm' },
  { id: 'voz', prompt: 'choir', variants: 2 },
];
const mix = (clips: MixClip[], id = 'final'): Mix => ({ id, clips });

describe('validateMixes', () => {
  it('accepts layers and sequences', () => {
    const v = validateMixes(
      [mix([{ track: 'base' }, { track: 'voz', variant: 2, start: 10, gain: 0.8, fade_in: 1, trim_start: 1.7, trim_end: 24 }, { file: 'efecto.mp3', start: 5 }])],
      TRACKS,
    );
    expect(v.valid).toBe(true);
    expect(v.mixes[0].clipErrors).toEqual([{}, {}, {}]);
  });

  it('flags the id: invalid, duplicate or a track id', () => {
    const v = validateMixes([mix([{ track: 'base' }], '../x'), mix([{ track: 'base' }], 'm'), mix([{ track: 'base' }], 'm'), mix([{ track: 'base' }], 'voz')], TRACKS);
    expect(v.mixes.map((m) => !!m.id)).toEqual([true, false, true, true]);
    expect(v.valid).toBe(false);
  });

  it('needs at least one clip', () => {
    const v = validateMixes([mix([])], TRACKS);
    expect(v.mixes[0].clips).toBeTruthy();
    expect(v.valid).toBe(false);
  });

  it('checks the source of each clip', () => {
    const v = validateMixes([mix([{}, { track: 'base', file: 'a.mp3' }, { track: 'nope' }, { track: 'voz', variant: 3 }, { file: '../a.mp3' }, { file: 'a.ogg' }])], TRACKS);
    const e = v.mixes[0].clipErrors;
    expect(e.every((c) => !!c.source)).toBe(true);
    expect(e[2].source).toContain('nope');
    expect(e[3].source).toContain('3');
  });

  it('checks the numbers of a clip', () => {
    const v = validateMixes(
      [mix([{ track: 'base', start: -1 }, { track: 'base', gain: 2.5 }, { track: 'base', gain: -0.1 }, { track: 'base', fade_in: -1 }, { track: 'base', trim_start: -1 }, { track: 'base', trim_start: 5, trim_end: 5 }])],
      TRACKS,
    );
    const e = v.mixes[0].clipErrors;
    expect(e[0].start).toBeTruthy();
    expect(e[1].gain).toBeTruthy();
    expect(e[2].gain).toBeTruthy();
    expect(e[3].fades).toBeTruthy();
    expect(e[4].trim).toBeTruthy();
    expect(e[5].trim).toBeTruthy();
  });
});

describe('serverMixErrors and serverTrackErrors', () => {
  const message = 'config: mix "final" clip 2: track "nope" is not a track of this project\nconfig: track "base" has an empty prompt';
  it('ties a line to its mix and clip', () => {
    expect(serverMixErrors(message)).toEqual([
      { mixId: 'final', clip: 2, text: 'mix "final" clip 2: track "nope" is not a track of this project' },
    ]);
  });
  it('keeps mix lines out of the track errors', () => {
    const t = serverTrackErrors(message);
    expect(t).toHaveLength(1);
    expect(t[0].trackId).toBe('base');
  });
});

describe('toMusicYaml with mixes', () => {
  const cfg = (mixes?: Mix[]): ProjectConfig => ({
    project: 'songs',
    output: { mode: 'music', file: '', contact_sheet: false },
    defaults: { model: '', voice: '', resolution: '', sampler: '', steps: 0, fps: 0, subject_prompt: '', negative_prompt: '', lora_model_dir: '' },
    scenes: [],
    tracks: TRACKS,
    mixes,
  });

  it('writes the mixes and leaves the defaults out', () => {
    const doc = load(
      toMusicYaml(cfg([mix([{ track: 'base', variant: 1, start: 0, gain: 1, mute: false, fade_in: 0, trim_start: 0 }, { file: 'v.mp3', start: 10.5, gain: 0.8, mute: true, fade_in: 1, fade_out: 2, trim_start: 1.7, trim_end: 24.4 }, { track: 'voz', variant: 2 }])])),
    ) as { mixes: { id: string; clips: Record<string, unknown>[] }[] };
    expect(doc.mixes[0].id).toBe('final');
    expect(doc.mixes[0].clips[0]).toEqual({ track: 'base' });
    expect(doc.mixes[0].clips[1]).toEqual({ file: 'v.mp3', start: 10.5, gain: 0.8, mute: true, fade_in: 1, fade_out: 2, trim_start: 1.7, trim_end: 24.4 });
    expect(doc.mixes[0].clips[2]).toEqual({ track: 'voz', variant: 2 });
  });

  it('has no mixes key when there are none', () => {
    expect('mixes' in (load(toMusicYaml(cfg())) as object)).toBe(false);
    expect('mixes' in (load(toMusicYaml(cfg([]))) as object)).toBe(false);
  });
});

describe('MusicStore mixes', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let store: MusicStore;
  const CONFIG: ProjectConfig = {
    project: 'songs',
    output: { mode: 'music', file: '', contact_sheet: false },
    defaults: { model: '', voice: '', resolution: '', sampler: '', steps: 0, fps: 0, subject_prompt: '', negative_prompt: '', lora_model_dir: '' },
    scenes: [],
    tracks: structuredClone(TRACKS),
  };
  const MANIFEST = {
    project: 'songs',
    mode: 'music',
    generated_at: '',
    tracks: [
      { track_id: 'base', variant: 0, effective_seed: 1, use_lm: false, caption: 'c', synth_model: 'm', params: {}, file: 'out/songs/base.mp3' },
      { track_id: 'voz', variant: 1, effective_seed: 2, use_lm: false, caption: 'c', synth_model: 'm', params: {}, file: 'out/songs/voz_v2.mp3' },
    ],
    mixes: [{ id: 'final', file: 'out/songs/final.mp3', audio_seconds: 30, hash: 'h', clips: [] }],
  };

  beforeEach(async () => {
    api = {
      getConfig: vi.fn(() => of({ yaml: '', parsed: structuredClone(CONFIG), valid: true })),
      saveConfig: vi.fn(() => of({ saved: true })),
      launchRun: vi.fn(() => of({ run: { id: 'run-1', project: 'songs', state: 'running' }, queue_position: 0 })),
      getMusicManifest: vi.fn(() => of(structuredClone(MANIFEST))),
      listSources: vi.fn(() => of({ sources: [] })),
      getPeaks: vi.fn((_p: string, file: string) => of({ duration: 10, buckets: 4, peaks: [0, 1, 1, 0], active: { start: 1, end: 9 }, file })),
    };
    TestBed.configureTestingModule({
      providers: [
        MusicStore,
        { provide: ApiService, useValue: api },
        { provide: RunStreamService, useValue: { connect: vi.fn(() => ({ events: signal([]), lines: signal([]), state: signal(null), ended: signal(false), close: vi.fn() })) } },
        { provide: EnvironmentStore, useValue: { report: signal(null) } },
      ],
    });
    store = TestBed.inject(MusicStore);
    await store.load('songs');
  });

  it('adds mixes with a free id and removes them, marking the project dirty', () => {
    store.addMix();
    store.addMix();
    expect(store.mixes().map((m) => m.id)).toEqual(['mezcla_1', 'mezcla_2']);
    expect(store.dirty()).toBe(true);
    store.removeMix(0);
    store.addMix();
    expect(store.mixes().map((m) => m.id)).toEqual(['mezcla_2', 'mezcla_3']); // same numbering as tracks
    store.removeMix(0);
    store.removeMix(0);
    expect(store.config()!.mixes).toBeUndefined();
  });

  it('never takes the id of a track', () => {
    store.updateTrack(0, { id: 'mezcla_1' });
    store.addMix();
    expect(store.mixes()[0].id).toBe('mezcla_2');
  });

  it('adds, edits and removes clips; undefined goes back to the default', () => {
    store.addMix();
    store.addClip(0, { track: 'base' });
    store.addClip(0, { file: 'v.mp3', start: 4 });
    store.updateClip(0, 1, { start: 6, gain: 0.5 });
    expect(store.mixes()[0].clips[1]).toEqual({ file: 'v.mp3', start: 6, gain: 0.5 });
    store.updateClip(0, 1, { gain: undefined });
    expect('gain' in store.mixes()[0].clips[1]).toBe(false);
    store.removeClip(0, 0);
    expect(store.mixes()[0].clips).toEqual([{ file: 'v.mp3', start: 6 }]);
  });

  it('blocks saving a mix that fails the rules and mirrors them', () => {
    store.addMix();
    expect(store.mixValidation().valid).toBe(false); // no clips
    expect(store.canSave()).toBe(false);
    store.addClip(0, { track: 'base' });
    expect(store.mixValidation().valid).toBe(true);
    expect(store.canSave()).toBe(true);
  });

  it('ties a server rejection to its mix', async () => {
    store.addMix();
    store.addClip(0, { track: 'base' });
    api['saveConfig'].mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 422, error: { error: { message: 'config: mix "mezcla_1" clip 1: track "base" has no variant 1' } } })),
    );
    expect(await store.save()).toBe(false);
    expect(store.serverMixIssues()).toEqual([{ mixId: 'mezcla_1', clip: 1, text: 'mix "mezcla_1" clip 1: track "base" has no variant 1' }]);
    expect(store.serverErrors()).toEqual([]);
  });

  it('saves the mixes in the YAML', async () => {
    store.addMix();
    store.addClip(0, { track: 'base' });
    store.addClip(0, { track: 'voz', variant: 2, start: 10 });
    await store.save();
    const doc = load(api['saveConfig'].mock.calls[0][1]) as { mixes: { clips: unknown[] }[] };
    expect(doc.mixes[0].clips).toEqual([{ track: 'base' }, { track: 'voz', variant: 2, start: 10 }]);
  });

  it('finds the exported file of a clip: a track variant or a source', () => {
    expect(store.clipFile({ track: 'base' })).toBe('out/songs/base.mp3');
    expect(store.clipFile({ track: 'voz', variant: 2 })).toBe('out/songs/voz_v2.mp3');
    expect(store.clipFile({ track: 'voz', variant: 1 })).toBeNull(); // no song for that variant yet
    expect(store.clipFile({ file: 'v.mp3' })).toBe('sources/v.mp3');
    expect(store.clipFile({})).toBeNull();
  });

  it('reads the rendered mixes from the manifest', () => {
    expect(store.mixResult('final')?.file).toBe('out/songs/final.mp3');
    expect(store.mixResult('otra')).toBeNull();
  });

  it('asks for the peaks of a file once, and again after the songs are read again', async () => {
    await store.peaks('sources/v.mp3');
    await store.peaks('sources/v.mp3');
    expect(api['getPeaks']).toHaveBeenCalledTimes(1);
    await store.reloadResults();
    await store.peaks('sources/v.mp3');
    expect(api['getPeaks']).toHaveBeenCalledTimes(2);
  });

  it('answers null when the peaks cannot be read', async () => {
    api['getPeaks'].mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 404 })));
    expect(await store.peaks('sources/missing.mp3')).toBeNull();
  });

  it('mixes one mix: saves first and restricts the run to its id', async () => {
    store.addMix();
    store.addClip(0, { track: 'base' });
    await store.mixNow('mezcla_1');
    expect(api['saveConfig']).toHaveBeenCalled();
    expect(api['launchRun'].mock.calls[0][1]).toMatchObject({ only: 'mezcla_1' });
  });
});
