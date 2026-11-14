import { PROMPT_MAX, TITLE_MAX, validateCustom, validateEasy } from './validate';

describe('validateCustom', () => {
  it('asks for a title and for lyrics', () => {
    expect(validateCustom({ title: '  ', lyrics: 'la' })).toEqual(['title.required']);
    expect(validateCustom({ title: 'Night drive', lyrics: ' \n ' })).toEqual(['lyrics.required']);
    expect(validateCustom({ title: '', lyrics: '' })).toEqual(['title.required', 'lyrics.required']);
  });

  it('refuses a title longer than 80 characters and counts an accent as one', () => {
    expect(TITLE_MAX).toBe(80);
    expect(validateCustom({ title: 'a'.repeat(81), lyrics: 'la' })).toEqual(['title.tooLong']);
    expect(validateCustom({ title: 'ñ'.repeat(80), lyrics: 'la' })).toEqual([]);
  });

  it('does not need lyrics for an instrumental song', () => {
    expect(validateCustom({ title: 'Night drive', lyrics: '', instrumental: true })).toEqual([]);
  });
});

describe('validateCustom for a generator that reads tags', () => {
  it('asks for at least one style tag, which the server needs, but not for ACE-Step, which reads a sentence', () => {
    const song = { title: 'Night drive', lyrics: 'la' };
    expect(validateCustom({ ...song, style: ' ', generator: 'heartmula' })).toEqual(['style.required']);
    expect(validateCustom({ ...song, style: ', ,', generator: 'diffrhythm2' })).toEqual(['style.required']);
    expect(validateCustom({ ...song, style: 'lo-fi', generator: 'heartmula' })).toEqual([]);
    expect(validateCustom({ ...song, style: '', generator: 'ace-step' })).toEqual([]);
  });

  it('is asked nothing about the style when no generator is given', () => {
    expect(validateCustom({ title: 'Night drive', lyrics: 'la' })).toEqual([]);
  });
});

describe('validateEasy', () => {
  it('asks for a prompt of at most 2000 characters', () => {
    expect(PROMPT_MAX).toBe(2000);
    expect(validateEasy({ prompt: ' ' })).toEqual(['prompt.required']);
    expect(validateEasy({ prompt: 'x'.repeat(2001) })).toEqual(['prompt.tooLong']);
    expect(validateEasy({ prompt: 'A soothing piano melody' })).toEqual([]);
  });
});
