import { PROMPT_MAX } from './prompt';
import { DEFAULT_SETTINGS, DURATION_MAX, DURATION_MIN, type GenerationSettings } from './model';
import { GenerationRefused, validate } from './validate';

const ok = (patch: Partial<GenerationSettings> = {}): GenerationSettings => ({ ...DEFAULT_SETTINGS, model: 'balanced', prompt: 'a fox', ...patch });

describe('validate', () => {
  it('accepts a valid request', () => {
    expect(validate(ok({ duration: 8, aspectRatio: '16:9', quality: '720p', audio: true }))).toEqual([]);
  });

  it('refuses a blank prompt with no start image, and accepts a start image alone', () => {
    expect(validate(ok({ prompt: '   ' }))).toEqual(['prompt-required']);
    expect(validate(ok({ prompt: '', startImage: { name: 'a.png', dataUrl: 'data:image/png;base64,AA' } }))).toEqual([]);
  });

  it('accepts the whole range and refuses just outside it', () => {
    expect(validate(ok({ duration: DURATION_MIN }))).toEqual([]);
    expect(validate(ok({ duration: DURATION_MAX }))).toEqual([]);
    expect(validate(ok({ duration: DURATION_MIN - 1 }))).toEqual(['duration-range']);
    expect(validate(ok({ duration: DURATION_MAX + 1 }))).toEqual(['duration-range']);
  });

  it('refuses a duration that is not a whole number, NaN included', () => {
    expect(validate(ok({ duration: 4.5 }))).toEqual(['duration-not-whole']);
    expect(validate(ok({ duration: NaN }))).toEqual(['duration-not-whole']);
  });

  it('refuses an unknown ratio or quality, and reports every problem at once', () => {
    const bad = ok({ prompt: '', aspectRatio: '5:4' as never, quality: '4k' as never, duration: 99 });
    expect(validate(bad)).toEqual(['prompt-required', 'duration-range', 'aspect-ratio', 'quality']);
  });

  it('refuses an empty model, and a model outside the identifiers it is given', () => {
    expect(validate(ok({ model: '' }))).toEqual(['model']);
    expect(validate(ok({ model: 'other' }))).toEqual([]);
    expect(validate(ok({ model: 'other' }), ['balanced', 'fast'])).toEqual(['model']);
    expect(validate(ok({ model: 'fast' }), ['balanced', 'fast'])).toEqual([]);
    expect(validate(ok({ model: '' }), ['balanced'])).toEqual(['model']);
  });
});

describe('GenerationRefused', () => {
  it('says the accepted range', () => {
    expect(new GenerationRefused(['duration-range']).message).toBe('the duration must be from 4 to 30 seconds');
  });

  it('says a prompt or a start image is needed', () => {
    expect(new GenerationRefused(['prompt-required']).message).toContain('prompt or a start image');
  });

  it('says the model must be one of the available ones', () => {
    expect(new GenerationRefused(['model']).message).toContain('one of the available');
  });
});

describe('validate: the prompt and the sound together', () => {
  const long = (n: number) => 'x'.repeat(n);

  it('accepts a prompt of the limit and refuses one character more', () => {
    expect(validate(ok({ prompt: long(PROMPT_MAX) }))).toEqual([]);
    expect(validate(ok({ prompt: long(PROMPT_MAX + 1) }))).toEqual(['prompt-too-long']);
  });

  it('counts the sound sentence with the prompt', () => {
    const room = PROMPT_MAX - 'Sound: '.length - 1;
    expect(validate(ok({ prompt: long(PROMPT_MAX - 10), sound: 'twelve chars' }))).toEqual(['prompt-too-long']);
    expect(validate(ok({ prompt: long(1), sound: long(room - 1) }))).toEqual([]);
  });

  it('does not count a sound that is not sent (Audio off, or a model that cannot write it)', () => {
    expect(validate(ok({ prompt: long(PROMPT_MAX), sound: 'rain', audio: false }))).toEqual([]);
    expect(validate(ok({ prompt: long(PROMPT_MAX), sound: 'rain' }), undefined, false)).toEqual([]);
    expect(validate(ok({ prompt: long(PROMPT_MAX), sound: 'rain' }), undefined, true)).toEqual(['prompt-too-long']);
  });

  it('says it in the message of the refusal', () => {
    expect(new GenerationRefused(['prompt-too-long']).message).toContain(String(PROMPT_MAX));
  });
});
