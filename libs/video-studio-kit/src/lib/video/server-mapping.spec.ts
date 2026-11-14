import { DEFAULT_SETTINGS, QUALITIES, type GenerationSettings } from './model';
import { serverQuality, studioQuality, toGeneration, toRequest, toSettings, type ServerGeneration } from './server-mapping';
import { validate } from './validate';

const settings = (over: Partial<GenerationSettings> = {}): GenerationSettings => ({ ...DEFAULT_SETTINGS, prompt: 'a cat', model: 'ltx', ...over });
const address = (a: string) => `http://server:4666${a}`;

describe('the quality', () => {
  it('maps the three resolutions to the three levels and back', () => {
    expect(QUALITIES.map(serverQuality)).toEqual(['draft', 'normal', 'high']);
    expect(['draft', 'normal', 'high'].map((q) => studioQuality(q as 'draft'))).toEqual([...QUALITIES]);
  });
  it('reads a request with no quality as the server does: the best', () => {
    expect(studioQuality(undefined)).toBe('1080p');
  });
});

describe('toRequest', () => {
  it('carries the duration, the ratio, the level, the prompt and the option', () => {
    expect(toRequest(settings({ duration: 8, aspectRatio: '9:16', quality: '480p', audio: false }))).toEqual({
      prompt: 'a cat',
      option: 'ltx',
      duration: 8,
      aspect_ratio: '9:16',
      quality: 'draft',
      client: 'video-studio',
    });
  });
  it('leaves out an empty model (the default) and a blank prompt', () => {
    const r = toRequest(settings({ model: '', prompt: '   ' }));
    expect('option' in r).toBe(false);
    expect('prompt' in r).toBe(false);
  });
  it('joins the sound to the prompt when the option can write it, and not otherwise', () => {
    expect(toRequest(settings({ sound: 'rain' }), { audio: true }).prompt).toBe('a cat Sound: rain');
    expect(toRequest(settings({ sound: 'rain' }), { audio: false }).prompt).toBe('a cat');
    expect(toRequest(settings({ sound: 'rain', audio: false }), { audio: true }).prompt).toBe('a cat');
    expect(toRequest(settings({ prompt: '', sound: 'rain' }), { audio: true }).prompt).toBe('Sound: rain');
  });

  it('sends audio only with an option that can write it', () => {
    expect(toRequest(settings({ audio: true }), { audio: true }).audio).toBe(true);
    expect('audio' in toRequest(settings({ audio: true }), { audio: false })).toBe(false);
    expect(toRequest(settings({ audio: true })).audio).toBe(true); // unknown option: the server decides
    expect('audio' in toRequest(settings({ audio: false }), { audio: true })).toBe(false);
  });
  it('is what the studio validates: every ratio of the studio is one the server takes', () => {
    for (const aspectRatio of ['16:9', '4:3', '1:1', '3:4', '9:16'] as const) {
      expect(validate(settings({ aspectRatio }))).toEqual([]);
    }
    expect(validate(settings({ aspectRatio: '21:9' as never }))).toContain('aspect-ratio');
  });
});

describe('toSettings and toGeneration', () => {
  const server: ServerGeneration = {
    id: 'api-gen-1',
    state: 'done',
    progress: 100,
    request: { prompt: 'a cat', option: 'ltx', duration: 8, aspect_ratio: '9:16', quality: 'normal', audio: true },
    client: 'video-studio',
    run_id: 'run-1',
    clip_seconds: 2,
    created_at: '2026-11-02T10:00:00Z',
    size_bytes: 1,
    inputs: [],
    video: '/api/projects/api-gen-1/artifacts/out/api-gen-1.mp4',
  };

  it('reads the settings back from the request', () => {
    expect(toSettings(server.request)).toEqual({ prompt: 'a cat', startImage: null, model: 'ltx', duration: 8, aspectRatio: '9:16', quality: '720p', audio: true, sound: '' });
  });
  it('falls back to the studio defaults for what the request lacks', () => {
    expect(toSettings({})).toEqual({ ...DEFAULT_SETTINGS, audio: false, model: '', quality: '1080p' }); // the server's default level is the best
  });
  it('gives the video as a full address when done', () => {
    const g = toGeneration(server, address);
    expect(g).toMatchObject({ id: 'api-gen-1', state: 'done', progress: 100, videoUrl: 'http://server:4666/api/projects/api-gen-1/artifacts/out/api-gen-1.mp4' });
    expect('error' in g).toBe(false);
  });
  it('carries the error of a failed one and no video', () => {
    const g = toGeneration({ ...server, state: 'failed', video: undefined, error: 'out of memory' }, address);
    expect([g.state, g.error, 'videoUrl' in g]).toEqual(['failed', 'out of memory', false]);
  });
  it('keeps the settings it is given (the ones with the start image)', () => {
    const own = settings({ startImage: { name: 'a.png', dataUrl: 'data:image/png;base64,AAAA' } });
    expect(toGeneration(server, address, own).settings).toBe(own);
  });
});
