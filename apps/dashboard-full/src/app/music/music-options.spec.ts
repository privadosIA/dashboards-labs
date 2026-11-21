import { adapterOptions, clock, currentTier, languageModels, lyricsDiffer, modelOptions, selectedModel, synthesisModels, tierSettings } from './music-options';

const files = ['vae-BF16.gguf', 'Qwen3-Embedding-0.6B-Q8_0.gguf', 'acestep-5Hz-lm-1.7B-Q8_0.gguf', 'acestep-5Hz-lm-0.6B-Q8_0.gguf', 'acestep-v15-turbo-Q8_0.gguf'].map((name) => ({ name, size: 1 }));

describe('music model options', () => {
  it('tells language models from synthesis models and ignores the support files', () => {
    expect(languageModels(files)).toEqual(['acestep-5Hz-lm-0.6B-Q8_0.gguf', 'acestep-5Hz-lm-1.7B-Q8_0.gguf']);
    expect(synthesisModels(files)).toEqual(['acestep-v15-turbo-Q8_0.gguf']);
  });

  it('keeps a configured model that is not installed visible, flagged as missing', () => {
    const installed = synthesisModels(files);
    expect(modelOptions(installed, undefined)).toEqual([{ value: 'acestep-v15-turbo-Q8_0.gguf', missing: false }]);
    expect(modelOptions(installed, 'acestep-v15-sft-Q8_0.gguf')).toContainEqual({ value: 'acestep-v15-sft-Q8_0.gguf', missing: true });
  });

  it('accepts a configured name without the .gguf suffix, as the server does', () => {
    const installed = synthesisModels(files);
    expect(modelOptions(installed, 'acestep-v15-turbo-Q8_0').every((o) => !o.missing)).toBe(true);
    expect(selectedModel(installed, 'acestep-v15-turbo-Q8_0')).toBe('acestep-v15-turbo-Q8_0.gguf');
    expect(selectedModel(installed, 'other')).toBe('other');
    expect(selectedModel(installed, undefined)).toBe('');
  });
});

describe('lyricsDiffer', () => {
  it('is false when nothing was requested or when only whitespace differs', () => {
    expect(lyricsDiffer(undefined, 'la')).toBe(false);
    expect(lyricsDiffer('  ', 'la')).toBe(false);
    expect(lyricsDiffer('[Verse]\r\nhola\n', '[Verse]\nhola')).toBe(false);
  });
  it('is true when the sung lyrics are not what was asked for', () => {
    expect(lyricsDiffer('hola', 'adiós')).toBe(true);
    expect(lyricsDiffer('hola', undefined)).toBe(true);
  });
});

describe('clock', () => {
  it('formats seconds as m:ss', () => {
    expect(clock(125)).toBe('2:05');
    expect(clock(29.8)).toBe('0:30');
    expect(clock(undefined)).toBe('');
    expect(clock(-1)).toBe('');
  });
});

describe('adapterOptions', () => {
  it('offers the installed adapters, files and folders alike', () => {
    expect(adapterOptions(['chinese-new-year', 'style.safetensors'], undefined)).toEqual([
      { value: 'chinese-new-year', missing: false },
      { value: 'style.safetensors', missing: false },
    ]);
  });

  it('keeps an adapter the project names visible, flagged, when it is not installed', () => {
    expect(adapterOptions(['a'], 'gone')).toEqual([
      { value: 'a', missing: false },
      { value: 'gone', missing: true },
    ]);
  });

  it('does not flag an installed one nor invent an entry for none', () => {
    expect(adapterOptions(['a'], 'a')).toEqual([{ value: 'a', missing: false }]);
    expect(adapterOptions([], undefined)).toEqual([]);
  });
});

describe('music quality levels', () => {
  it('knows the level the synthesis settings amount to', () => {
    expect(currentTier({})).toBe('normal'); // the project's default is the XL turbo
    expect(currentTier({ synth_model: 'acestep-v15-xl-turbo-Q8_0' })).toBe('normal'); // written by hand, without the suffix
    expect(currentTier({ synth_model: 'acestep-v15-turbo-Q8_0.gguf' })).toBe('fast');
    expect(currentTier({ synth_model: 'acestep-v15-sft-Q8_0.gguf', inference_steps: 50, shift: 1 })).toBe('max');
  });

  it('calls a mix of model, steps and shift custom', () => {
    expect(currentTier({ synth_model: 'acestep-v15-sft-Q8_0.gguf' })).toBeNull(); // the SFT without its 50 steps
    expect(currentTier({ inference_steps: 12 })).toBeNull();
    expect(currentTier({ synth_model: 'acestep-v15-turbo-Q8_0.gguf', shift: 3 })).toBeNull();
  });

  it('writes every key a level governs, clearing the ones it does not need', () => {
    expect(tierSettings('normal')).toEqual({ synth_model: undefined, inference_steps: undefined, shift: undefined });
    expect(tierSettings('fast')).toEqual({ synth_model: 'acestep-v15-turbo-Q8_0.gguf', inference_steps: undefined, shift: undefined });
    expect(tierSettings('max')).toEqual({ synth_model: 'acestep-v15-sft-Q8_0.gguf', inference_steps: 50, shift: 1 });
  });
});
