import { DEFAULT_LISTEN, defaultMethod } from './listen';

describe('defaultMethod', () => {
  it('is the sound as well when LAION-CLAP can be used, and the words otherwise', () => {
    expect(defaultMethod([{ id: 'whisper', available: true }, { id: 'clap', available: true }])).toBe('clap');
    expect(defaultMethod([{ id: 'whisper', available: true }, { id: 'clap', available: false, reason: 'not_running' }])).toBe('whisper');
    expect(defaultMethod([])).toBe('whisper');
  });

  it('starts with the words, the language detected and no hint', () => {
    expect(DEFAULT_LISTEN).toEqual({ method: 'whisper', language: '', hint: '' });
  });
});
