import { assistText } from './request';

describe('assistText', () => {
  it('writes the title, the style and the lyrics so far, for whatever the user has', () => {
    expect(assistText({ title: 'Night drive', lyrics: '', style: '' })).toBe('Night drive');
    expect(assistText({ title: 'Night drive', lyrics: '', style: 'lo-fi, chill' })).toBe('Night drive\nStyle: lo-fi, chill');
    expect(assistText({ title: 'Night drive', lyrics: '[verse]\nla', style: '' })).toBe('Night drive\nLyrics so far:\n[verse]\nla');
    expect(assistText({ title: '', lyrics: '', style: 'pop' })).toBe('Style: pop');
  });

  it('is empty when there is nothing to go on, and never longer than the server accepts', () => {
    expect(assistText({ title: ' ', lyrics: ' ', style: ' ' })).toBe('');
    expect(assistText({ title: 'T', lyrics: 'x'.repeat(5000), style: '' }).length).toBe(2000);
  });
});
