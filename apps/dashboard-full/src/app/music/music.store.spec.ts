import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { load } from 'js-yaml';
import { Subject, of, throwError } from 'rxjs';

import { MusicManifest, MusicManifestEntry, PeaksResponse, ProjectConfig, Run } from '../core/api.models';
import { ApiService } from '../core/api.service';
import { EnvironmentStore } from '../core/environment.store';
import { RunStream, RunStreamService } from '../core/run-stream.service';
import { MusicStore, helpFor } from './music.store';
import { toMusicYaml } from './music-yaml';

const CONFIG: ProjectConfig = {
  project: 'songs',
  output: { mode: 'music', file: '', contact_sheet: false },
  defaults: {
    model: '', voice: '', resolution: '', sampler: '', steps: 0, fps: 0,
    subject_prompt: '', negative_prompt: '', lora_model_dir: '',
    music: { output_format: 'mp3', inference_steps: 8 },
  },
  scenes: [],
  tracks: [
    { id: 'ballad', prompt: 'Spanish pop ballad', lyrics: '[Verse]\nhola', seed: 0, variants: 2 },
    { id: 'idea', prompt: 'lofi beat', instrumental: true },
  ],
};

const entry = (over: Partial<MusicManifestEntry> = {}): MusicManifestEntry => ({
  track_id: 'ballad', variant: 0, effective_seed: 7, use_lm: false, caption: 'c',
  synth_model: 'dit.gguf', params: {}, file: 'out/songs/ballad_v1.mp3', ...over,
});

describe('MusicStore', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let store: MusicStore;
  let streamEnded: ReturnType<typeof signal<boolean>>;
  let envReport: ReturnType<typeof signal<unknown>>;

  const run = { id: 'run-1', project: 'songs', state: 'running' } as Run;

  beforeEach(() => {
    streamEnded = signal(false);
    envReport = signal<unknown>(null);
    api = {
      getConfig: vi.fn(() => of({ yaml: '', parsed: structuredClone(CONFIG), valid: true })),
      saveConfig: vi.fn(() => of({ saved: true })),
      launchRun: vi.fn(() => of({ run, queue_position: 0 })),
      cancelRun: vi.fn(() => of({ run })),
      getMusicManifest: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404 }))),
    };
    const stream: RunStream = {
      events: signal([]), lines: signal([]), state: signal(null),
      ended: streamEnded, close: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        MusicStore,
        { provide: ApiService, useValue: api },
        { provide: RunStreamService, useValue: { connect: vi.fn(() => stream) } },
        { provide: EnvironmentStore, useValue: { report: envReport } },
      ],
    });
    store = TestBed.inject(MusicStore);
  });

  const loaded = async () => {
    await store.load('songs');
    return store;
  };

  describe('Easy mode', () => {
    const plan = (variants: number, lmFile = '') => ({
      tier: { id: 'max', label: 'Máxima', hint: '', model: 'acestep-v15-sft-Q8_0.gguf', synth_model: 'acestep-v15-sft-Q8_0.gguf', inference_steps: 50, shift: 1 },
      lmFile,
      variants,
      seconds: 120,
      budget: null,
      fits: true,
      notes: [],
      machine: { vramMb: 16000, gpuName: 'x', gpuCount: 1, ramGb: 30, speed: 1, speedGuessed: false },
      songs: 2,
    });

    it('writes the level, the language model and the versions of every song in one edit, and Undo restores it all', async () => {
      const s = await loaded();
      s.applyAuto(plan(4, 'acestep-5Hz-lm-4B-Q6_K.gguf') as never);
      const c = s.config()!;
      expect(c.defaults.music).toMatchObject({ synth_model: 'acestep-v15-sft-Q8_0.gguf', inference_steps: 50, shift: 1, lm_model: 'acestep-5Hz-lm-4B-Q6_K.gguf', output_format: 'mp3' });
      expect(c.tracks!.map((t) => t.variants)).toEqual([4, 4]);
      expect(s.dirty()).toBe(true);
      expect(s.autoApplied()?.note.join(' ')).toContain('Máxima');
      s.undoAuto();
      expect(s.config()!.defaults.music).toEqual({ output_format: 'mp3', inference_steps: 8 });
      expect(s.config()!.tracks!.map((t) => t.variants)).toEqual([2, undefined]);
      expect(s.autoApplied()).toBeNull();
    });

    const IMG = { id: 'into', kind: 'model', name: 'Into', description: '', size_bytes: 1, installed: true, preset: { steps: 8, cfg_scale: 1, resolution: '1024x576' }, files: [{ name: 'into.safetensors', role: 'model', url: '' }] } as never;

    it('covers: auto gives the project an image model and a square size, off removes the setting', async () => {
      const s = await loaded();
      s.setCover('auto', IMG);
      const c = s.config()!;
      expect(c.defaults.music).toMatchObject({ cover: 'auto', output_format: 'mp3' });
      expect(c.defaults.model).toBe('models/into.safetensors');
      expect(c.defaults.resolution).toBe('768x768');
      s.setCover('off');
      expect(s.config()!.defaults.music?.cover).toBeUndefined();
      expect(s.config()!.defaults.model).toBe('models/into.safetensors'); // the model stays: it may serve something else
    });

    it('a plan with covers turns them on in the same edit, and Undo takes it all back', async () => {
      const s = await loaded();
      s.applyAuto({ ...plan(2), coverEntry: IMG } as never);
      expect(s.config()!.defaults.music?.cover).toBe('auto');
      expect(s.config()!.defaults.model).toBe('models/into.safetensors');
      s.undoAuto();
      expect(s.config()!.defaults.music?.cover).toBeUndefined();
      expect(s.config()!.defaults.model).toBe('');
    });

    it('one version is the default: the key is not written', async () => {
      const s = await loaded();
      s.applyAuto(plan(1) as never);
      expect(s.config()!.tracks!.every((t) => t.variants === undefined)).toBe(true);
    });
  });

  it('loads a music project and reads its tracks', async () => {
    await loaded();
    expect(store.isMusic()).toBe(true);
    expect(store.tracks().map((t) => t.id)).toEqual(['ballad', 'idea']);
    expect(store.dirty()).toBe(false);
  });

  it('recognises a project that is not a music project', async () => {
    api['getConfig'].mockReturnValue(of({ yaml: '', parsed: { ...CONFIG, output: { mode: 'video', file: 'o.mp4', contact_sheet: false } }, valid: true }));
    await loaded();
    expect(store.isMusic()).toBe(false);
  });

  it('adds a track with a free id, removes and reorders, marking the model dirty', async () => {
    await loaded();
    store.addTrack();
    expect(store.tracks().map((t) => t.id)).toEqual(['ballad', 'idea', 'pista_3']);
    expect(store.dirty()).toBe(true);
    store.moveTrack(2, 0);
    expect(store.tracks().map((t) => t.id)).toEqual(['pista_3', 'ballad', 'idea']);
    store.moveTrack(0, -1); // out of range: ignored
    store.removeTrack(1);
    expect(store.tracks().map((t) => t.id)).toEqual(['pista_3', 'idea']);
  });

  describe('undo and redo', () => {
    it('steps back and forward through edits, keeping the project dirty', async () => {
      await loaded();
      expect(store.canUndo()).toBe(false);
      store.addTrack();
      store.removeTrack(0);
      expect(store.tracks().map((t) => t.id)).toEqual(['idea', 'pista_3']);
      store.undo();
      expect(store.tracks().map((t) => t.id)).toEqual(['ballad', 'idea', 'pista_3']);
      store.undo();
      expect(store.tracks().map((t) => t.id)).toEqual(['ballad', 'idea']);
      expect(store.canUndo()).toBe(false);
      expect(store.canRedo()).toBe(true);
      expect(store.dirty()).toBe(true);
      store.redo();
      store.redo();
      expect(store.tracks().map((t) => t.id)).toEqual(['idea', 'pista_3']);
      expect(store.canRedo()).toBe(false);
    });

    it('drops what could be redone when a new edit is made', async () => {
      await loaded();
      store.addTrack();
      store.undo();
      store.removeTrack(1);
      expect(store.canRedo()).toBe(false);
    });

    it('treats a clip dragged in one go as a single step, and a later edit as another', async () => {
      await loaded();
      store.addMix();
      store.addClip(0, { track: 'ballad' });
      for (const start of [1, 2, 3, 4]) store.updateClip(0, 0, { start });
      expect(store.mixes()[0].clips[0].start).toBe(4);
      store.undo();
      expect(store.mixes()[0].clips[0].start).toBeUndefined(); // the whole drag, back to where the clip was added
      expect(store.mixes()[0].clips).toHaveLength(1);
    });

    it('starts empty after loading the project again', async () => {
      await loaded();
      store.addTrack();
      await store.load('songs');
      expect(store.canUndo()).toBe(false);
      expect(store.canRedo()).toBe(false);
    });
  });

  describe('mixes made from songs that were regenerated', () => {
    const rendered = (sha: string) => ({ id: 'final', file: 'out/songs/final.mp3', audio_seconds: 10, hash: 'h', clips: [], inputs: [{ file: 'out/songs/ballad_v1.mp3', sha256: sha }] });

    it('is outdated only when a song it read now has another hash', async () => {
      await loaded();
      store.results.set([entry({ sha256: 'new' })]);
      store.mixResults.set([rendered('old')]);
      expect(store.mixOutdated('final')).toBe(true);
      store.mixResults.set([rendered('new')]);
      expect(store.mixOutdated('final')).toBe(false);
    });

    it('is not outdated when it cannot tell: no record of inputs, no hash on the song, or never rendered', async () => {
      await loaded();
      store.results.set([entry({ sha256: 'new' })]);
      store.mixResults.set([{ ...rendered('old'), inputs: undefined }]);
      expect(store.mixOutdated('final')).toBe(false);
      store.results.set([entry()]);
      store.mixResults.set([rendered('old')]);
      expect(store.mixOutdated('final')).toBe(false);
      expect(store.mixOutdated('other')).toBe(false);
    });
  });

  describe('the master settings of a mix', () => {
    it('sets the volume and the normalisation, and leaves no key at their defaults', async () => {
      await loaded();
      store.addMix();
      store.updateMix(0, { gain: 0.7 });
      store.updateMix(0, { normalize: true });
      expect(store.mixes()[0]).toMatchObject({ gain: 0.7, normalize: true });
      store.updateMix(0, { gain: 1 });
      store.updateMix(0, { normalize: false });
      expect('gain' in store.mixes()[0]).toBe(false);
      expect('normalize' in store.mixes()[0]).toBe(false);
    });

    it('writes them to the file, before the clips', async () => {
      await loaded();
      store.addMix();
      store.addClip(0, { track: 'ballad' });
      store.updateMix(0, { gain: 0.5, normalize: true });
      const doc = load(toMusicYaml(store.config()!)) as { mixes: Record<string, unknown>[] };
      expect(doc.mixes[0]).toEqual({ id: 'mezcla_1', gain: 0.5, normalize: true, clips: [{ track: 'ballad' }] });
      expect(Object.keys(doc.mixes[0])).toEqual(['id', 'gain', 'normalize', 'clips']);
    });

    it('typing a volume in one go is one undo step', async () => {
      await loaded();
      store.addMix();
      for (const g of [0.6, 0.7, 0.8]) store.updateMix(0, { gain: g });
      store.undo();
      expect(store.mixes()[0].gain).toBeUndefined();
    });

    it('refuses a volume out of range on the mix', async () => {
      await loaded();
      store.addMix();
      store.addClip(0, { track: 'ballad' });
      store.updateMix(0, { gain: 3 });
      expect(store.mixValidation().mixes[0].gain).toContain('0 a 2');
      expect(store.mixValidation().valid).toBe(false);
    });
  });

  describe('a mix from tracks', () => {
    it('lays the songs out one after another, starting each where the last ended', async () => {
      await loaded();
      store.results.set([entry({ audio_seconds: 30.04 }), entry({ track_id: 'idea', file: 'out/songs/idea.mp3', audio_seconds: 20 })]);
      const index = store.mixFromTracks(['ballad', 'idea', 'ballad']);
      expect(index).toBe(0);
      expect(store.mixes()[0]).toEqual({
        id: 'mezcla_1',
        clips: [{ track: 'ballad' }, { track: 'idea', start: 30 }, { track: 'ballad', start: 50 }],
      });
    });

    it('puts tracks without a song yet at the end of the previous one, and is one undo step', async () => {
      await loaded();
      store.mixFromTracks(['ballad', 'idea']);
      expect(store.mixes()[0].clips).toEqual([{ track: 'ballad' }, { track: 'idea' }]);
      store.undo();
      expect(store.mixes()).toEqual([]);
    });
  });

  it('never reuses an id that is taken', async () => {
    await loaded();
    store.updateTrack(0, { id: 'pista_3' });
    store.addTrack();
    expect(store.tracks()[2].id).toBe('pista_4');
  });

  it('turns an emptied optional field into an absent key', async () => {
    await loaded();
    store.updateTrack(0, { lyrics: '', seed: undefined, bpm: 90 });
    const t = store.tracks()[0];
    expect('lyrics' in t).toBe(false);
    expect('seed' in t).toBe(false);
    expect(t.bpm).toBe(90);
  });

  it('keeps an explicit zero seed', async () => {
    await loaded();
    expect(store.tracks()[0].seed).toBe(0);
    store.updateTrack(0, { prompt: 'x' });
    expect(store.tracks()[0].seed).toBe(0);
  });

  it('blocks saving while the client rules fail, and mirrors them per track', async () => {
    await loaded();
    store.updateTrack(1, { prompt: '' });
    expect(store.validation().valid).toBe(false);
    expect(store.validation().tracks[1].prompt).toBeTruthy();
    expect(store.canSave()).toBe(false);
    store.updateTrack(1, { prompt: 'jazz' });
    expect(store.canSave()).toBe(true);
  });

  it('saves the project as YAML and clears the dirty flag', async () => {
    await loaded();
    store.updateTrack(0, { prompt: 'Rock ballad' });
    expect(await store.save()).toBe(true);
    const yaml = api['saveConfig'].mock.calls[0][1] as string;
    const doc = load(yaml) as { tracks: { id: string; prompt: string }[] };
    expect(doc.tracks[0].prompt).toBe('Rock ballad');
    expect(store.dirty()).toBe(false);
  });

  it('ties a server rejection to the track and field it names', async () => {
    await loaded();
    store.updateTrack(0, { bpm: 90 });
    api['saveConfig'].mockReturnValue(
      throwError(() => new HttpErrorResponse({
        status: 422,
        error: { error: { code: 'validation_failed', message: 'config: track "ballad": bpm must be > 0, got 0\nconfig: music synthesis model "x.gguf" not found in models/music' } },
      })),
    );
    expect(await store.save()).toBe(false);
    expect(store.dirty()).toBe(true);
    const errs = store.serverErrors();
    expect(errs[0]).toMatchObject({ trackId: 'ballad', field: 'bpm' });
    expect(errs[1].trackId).toBeNull();
  });

  describe('runs', () => {
    it('launches the whole project with the chosen options and watches the stream', async () => {
      await loaded();
      store.gpu.set('1');
      store.force.set(true);
      await store.launch();
      const [project, req, quiet] = api['launchRun'].mock.calls[0];
      expect(project).toBe('songs');
      expect(req).toEqual({ only: undefined, force: true, gpu: '1', keep_tmp: true });
      expect(quiet).toBe(true);
      expect(store.running()).toBe(true);
      expect(store.activeRun()?.id).toBe('run-1');
    });

    it('runs one track with --only', async () => {
      await loaded();
      await store.launch('idea');
      expect(api['launchRun'].mock.calls[0][1].only).toBe('idea');
      expect(store.runOnly()).toBe('idea');
    });

    it('saves unsaved edits first and does not run if the save is rejected', async () => {
      await loaded();
      store.updateTrack(0, { prompt: 'new' });
      await store.launch();
      expect(api['saveConfig']).toHaveBeenCalledTimes(1);
      expect(api['launchRun']).toHaveBeenCalledTimes(1);

      api['launchRun'].mockClear();
      store.stream.set(null);
      store.updateTrack(0, { prompt: '' }); // invalid: cannot be saved
      await store.launch();
      expect(api['launchRun']).not.toHaveBeenCalled();
    });

    it('does not start a second run while one is active', async () => {
      await loaded();
      await store.launch();
      await store.launch('idea');
      expect(api['launchRun']).toHaveBeenCalledTimes(1);
    });

    it('explains a refusal and says where to fix it', async () => {
      await loaded();
      api['launchRun'].mockReturnValue(
        throwError(() => new HttpErrorResponse({
          status: 422,
          error: { error: { code: 'validation_failed', message: 'required binary "ace-synth" not found on PATH (output mode "music")' } },
        })),
      );
      await store.launch();
      expect(store.running()).toBe(false);
      expect(store.launchHelp()).toMatchObject({ engine: true, models: false });
    });

    it('cancels the active run', async () => {
      await loaded();
      await store.launch();
      await store.cancel();
      expect(api['cancelRun']).toHaveBeenCalledWith('run-1');
    });

    it('reads the exported songs when the run ends', async () => {
      await loaded();
      const manifest: MusicManifest = { project: 'songs', mode: 'music', generated_at: 'x', tracks: [entry()] };
      api['getMusicManifest'].mockReturnValue(of(manifest));
      await store.launch();
      streamEnded.set(true);
      TestBed.tick();
      await Promise.resolve();
      expect(api['getMusicManifest']).toHaveBeenCalledWith('songs', 'songs');
    });
  });

  describe('results', () => {
    it('lists the variants of a track in order', async () => {
      await loaded();
      const m: MusicManifest = { project: 'songs', mode: 'music', generated_at: 'x', tracks: [entry({ variant: 1, file: 'b' }), entry({ variant: 0, file: 'a' }), entry({ track_id: 'idea', file: 'c' })] };
      api['getMusicManifest'].mockReturnValue(of(m));
      await store.reloadResults();
      expect(store.resultsOf('ballad').map((e) => e.file)).toEqual(['a', 'b']);
      expect(store.resultsOf('none')).toEqual([]);
    });

    it('shows exactly what the manifest says, so a track the server dropped disappears', async () => {
      await loaded();
      api['getMusicManifest'].mockReturnValue(of({ project: 'songs', mode: 'music', generated_at: 'x', tracks: [entry({ file: 'old-ballad' }), entry({ track_id: 'idea', file: 'old-idea' })] }));
      await store.reloadResults();
      api['getMusicManifest'].mockReturnValue(of({ project: 'songs', mode: 'music', generated_at: 'y', tracks: [entry({ track_id: 'idea', file: 'new-idea', effective_seed: 9 })] }));
      await store.reloadResults();
      expect(store.resultsOf('idea').map((e) => e.file)).toEqual(['new-idea']);
      expect(store.resultsOf('ballad')).toEqual([]);
    });

    it('is simply empty when nothing was exported yet', async () => {
      await loaded();
      expect(store.results()).toEqual([]);
      expect(store.resultsLoaded()).toBe(true);
    });

    it('remembers files that could not be played', async () => {
      await loaded();
      store.markMissing('out/songs/a.mp3');
      expect(store.missing().has('out/songs/a.mp3')).toBe(true);
    });

    it('pins the seed of a variant into its track and saves it', async () => {
      await loaded();
      await store.pinSeed(entry({ track_id: 'idea', variant: 1, effective_seed: 4711 }));
      expect(store.tracks()[1].seed).toBe(4711);
      expect(api['saveConfig']).toHaveBeenCalledTimes(1);
      const doc = load(api['saveConfig'].mock.calls[0][1] as string) as { tracks: { id: string; seed?: number }[] };
      expect(doc.tracks[1].seed).toBe(4711);
      expect(store.pinned()).toContain('4711');
    });
  });

  describe('favorites', () => {
    const two = [entry({ variant: 0, effective_seed: 7, file: 'a1.mp3' }), entry({ variant: 1, effective_seed: 8, file: 'a2.mp3' })];

    it('marks and unmarks a song by track and seed, leaving no key when none is left', async () => {
      await loaded();
      store.results.set(two);
      store.toggleFavorite(two[1]);
      expect(store.favorites()).toEqual([{ track: 'ballad', seed: 8 }]);
      expect(store.isFavorite(two[1])).toBe(true);
      expect(store.isFavorite(two[0])).toBe(false);
      expect(store.favoriteCount('ballad')).toBe(1);
      expect(store.dirty()).toBe(true);
      store.toggleFavorite(two[1]);
      expect(store.config()!.favorites).toBeUndefined();
    });

    it('still marks the song when the track changes how many variants it makes (same seed)', async () => {
      await loaded();
      store.results.set(two);
      store.toggleFavorite(two[1]);
      store.results.set([entry({ variant: 0, effective_seed: 8, file: 'a.mp3' })]); // kept as the only variant
      expect(store.favoriteCount('ballad')).toBe(1);
    });

    it('follows a renamed track and goes with a removed one', async () => {
      await loaded();
      store.toggleFavorite(two[0]);
      store.updateTrack(0, { id: 'balada' });
      expect(store.favorites()).toEqual([{ track: 'balada', seed: 7 }]);
      store.removeTrack(0);
      expect(store.config()!.favorites).toBeUndefined();
    });

    it('is written to the file', async () => {
      await loaded();
      store.toggleFavorite(two[0]);
      const doc = load(toMusicYaml(store.config()!)) as { favorites: unknown[] };
      expect(doc.favorites).toEqual([{ track: 'ballad', seed: 7 }]);
    });
  });

  describe('keeping one variant', () => {
    const two = [entry({ variant: 0, effective_seed: 7, file: 'out/songs/ballad_v1.mp3' }), entry({ variant: 1, effective_seed: 8, file: 'out/songs/ballad_v2.mp3' })];
    const setup = async () => {
      await loaded();
      store.results.set(two);
      store.updateTrack(0, { seed: 7, variants: 2 });
      store.addMix();
      store.addClip(0, { track: 'ballad' });
      store.addClip(0, { track: 'ballad', variant: 2, start: 5 });
      store.addClip(0, { track: 'idea', start: 8 });
    };

    it('counts the clips that played another variant', async () => {
      await setup();
      expect(store.keepVariantDrops(two[1])).toBe(1);
      expect(store.keepVariantDrops(two[0])).toBe(1);
    });

    it('gives the track the seed of the kept variant and one variant, fixes the mix clips, saves and creates it', async () => {
      await setup();
      await store.keepVariant(two[1]);
      expect(store.tracks()[0]).toMatchObject({ id: 'ballad', seed: 8 });
      expect('variants' in store.tracks()[0]).toBe(false);
      expect(store.mixes()[0].clips).toEqual([{ track: 'ballad', start: 5 }, { track: 'idea', start: 8 }]); // variant 2 became the track's only song
      expect(api['saveConfig']).toHaveBeenCalledTimes(1);
      expect(api['launchRun']).toHaveBeenCalledTimes(1);
      expect(api['launchRun'].mock.calls[0][1]).toMatchObject({ only: 'ballad' });
    });

    it('does not create the track when saving fails', async () => {
      await setup();
      api['saveConfig'].mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 400, error: { error: { message: 'config: bad' } } })));
      await store.keepVariant(two[0]);
      expect(api['launchRun']).not.toHaveBeenCalled();
    });
  });

  describe('setup issues', () => {
    it('is silent until the environment is known and when everything is installed', () => {
      expect(store.setupIssue()).toBeNull();
      envReport.set({ binaries: [{ name: 'ace-synth', present: true }], music: [{ name: 'a.gguf', size: 1 }] });
      expect(store.setupIssue()).toBeNull();
    });

    it('flags a missing engine and missing models separately', () => {
      envReport.set({ binaries: [{ name: 'ace-synth', present: false }], music: [] });
      expect(store.setupIssue()).toEqual({ engine: true, models: true });
      envReport.set({ binaries: [{ name: 'ace-synth', present: true }], music: [] });
      expect(store.setupIssue()).toEqual({ engine: false, models: true });
    });
  });
});

describe('helpFor', () => {
  it('points a missing program at the Environment page', () => {
    expect(helpFor('required binary "ace-lm" not found on PATH')).toMatchObject({ engine: true, models: false });
  });
  it('points a missing model at the Models screen', () => {
    expect(helpFor('config: music synthesis model "x.gguf" not found in models/music: install it')).toMatchObject({ engine: false, models: true });
  });
  it('offers both for a refusal it does not recognise', () => {
    expect(helpFor('something else')).toMatchObject({ engine: true, models: true });
  });
});

describe('toMusicYaml', () => {
  it('writes a music project with tracks and no scenes, pruning what is unset', () => {
    const doc = load(toMusicYaml(CONFIG)) as Record<string, unknown>;
    expect(doc['output']).toEqual({ mode: 'music' });
    expect('scenes' in doc).toBe(false);
    const tracks = doc['tracks'] as Record<string, unknown>[];
    expect(tracks[0]['seed']).toBe(0); // an explicit zero survives
    expect('instrumental' in tracks[0]).toBe(false);
    expect(tracks[1]['instrumental']).toBe(true);
    expect((doc['defaults'] as Record<string, unknown>)['music']).toEqual({ output_format: 'mp3', inference_steps: 8 });
    expect('steps' in (doc['defaults'] as object)).toBe(false); // zeroed image leftovers are not written
  });

  it('does not send the lyrics of an instrumental track', () => {
    const cfg = { ...CONFIG, tracks: [{ id: 'a', prompt: 'p', lyrics: '[Verse]\nla', instrumental: true }] };
    const [track] = (load(toMusicYaml(cfg)) as { tracks: Record<string, unknown>[] }).tracks;
    expect('lyrics' in track).toBe(false);
    expect(track['instrumental']).toBe(true);
    expect(cfg.tracks[0].lyrics).toBe('[Verse]\nla'); // still in the editable model
  });

  it('does not silently drop scenes that are still there', () => {
    const doc = load(toMusicYaml({ ...CONFIG, scenes: [{ id: 's', prompt: 'p', negative_prompt: '', tts_text: 't', speed: 1, lora: '' }] })) as Record<string, unknown>;
    expect((doc['scenes'] as unknown[]).length).toBe(1);
  });
});

describe('MusicStore sources and tasks', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let store: MusicStore;
  let envReport: ReturnType<typeof signal<unknown>>;

  beforeEach(async () => {
    envReport = signal<unknown>(null);
    api = {
      getConfig: vi.fn(() => of({ yaml: '', parsed: structuredClone(CONFIG), valid: true })),
      getMusicManifest: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404 }))),
      listSources: vi.fn(() => of({ sources: [{ name: 'base.mp3', size: 10, modified: '' }] })),
      uploadSource: vi.fn((_p: string, name: string) => of({ name })),
      copySource: vi.fn((_p: string, _from: string, name?: string) => of({ name: name ?? 'x.mp3' })),
    };
    TestBed.configureTestingModule({
      providers: [
        MusicStore,
        { provide: ApiService, useValue: api },
        { provide: RunStreamService, useValue: { connect: vi.fn() } },
        { provide: EnvironmentStore, useValue: { report: envReport } },
      ],
    });
    store = TestBed.inject(MusicStore);
    await store.load('songs');
  });

  it('reads the sources of the project when it loads', () => {
    expect(store.sources().map((s) => s.name)).toEqual(['base.mp3']);
  });

  it('a task replaces the duration and drops the fields of the previous task', () => {
    store.updateTrack(0, { duration_seconds: 60, use_lm: true });
    store.setTask(0, 'repaint');
    store.updateTrack(0, { repaint_start: 5, source: 'base.mp3' });
    store.setTask(0, 'extract');
    const t = store.tracks()[0];
    expect(t.task).toBe('extract');
    expect(t.repaint_start).toBeUndefined();
    expect(t.duration_seconds).toBeUndefined();
    expect(t.use_lm).toBeUndefined();
    expect(t.source).toBe('base.mp3');
    expect(store.dirty()).toBe(true);
  });

  it('going back to a new song removes the task and the source', () => {
    store.setTask(0, 'cover');
    store.updateTrack(0, { source: 'base.mp3', cover_strength: 0.5 });
    store.setTask(0, '');
    const t = store.tracks()[0];
    expect(t.task).toBeUndefined();
    expect(t.source).toBeUndefined();
    expect(t.cover_strength).toBeUndefined();
  });

  it('the file keeps its task fields in the YAML', () => {
    store.setTask(0, 'repaint');
    store.updateTrack(0, { source: 'base.mp3', repaint_start: 10, repaint_end: 25 });
    const doc = load(toMusicYaml(store.config()!)) as { tracks: Record<string, unknown>[] };
    expect(doc.tracks[0]).toMatchObject({ task: 'repaint', source: 'base.mp3', repaint_start: 10, repaint_end: 25 });
  });

  it('a video is stored as an mp3 under a free name', async () => {
    expect(await store.uploadSource(new File(['x'], 'base.mp4'))).toBe('base-2.mp3');
    expect(api['uploadSource']).toHaveBeenCalledWith('songs', 'base-2.mp3', expect.anything());
  });

  it('names a new source so it never replaces another', () => {
    expect(store.freeSourceName('base.mp3')).toBe('base-2.mp3');
    expect(store.freeSourceName('other song (1).mp3')).toBe('other-song--1-.mp3');
    expect(store.freeSourceName('.hidden.wav')).toBe('hidden.wav');
  });

  it('uploads a file under a free name and reloads the sources', async () => {
    const file = new File(['x'], 'base.mp3');
    expect(await store.uploadSource(file)).toBe('base-2.mp3');
    expect(api['uploadSource']).toHaveBeenCalledWith('songs', 'base-2.mp3', file);
    expect(api['listSources']).toHaveBeenCalledTimes(2);
  });

  it('copies an exported song as a source', async () => {
    expect(await store.adoptExport(entry())).toBe('ballad_v1.mp3');
    expect(api['copySource']).toHaveBeenCalledWith('songs', 'out/songs/ballad_v1.mp3', 'ballad_v1.mp3');
  });

  describe('separating a song into instruments', () => {
    beforeEach(() => store.updateTrack(0, { variants: 1 })); // one variant: the names carry no variant
    const withSft = () => envReport.set({ music: [{ name: 'acestep-v15-turbo-Q8_0.gguf', size: 1 }, { name: 'acestep-v15-sft-Q8_0.gguf', size: 1 }] });

    it('adds one extract track per ticked stem, from the same copied song, named after the song and the stem', async () => {
      withSft();
      const song = entry({ file: 'out/songs/ballad_v1.mp3' });
      expect(await store.separateSong(song, ['drums', 'vocals'])).toEqual(['ballad_vocals', 'ballad_drums']);
      expect(api['copySource']).toHaveBeenCalledTimes(1);
      expect(store.tracks().slice(2)).toEqual([
        { id: 'ballad_vocals', prompt: 'Spanish pop ballad', task: 'extract', source: 'ballad_v1.mp3', stem: 'vocals' },
        { id: 'ballad_drums', prompt: 'Spanish pop ballad', task: 'extract', source: 'ballad_v1.mp3', stem: 'drums' },
      ]);
      expect(store.dirty()).toBe(true);
    });

    it('numbers the ids that are taken', async () => {
      withSft();
      await store.separateSong(entry(), ['bass']);
      expect(await store.separateSong(entry(), ['bass'])).toEqual(['ballad_bass2']);
    });

    it('says the variant when the song is one of several of its track', async () => {
      withSft();
      store.updateTrack(0, { variants: 4 });
      expect(await store.separateSong(entry({ variant: 2 }), ['vocals'])).toEqual(['ballad_v3_vocals']);
      store.updateTrack(0, { variants: 1 });
      store.results.set([entry({ variant: 0 }), entry({ variant: 1, file: 'out/songs/ballad_v2.mp3' })]);
      expect(await store.separateSong(entry({ variant: 1 }), ['drums'])).toEqual(['ballad_v2_drums']);
    });

    it('separates a source that is already in the project, with no copy', async () => {
      withSft();
      expect(await store.separateSong({ name: 'mi cancion.mp3', size: 1, modified: '' }, ['vocals'])).toEqual(['mi_cancion_vocals']);
      expect(api['copySource']).not.toHaveBeenCalled();
      expect(store.tracks()[2]).toMatchObject({ id: 'mi_cancion_vocals', prompt: 'mi_cancion', source: 'mi cancion.mp3', stem: 'vocals' });
      expect(store.lastAdded()).toEqual({ ids: ['mi_cancion_vocals'], source: null }); // nothing was copied, so nothing to take back
    });

    it('adds nothing with no stem, with an unknown one, or when only the turbo model is installed', async () => {
      const before = store.tracks().length;
      envReport.set({ music: [{ name: 'acestep-v15-turbo-Q8_0.gguf', size: 1 }, { name: 'acestep-v15-xl-turbo-Q8_0.gguf', size: 1 }] });
      expect(store.separationModels()).toEqual([]);
      expect(await store.separateSong(entry(), ['vocals'])).toEqual([]);
      withSft();
      expect(await store.separateSong(entry(), [])).toEqual([]);
      expect(await store.separateSong(entry(), ['kazoo'])).toEqual([]);
      expect(store.tracks()).toHaveLength(before);
      expect(api['copySource']).not.toHaveBeenCalled();
    });

    it('says whether the project would run the extraction with a turbo model, and switches it to the Maximum level', () => {
      withSft();
      expect(store.synthIsTurbo()).toBe(true); // the default is the XL turbo
      expect(store.useMaximumLevel()).toBe(true);
      expect(store.settings()).toMatchObject({ synth_model: 'acestep-v15-sft-Q8_0.gguf', inference_steps: 50, shift: 1 });
      expect(store.synthIsTurbo()).toBe(false);
    });

    it('does not switch when no model but the turbo ones is installed', () => {
      envReport.set({ music: [{ name: 'acestep-v15-turbo-Q8_0.gguf', size: 1 }] });
      expect(store.useMaximumLevel()).toBe(false);
      expect(store.settings().synth_model).toBeUndefined();
    });
  });

  describe('repainting a part of a song', () => {
    beforeEach(() => store.updateTrack(0, { variants: 1 }));
    it('adds a repaint track with that range, from the style and the lyrics that were sung', async () => {
      const song = entry({ audio_seconds: 120, lyrics_sung: '[Chorus]\ncantada', file: 'out/songs/ballad_v1.mp3' });
      expect(await store.repaintSong(song, { start: 40, end: 65 })).toBe('ballad_repintado');
      expect(api['copySource']).toHaveBeenCalledWith('songs', 'out/songs/ballad_v1.mp3', 'ballad_v1.mp3');
      expect(store.tracks()[2]).toEqual({
        id: 'ballad_repintado',
        prompt: 'Spanish pop ballad',
        task: 'repaint',
        source: 'ballad_v1.mp3',
        repaint_start: 40,
        repaint_end: 65,
        lyrics: '[Chorus]\ncantada',
      });
      expect(store.dirty()).toBe(true);
      expect(store.lastAdded()).toEqual({ ids: ['ballad_repintado'], source: 'ballad_v1.mp3' });
    });

    it('says the variant of the song, numbers the id when taken, keeps an instrumental without lyrics and refuses a bad range', async () => {
      const song = entry({ track_id: 'idea', variant: 2, file: 'out/songs/idea.mp3', instrumental: true, lyrics_sung: '[Instrumental]' });
      store.results.set([song]);
      expect(await store.repaintSong(song, { start: 1, end: 5 })).toBe('idea_repintado'); // idea has one variant
      expect(await store.repaintSong(song, { start: 5, end: 9 })).toBe('idea_repintado2');
      const [a] = store.tracks().slice(-2);
      expect(a).toMatchObject({ instrumental: true, repaint_start: 1, repaint_end: 5 });
      expect('lyrics' in a).toBe(false);
      store.updateTrack(0, { variants: 4 });
      store.results.set([entry({ variant: 0 }), entry({ variant: 2, file: 'out/songs/ballad_v3.mp3' })]);
      expect(await store.repaintSong(entry({ variant: 2, file: 'out/songs/ballad_v3.mp3' }), { start: 1, end: 5 })).toBe('ballad_v3_repintado');
      const before = store.tracks().length;
      for (const range of [{ start: 5, end: 5 }, { start: 9, end: 2 }, { start: -1, end: 4 }, { start: 3, end: 3.05 }]) {
        expect(await store.repaintSong(song, range)).toBeNull();
      }
      expect(store.tracks()).toHaveLength(before);
    });

    it('adds nothing when the song cannot be copied to the sources', async () => {
      api['copySource'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404, error: { error: { code: 'not_found', message: 'gone' } } })));
      const before = store.tracks().length;
      expect(await store.repaintSong(entry(), { start: 1, end: 9 })).toBeNull();
      expect(store.tracks()).toHaveLength(before);
      expect(store.sourceError()).toContain('gone');
    });
  });

  describe('lengthening a song', () => {
    it('adds a repaint track past the end of the song, from its style and the lyrics that were sung', async () => {
      const song = entry({ audio_seconds: 30, lyrics_sung: '[Verse]\ncantada', file: 'out/songs/ballad_v1.mp3' });
      expect(await store.extendSong(song, 30)).toBe(2);
      expect(api['copySource']).toHaveBeenCalledWith('songs', 'out/songs/ballad_v1.mp3', 'ballad_v1.mp3');
      expect(store.tracks()[2]).toEqual({
        id: 'ballad_larga',
        prompt: 'Spanish pop ballad',
        task: 'repaint',
        source: 'ballad_v1.mp3',
        repaint_start: 26,
        repaint_end: 60,
        lyrics: '[Verse]\ncantada',
      });
      expect(store.dirty()).toBe(true);
    });

    it('takes a free id, keeps an instrumental without lyrics and does nothing for a bad length', async () => {
      const song = entry({ track_id: 'idea', audio_seconds: 12.34, file: 'out/songs/idea.mp3', instrumental: true, lyrics_sung: '[Instrumental]' });
      await store.extendSong(song, 10);
      await store.extendSong(song, 10);
      const [a, b] = store.tracks().slice(-2);
      expect([a.id, b.id]).toEqual(['idea_larga', 'idea_larga2']);
      expect(a).toMatchObject({ instrumental: true, repaint_start: 8.3, repaint_end: 22.3 });
      expect('lyrics' in a).toBe(false);
      const before = store.tracks().length;
      expect(await store.extendSong(song, 1)).toBe(-1);
      expect(await store.extendSong(song, 500)).toBe(-1);
      expect(await store.extendSong(entry({ audio_seconds: undefined, duration_seconds: undefined }), 30)).toBe(-1);
      expect(store.tracks()).toHaveLength(before);
    });

    it('adds nothing when the song cannot be copied to the sources', async () => {
      api['copySource'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404, error: { error: { code: 'not_found', message: 'gone' } } })));
      const before = store.tracks().length;
      expect(await store.extendSong(entry({ audio_seconds: 30 }), 30)).toBe(-1);
      expect(store.tracks()).toHaveLength(before);
      expect(store.sourceError()).toContain('gone');
    });
  });

  it('keeps the server reason when a source cannot be stored', async () => {
    api['uploadSource'].mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 413, error: { error: { code: 'invalid', message: 'the file is larger than 256 MB' } } })),
    );
    expect(await store.uploadSource(new File(['x'], 'big.wav'))).toBeNull();
    expect(store.sourceError()).toBe('the file is larger than 256 MB');
  });
});

describe('MusicStore waveforms', () => {
  let api: { getPeaks: ReturnType<typeof vi.fn> };
  let store: MusicStore;
  const calls: { file: string; buckets: number | undefined; reply: Subject<PeaksResponse> }[] = [];
  const peaks = (duration: number): PeaksResponse => ({ duration, buckets: 2, peaks: [0.5, 1], active: null });
  const flush = () => new Promise((r) => setTimeout(r));

  beforeEach(() => {
    calls.length = 0;
    api = {
      getPeaks: vi.fn((_id: string, file: string, buckets?: number) => {
        const reply = new Subject<PeaksResponse>();
        calls.push({ file, buckets, reply });
        return reply;
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        MusicStore,
        { provide: ApiService, useValue: { ...api, getConfig: vi.fn(() => of({ yaml: '', parsed: structuredClone(CONFIG), valid: true })), getMusicManifest: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404 }))) } },
        { provide: RunStreamService, useValue: { connect: vi.fn() } },
        { provide: EnvironmentStore, useValue: { report: signal(null) } },
      ],
    });
    store = TestBed.inject(MusicStore);
    store.projectId.set('songs');
  });

  it('asks for the peaks of a song once, with the buckets of a list row', async () => {
    store.loadWave('out/songs/a.mp3', 'h1');
    store.loadWave('out/songs/a.mp3', 'h1');
    expect(calls).toHaveLength(1);
    expect(calls[0].buckets).toBe(600);
    expect(store.wave('out/songs/a.mp3', 'h1')).toBeUndefined();
    calls[0].reply.next(peaks(30));
    calls[0].reply.complete();
    await flush();
    expect(store.wave('out/songs/a.mp3', 'h1')?.duration).toBe(30);
  });

  it('keeps the drawings of the range picker apart from those of the list', () => {
    store.loadWave('sources/a.mp3', undefined, 600);
    store.loadWave('sources/a.mp3', undefined, 1200);
    expect(calls.map((c) => c.buckets)).toEqual([600, 1200]);
  });

  it('asks again for a song that was regenerated, because its hash changed', () => {
    store.loadWave('out/songs/a.mp3', 'h1');
    store.loadWave('out/songs/a.mp3', 'h2');
    expect(calls).toHaveLength(2);
  });

  it('has four requests at a time and starts the next as one ends', async () => {
    for (let i = 0; i < 6; i++) store.loadWave(`out/songs/s${i}.mp3`, 'h');
    expect(calls).toHaveLength(4);
    calls[0].reply.next(peaks(10));
    calls[0].reply.complete();
    await flush();
    expect(calls).toHaveLength(5);
    calls[1].reply.error(new HttpErrorResponse({ status: 500 }));
    await flush();
    expect(calls).toHaveLength(6);
  });

  it('remembers a failure, and asks again only when told to', async () => {
    store.loadWave('out/songs/a.mp3', 'h1');
    calls[0].reply.error(new HttpErrorResponse({ status: 404 }));
    await flush();
    expect(store.wave('out/songs/a.mp3', 'h1')).toBeNull();
    store.loadWave('out/songs/a.mp3', 'h1');
    expect(calls).toHaveLength(1);
    store.retryWave('out/songs/a.mp3', 'h1');
    expect(store.wave('out/songs/a.mp3', 'h1')).toBeUndefined();
    store.loadWave('out/songs/a.mp3', 'h1');
    expect(calls).toHaveLength(2);
  });

  it('forgets the waveforms of another project and ignores late answers', async () => {
    store.loadWave('out/songs/a.mp3', 'h1');
    await store.load('other');
    calls[0].reply.next(peaks(30));
    await flush();
    expect(store.wave('out/songs/a.mp3', 'h1')).toBeUndefined();
  });
});

describe('MusicStore creating and taking back tracks', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let store: MusicStore;
  let streams: { events: ReturnType<typeof signal<never[]>>; lines: ReturnType<typeof signal<string[]>>; state: ReturnType<typeof signal<{ id: string; state: string } | null>>; ended: ReturnType<typeof signal<boolean>>; close: ReturnType<typeof vi.fn> }[];
  const flush = async () => {
    TestBed.tick();
    await new Promise((r) => setTimeout(r));
    TestBed.tick();
  };
  /** Ends the n-th run of the queue with a final state. */
  const finish = async (n: number, state: string) => {
    streams[n].state.set({ id: `run-${n}`, state });
    streams[n].ended.set(true);
    await flush();
  };
  const launches = () => api['launchRun'].mock.calls.map((c) => (c[1] as { only?: string }).only);

  beforeEach(async () => {
    streams = [];
    api = {
      getConfig: vi.fn(() => of({ yaml: '', parsed: structuredClone(CONFIG), valid: true })),
      saveConfig: vi.fn(() => of({ saved: true })),
      getMusicManifest: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404 }))),
      listSources: vi.fn(() => of({ sources: [] })),
      copySource: vi.fn((_p: string, _f: string, name?: string) => of({ name: name ?? 'x.mp3' })),
      deleteSong: vi.fn(() => of(undefined)),
      deleteSource: vi.fn(() => of(undefined)),
      launchRun: vi.fn((_p: string, req: { only?: string }) => of({ run: { id: `run-${api['launchRun'].mock.calls.length - 1}`, project: 'songs', state: 'running', only: req.only }, queue_position: 0 })),
    };
    TestBed.configureTestingModule({
      providers: [
        MusicStore,
        { provide: ApiService, useValue: api },
        {
          provide: RunStreamService,
          useValue: {
            connect: vi.fn(() => {
              const s = { events: signal([] as never[]), lines: signal<string[]>([]), state: signal<{ id: string; state: string } | null>(null), ended: signal(false), close: vi.fn() };
              streams.push(s);
              return s;
            }),
          },
        },
        { provide: EnvironmentStore, useValue: { report: signal({ music: [{ name: 'acestep-v15-sft-Q8_0.gguf', size: 1 }] }) } },
      ],
    });
    store = TestBed.inject(MusicStore);
    await store.load('songs');
  });

  describe('createTracks', () => {
    it('creates the tracks one after another, each alone, saving the project first', async () => {
      store.updateTrack(0, { prompt: 'changed' });
      const done = store.createTracks(['a', 'b', 'c']);
      await flush();
      expect(api['saveConfig']).toHaveBeenCalledTimes(1);
      expect(launches()).toEqual(['a']);
      expect(store.queue()).toEqual({ done: 0, total: 3 });
      await finish(0, 'succeeded');
      expect(launches()).toEqual(['a', 'b']);
      expect(store.queue()).toEqual({ done: 1, total: 3 });
      await finish(1, 'succeeded');
      await finish(2, 'succeeded');
      await done;
      expect(launches()).toEqual(['a', 'b', 'c']);
      expect(api['saveConfig']).toHaveBeenCalledTimes(1);
      expect(store.queue()).toBeNull();
    });

    it('stops at a run that fails and leaves the rest alone', async () => {
      const done = store.createTracks(['a', 'b', 'c']);
      await flush();
      await finish(0, 'succeeded');
      await finish(1, 'failed');
      await done;
      expect(launches()).toEqual(['a', 'b']);
      expect(store.queue()).toBeNull();
    });

    it('stops when a run is cancelled', async () => {
      const done = store.createTracks(['a', 'b']);
      await flush();
      await finish(0, 'cancelled');
      await done;
      expect(launches()).toEqual(['a']);
    });

    it('stops when the server refuses to launch, and says why', async () => {
      api['launchRun'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { error: { code: 'invalid', message: 'extract does not work with the turbo model' } } })));
      await store.createTracks(['a', 'b']);
      expect(api['launchRun']).toHaveBeenCalledTimes(1);
      expect(store.launchHelp()?.message).toContain('turbo model');
      expect(store.queue()).toBeNull();
    });

    it('does nothing for no tracks, or while a run is going or a queue is running', async () => {
      await store.createTracks([]);
      expect(api['launchRun']).not.toHaveBeenCalled();
      const first = store.createTracks(['a']);
      await flush();
      await store.createTracks(['b']);
      expect(launches()).toEqual(['a']);
      await finish(0, 'succeeded');
      await first;
    });
  });

  describe('taking back what an action added', () => {
    const added = async () => {
      store.updateTrack(0, { variants: 1 });
      const ids = await store.separateSong(entry({ file: 'out/songs/ballad.mp3' }), ['vocals', 'drums']);
      store.results.set([
        entry({ file: 'out/songs/ballad.mp3' }),
        entry({ track_id: ids[0], file: 'out/songs/ballad_vocals.mp3' }),
        entry({ track_id: ids[1], file: 'out/songs/ballad_drums.mp3' }),
      ]);
      return ids;
    };

    it('removes the tracks, their songs and the copied source, saves, and leaves the original alone', async () => {
      const ids = await added();
      api['listSources'].mockReturnValue(of({ sources: [] }));
      expect(await store.removeAdded()).toBe(true);
      expect(store.tracks().map((t) => t.id)).toEqual(['ballad', 'idea']);
      expect(api['deleteSong']).toHaveBeenCalledTimes(2);
      expect(api['deleteSong']).toHaveBeenCalledWith('songs', ids[0], 0);
      expect(api['deleteSource']).toHaveBeenCalledWith('songs', 'ballad.mp3');
      expect(api['saveConfig']).toHaveBeenCalled();
      expect(api['saveConfig'].mock.invocationCallOrder[0]).toBeLessThan(api['deleteSource'].mock.invocationCallOrder[0]); // the server refuses a source the saved project still uses
      expect(store.lastAdded()).toBeNull();
    });

    it('keeps the copied source when another track uses it', async () => {
      await added();
      store.updateTrack(1, { source: 'ballad.mp3' });
      store.lastAdded.set({ ids: ['ballad_vocals', 'ballad_drums'], source: 'ballad.mp3' }); // updateTrack ended the offer; the point here is the source check
      await store.removeAdded();
      expect(api['deleteSource']).not.toHaveBeenCalled();
    });

    it('does not offer it after another edit of the list, or after reloading', async () => {
      await added();
      expect(store.lastAdded()).not.toBeNull();
      store.addTrack();
      expect(store.lastAdded()).toBeNull();
      await added();
      await store.load('songs');
      expect(store.lastAdded()).toBeNull();
      expect(await store.removeAdded()).toBe(false);
    });

    it('refuses while a run is going', async () => {
      await added();
      void store.createTracks(['x']);
      await flush();
      expect(await store.removeAdded()).toBe(false);
      expect(api['deleteSong']).not.toHaveBeenCalled();
    });
  });
});
