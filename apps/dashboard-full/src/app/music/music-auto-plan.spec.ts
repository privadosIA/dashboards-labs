import { AssetEntry, CatalogEntry, ProjectConfig, Track } from '../core/api.models';
import { AutoMachine, machineOf } from '../editor/auto-plan';
import { describeMusicPlan, estimateMusicSeconds, lmSizeOf, planMusicAuto, planSettings, usesLanguageModel } from './music-auto-plan';

const files = (...names: string[]): AssetEntry[] => names.map((name) => ({ name, size: 1 }));
const ALL = files(
  'acestep-5Hz-lm-0.6B-Q8_0.gguf',
  'acestep-5Hz-lm-1.7B-Q8_0.gguf',
  'acestep-5Hz-lm-4B-Q6_K.gguf',
  'acestep-v15-turbo-Q8_0.gguf',
  'acestep-v15-xl-turbo-Q8_0.gguf',
  'acestep-v15-sft-Q8_0.gguf',
  'Qwen3-Embedding-0.6B-Q8_0.gguf',
  'vae-BF16.gguf',
);
const BIG: AutoMachine = machineOf([{ index: 0, name: 'NVIDIA GeForce RTX 5060 Ti', free_vram_mb: 15000, total_vram_mb: 16311 }], null);

const song = (id: string, over: Partial<Track> = {}): Track => ({ id, prompt: 'pop', lyrics: '[Verse]\nhola', duration_seconds: 120, ...over });
const project = (tracks: Track[], mode: 'music' | 'video' = 'music'): ProjectConfig => ({
  project: 'p',
  output: { mode, file: '', contact_sheet: false },
  defaults: { model: '', voice: '', resolution: '', sampler: '', steps: 0, fps: 0, subject_prompt: '', negative_prompt: '', lora_model_dir: '' },
  scenes: [],
  tracks,
});

describe('which songs use the language model', () => {
  it('only the ones without lyrics of their own, unless told otherwise', () => {
    expect(usesLanguageModel(song('a'))).toBe(false);
    expect(usesLanguageModel(song('a', { lyrics: '' }))).toBe(true);
    expect(usesLanguageModel(song('a', { instrumental: true }))).toBe(true);
    expect(usesLanguageModel(song('a', { use_lm: true }))).toBe(true);
    expect(usesLanguageModel(song('a', { task: 'cover' }))).toBe(false);
  });

  it('knows the size of a language model from its file', () => {
    expect(['0.6B', '1.7B', '4B'].map((s) => lmSizeOf(`acestep-5Hz-lm-${s}-Q8_0.gguf`))).toEqual(['0.6B', '1.7B', '4B']);
  });
});

describe('time', () => {
  it('uses the measurements for a two-minute song and scales the versions, the length and the card', () => {
    const one = estimateMusicSeconds([song('a')], 'normal', '1.7B', 1, 1);
    expect(one).toBeGreaterThanOrEqual(13); // 5 fixed + 8.6 synth + 1
    expect(one).toBeLessThanOrEqual(16);
    expect(estimateMusicSeconds([song('a')], 'normal', '1.7B', 4, 1)).toBeGreaterThan(one * 2);
    expect(estimateMusicSeconds([song('a', { duration_seconds: 240 })], 'normal', '1.7B', 1, 1)).toBeGreaterThan(one);
    expect(estimateMusicSeconds([song('a')], 'normal', '1.7B', 1, 2)).toBeGreaterThan(one * 1.8);
  });

  it('with several cards the songs are made at the same time: n songs take ceil(n / cards) turns', () => {
    const four = ['a', 'b', 'c', 'd'].map((id) => song(id));
    const one = estimateMusicSeconds(four, 'normal', '1.7B', 1, 1);
    const two = estimateMusicSeconds(four, 'normal', '1.7B', 1, 1, 0, 2);
    expect(two).toBeLessThan(one * 0.6); // measured on this machine: 43 s on one card, 20 s on two
    expect(two).toBeGreaterThan(one * 0.45);
    // one song cannot be split, and three songs on two cards still take two turns
    expect(estimateMusicSeconds([song('a')], 'normal', '1.7B', 1, 1, 0, 2)).toBe(estimateMusicSeconds([song('a')], 'normal', '1.7B', 1, 1));
    const three = ['a', 'b', 'c'].map((id) => song(id));
    expect(estimateMusicSeconds(three, 'normal', '1.7B', 1, 1, 0, 2)).toBeGreaterThan(estimateMusicSeconds(three, 'normal', '1.7B', 1, 1) * 0.6);
  });

  it('counts the cards that fit a song and says so in the plan', () => {
    const two = machineOf([
      { index: 0, name: 'NVIDIA GeForce RTX 4070', free_vram_mb: 11000, total_vram_mb: 12282 },
      { index: 1, name: 'NVIDIA GeForce RTX 5060 Ti', free_vram_mb: 15000, total_vram_mb: 16311 },
    ], null);
    expect(two.musicCards).toBe(2);
    const small = machineOf([{ index: 0, name: 'GTX 1650', free_vram_mb: 3900, total_vram_mb: 4096 }, { index: 1, name: 'X', free_vram_mb: 15000, total_vram_mb: 16311 }], null);
    expect(small.musicCards).toBe(1);
    const p = planMusicAuto(project([song('a'), song('b')]), ALL, two, null)!;
    expect(describeMusicPlan(p).join('|')).toContain('2 canciones a la vez');
    expect(describeMusicPlan(planMusicAuto(project([song('a')]), ALL, two, null)!).join('|')).not.toContain('a la vez');
  });

  it('a song with no lyrics costs the language model on top, bigger models more', () => {
    const lyr = estimateMusicSeconds([song('a')], 'max', '1.7B', 1, 1);
    const compose = estimateMusicSeconds([song('a', { lyrics: '' })], 'max', '1.7B', 1, 1);
    const big = estimateMusicSeconds([song('a', { lyrics: '' })], 'max', '4B', 1, 1);
    expect(compose).toBeGreaterThan(lyr + 5);
    expect(big).toBeGreaterThan(compose);
  });
});

describe('the plan', () => {
  it('with no limit takes the best level and two versions, with the biggest language model for what has no lyrics', () => {
    const p = planMusicAuto(project([song('a'), song('b', { lyrics: '' })]), ALL, BIG, null)!;
    expect(p.tier.id).toBe('max');
    expect(p.variants).toBe(2);
    expect(p.lmFile).toBe('acestep-5Hz-lm-4B-Q6_K.gguf');
    expect(p.fits).toBe(true);
    expect(planSettings(p)).toMatchObject({ synth_model: 'acestep-v15-sft-Q8_0.gguf', inference_steps: 50, shift: 1, lm_model: 'acestep-5Hz-lm-4B-Q6_K.gguf' });
  });

  it('leaves the language model alone when every song brings its lyrics', () => {
    const p = planMusicAuto(project([song('a'), song('b')]), ALL, BIG, null)!;
    expect(p.lmFile).toBe('');
    expect(planSettings(p).lm_model).toBeUndefined();
  });

  it('a limit lowers the versions first, then the level, until it fits', () => {
    const tracks = Array.from({ length: 30 }, (_, i) => song(`s${i}`));
    const none = planMusicAuto(project(tracks), ALL, BIG, null)!;
    const ten = planMusicAuto(project(tracks), ALL, BIG, 10 * 60)!;
    expect(ten.seconds).toBeLessThanOrEqual(10 * 60);
    expect(ten.seconds).toBeLessThan(none.seconds);
    expect(ten.fits).toBe(true);
    const tight = planMusicAuto(project(tracks), ALL, BIG, 2 * 60)!;
    expect(tight.tier.id).not.toBe('max');
    expect(tight.variants).toBeLessThan(4);
  });

  it('when not even the fastest fits it says how long that is', () => {
    const tracks = Array.from({ length: 100 }, (_, i) => song(`s${i}`));
    const p = planMusicAuto(project(tracks), ALL, BIG, 60)!;
    expect(p.fits).toBe(false);
    expect(p.tier.id).toBe('fast');
    expect(p.variants).toBe(1);
    expect(p.fastest).toBe(p.seconds);
  });

  it('only offers the levels whose model is installed', () => {
    const p = planMusicAuto(project([song('a')]), files('acestep-v15-turbo-Q8_0.gguf', 'acestep-5Hz-lm-1.7B-Q8_0.gguf'), BIG, null)!;
    expect(p.tier.id).toBe('fast');
    expect(planMusicAuto(project([song('a')]), files('acestep-5Hz-lm-1.7B-Q8_0.gguf'), BIG, null)).toBeNull();
  });

  it('warns about a small card and about a missing language model', () => {
    const small = machineOf([{ index: 0, name: 'NVIDIA GeForce RTX 3060', free_vram_mb: 5000, total_vram_mb: 6144 }], null);
    const p = planMusicAuto(project([song('a', { lyrics: '' })]), files('acestep-v15-xl-turbo-Q8_0.gguf'), small, null)!;
    expect(p.notes.join(' ')).toContain('puede fallar');
    expect(p.notes.join(' ')).toContain('modelo de lenguaje');
  });

  it('is only for music projects and says what it chose', () => {
    expect(planMusicAuto(project([song('a')], 'video'), ALL, BIG, null)).toBeNull();
    const lines = describeMusicPlan(planMusicAuto(project([song('a', { lyrics: '' })]), ALL, BIG, null)!);
    expect(lines.join(' ')).toContain('Máxima');
    expect(lines.join(' ')).toContain('4B');
    expect(lines.join(' ')).toContain('4');
  });

  describe('covers', () => {
    const IMAGE: CatalogEntry = {
      id: 'into',
      kind: 'model',
      name: 'IntoRealism',
      description: '',
      size_bytes: 1,
      files: [],
      installed: true,
      preset: { steps: 8, cfg_scale: 1, resolution: '1024x576' },
      timing: { seconds: 19, resolution: '1024x576', steps: 8, measured: true },
    };

    it('adds the time of one picture per song, however many versions it has, and says it', () => {
      const tracks = [song('a'), song('b')];
      const without = planMusicAuto(project(tracks), ALL, BIG, null)!;
      const withCover = planMusicAuto(project(tracks), ALL, BIG, null, IMAGE)!;
      expect(withCover.seconds - without.seconds).toBeGreaterThanOrEqual(2 * 19 - 2); // 768x768 costs the same as 1024x576
      expect(withCover.seconds - without.seconds).toBeLessThanOrEqual(2 * 19 + 2);
      expect(withCover.coverEntry).toBe(IMAGE);
      expect(describeMusicPlan(withCover).join(' ')).toContain('Portada');
      expect(describeMusicPlan(without).join(' ')).not.toContain('Portada');
    });

    it('does not count the songs that opt out of the cover', () => {
      const a = planMusicAuto(project([song('a'), song('b', { cover: 'off' })]), ALL, BIG, null, IMAGE)!;
      const b = planMusicAuto(project([song('a'), song('b')]), ALL, BIG, null, IMAGE)!;
      expect(b.seconds).toBeGreaterThan(a.seconds);
    });
  });
});
