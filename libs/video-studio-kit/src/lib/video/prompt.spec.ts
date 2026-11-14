import { DEFAULT_SETTINGS, type GenerationSettings } from './model';
import { PROMPT_MAX, fullPrompt } from './prompt';

const s = (over: Partial<GenerationSettings> = {}): GenerationSettings => ({ ...DEFAULT_SETTINGS, prompt: 'a fox in the snow', ...over });

describe('fullPrompt', () => {
  it('is the prompt as written when there is no sound text', () => {
    expect(fullPrompt(s())).toBe('a fox in the snow');
    expect(fullPrompt(s({ sound: '   ' }))).toBe('a fox in the snow');
  });

  it('puts the sound after the prompt as a sentence of its own', () => {
    expect(fullPrompt(s({ sound: 'wind and soft piano' }))).toBe('a fox in the snow Sound: wind and soft piano');
  });

  it('is only the sound sentence when there is a start image and no prompt', () => {
    expect(fullPrompt(s({ prompt: '', sound: 'rain' }))).toBe('Sound: rain');
  });

  it('leaves the sound out when Audio is off or the model cannot write it', () => {
    expect(fullPrompt(s({ sound: 'rain', audio: false }))).toBe('a fox in the snow');
    expect(fullPrompt(s({ sound: 'rain' }), false)).toBe('a fox in the snow');
  });

  it('is limited like the server: 2000 characters', () => {
    expect(PROMPT_MAX).toBe(2000);
  });
});
