import { isYoutubeUrl } from './youtube';

describe('isYoutubeUrl', () => {
  it('accepts the address of one video on the hosts the server takes', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=abc123',
      'https://youtube.com/watch?v=abc123',
      'https://m.youtube.com/watch?v=abc123',
      'https://music.youtube.com/watch?v=abc123',
      'https://youtu.be/abc123',
      '  https://youtu.be/abc123  ',
    ]) {
      expect(isYoutubeUrl(url), url).toBe(true);
    }
  });

  it('refuses another site, plain http, a list or a bare host', () => {
    for (const url of ['https://vimeo.com/123', 'http://www.youtube.com/watch?v=abc', 'https://www.youtube.com/playlist?list=PL1', 'https://www.youtube.com/', 'https://evil.com/youtube.com/watch?v=a', 'youtube.com/watch?v=a', '']) {
      expect(isYoutubeUrl(url), url).toBe(false);
    }
  });
});
