import { DEFAULT_SECONDS, MAX_SECONDS, MIN_SECONDS, configOf, secondsOf, requestOf, titleFromPrompt, trackOf } from './request';
import type { Song, SongRequest } from './model';

const REQUEST: SongRequest = { title: 'Night drive', lyrics: '[verse]\nla la', style: 'lo-fi, chill, piano', generator: 'heartmula', instrumental: false };

describe('secondsOf', () => {
  it('takes a whole number of seconds within the bounds, and the default otherwise', () => {
    expect(secondsOf({ seconds: 45 })).toBe(45);
    expect(secondsOf({ seconds: MIN_SECONDS })).toBe(MIN_SECONDS);
    expect(secondsOf({ seconds: MAX_SECONDS })).toBe(MAX_SECONDS);
    for (const bad of [undefined, 0, -3, MIN_SECONDS - 1, MAX_SECONDS + 1, 12.5, Number.NaN]) expect(secondsOf({ seconds: bad }), String(bad)).toBe(DEFAULT_SECONDS);
  });
});

describe('trackOf', () => {
  it('gives HeartMuLa the title as its prompt, the lyrics and the style as tags', () => {
    expect(trackOf(REQUEST)).toEqual({ id: 'pista_1', title: 'Night drive', prompt: 'Night drive', lyrics: '[verse]\nla la', tags: 'lo-fi, chill, piano', duration_seconds: DEFAULT_SECONDS, variants: 1 });
  });

  it('gives ACE-Step the style as the sentence it reads and no tags', () => {
    const t = trackOf({ ...REQUEST, generator: 'ace-step', style: 'A slow lo-fi piano piece' });
    expect(t['prompt']).toBe('A slow lo-fi piano piece');
    expect(t).not.toHaveProperty('tags');
  });

  it('falls back to the title when ACE-Step has no style', () => {
    expect(trackOf({ ...REQUEST, generator: 'ace-step', style: '' })['prompt']).toBe('Night drive');
  });

  it('marks an instrumental song and sends no lyrics', () => {
    const t = trackOf({ ...REQUEST, instrumental: true });
    expect(t['instrumental']).toBe(true);
    expect(t).not.toHaveProperty('lyrics');
  });

  it('trims the texts and leaves out a style that is empty', () => {
    const t = trackOf({ ...REQUEST, title: '  Night drive ', lyrics: ' la ', style: '  ' });
    expect(t).toMatchObject({ title: 'Night drive', lyrics: 'la' });
    expect(t).not.toHaveProperty('tags');
  });
});

describe('configOf', () => {
  const starter = { project: 'ms-1', adult: false, output: { mode: 'video', file: 'out/x.mp4' }, defaults: { model: 'm.safetensors', steps: 0, fps: 24, music: { engine: 'cli' } }, scenes: [{ id: 'a' }] };

  it('makes a music project of one track, named for this dashboard and with the generator in the defaults', () => {
    const cfg = configOf(starter, REQUEST, 'music-studio');
    expect(cfg['client']).toBe('music-studio');
    expect(cfg['output']).toEqual({ mode: 'music' });
    expect(cfg['tracks']).toEqual([trackOf(REQUEST)]);
    expect(cfg).not.toHaveProperty('scenes');
    expect((cfg['defaults'] as { music: unknown }).music).toEqual({ engine: 'cli', generator: 'heartmula' });
  });

  it('keeps what the server put in the defaults, minus the video leftovers at zero', () => {
    const defaults = configOf(starter, REQUEST, 'music-studio')['defaults'] as Record<string, unknown>;
    expect(defaults['model']).toBe('m.safetensors');
    expect(defaults['fps']).toBe(24);
    expect(defaults).not.toHaveProperty('steps');
  });
});

describe('titleFromPrompt', () => {
  it('is the first words of the prompt, capitalised', () => {
    expect(titleFromPrompt('a soothing piano melody with gentle rain')).toBe('A soothing piano melody');
    expect(titleFromPrompt('  rock\nanthem ')).toBe('Rock anthem');
  });

  it('never goes past the longest title', () => {
    expect([...titleFromPrompt('x'.repeat(200))]).toHaveLength(80);
  });

  it('falls back to a plain name for an empty prompt', () => {
    expect(titleFromPrompt('  ')).toBe('Song');
  });
});

describe('requestOf', () => {
  it('gives back what a song was made from', () => {
    const song: Song = { id: 'song-1', title: 'Night drive', style: 'lo-fi', lyrics: 'la', instrumental: false, generator: 'ace-step', createdAt: 1, state: { phase: 'failed', reason: 'x' } };
    expect(requestOf(song)).toEqual({ title: 'Night drive', lyrics: 'la', style: 'lo-fi', generator: 'ace-step', instrumental: false });
  });
});
