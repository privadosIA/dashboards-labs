import { Track } from '../core/api.models';
import { serverTrackErrors, validateTracks } from './music-validators';

const t = (over: Partial<Track> = {}): Track => ({ id: 'a', prompt: 'calm piano', ...over });

describe('validateTracks', () => {
  it('accepts a minimal track', () => {
    expect(validateTracks([t()])).toEqual({ tracks: [{}], valid: true });
  });

  it('requires a style prompt, ignoring blanks', () => {
    const v = validateTracks([t({ prompt: '   ' })]);
    expect(v.valid).toBe(false);
    expect(v.tracks[0].prompt).toBeTruthy();
  });

  it('rejects ids that cannot be file names and duplicate ids', () => {
    const v = validateTracks([t({ id: '../x' }), t({ id: 'b' }), t({ id: 'b' }), t({ id: '' })]);
    expect(v.tracks[0].id).toBeTruthy();
    expect(v.tracks[1].id).toBeUndefined();
    expect(v.tracks[2].id).toContain('2');
    expect(v.tracks[3].id).toBeTruthy();
  });

  it('checks variants, duration and bpm only when they are set', () => {
    expect(validateTracks([t({ variants: 0 })]).tracks[0].variants).toBeTruthy();
    expect(validateTracks([t({ variants: 1.5 })]).tracks[0].variants).toBeTruthy();
    expect(validateTracks([t({ duration_seconds: 0 })]).tracks[0].duration).toBeTruthy();
    expect(validateTracks([t({ bpm: -3 })]).tracks[0].bpm).toBeTruthy();
    expect(validateTracks([t({ variants: 3, duration_seconds: 30, bpm: 90 })]).valid).toBe(true);
  });

  it('rejects a negative adapter strength but accepts zero (no effect) and larger values', () => {
    expect(validateTracks([t({ adapter_scale: -0.1 })]).tracks[0].adapter).toBeTruthy();
    expect(validateTracks([t({ adapter_scale: 0 })]).valid).toBe(true);
    expect(validateTracks([t({ adapter_scale: 1.5 })]).valid).toBe(true);
  });

  it('keeps one error object per track, in order', () => {
    const v = validateTracks([t(), t({ id: 'b', prompt: '' })]);
    expect(v.tracks.length).toBe(2);
    expect(v.tracks[0]).toEqual({});
    expect(v.tracks[1].prompt).toBeTruthy();
  });
});

describe('serverTrackErrors', () => {
  it('ties each line to the track and the field it names', () => {
    const msg = [
      'config: track "ballad" has an empty prompt',
      'config: track "ballad": variants must be a positive integer >= 1, got 0',
      'config: duplicate track id "idea" (first at index 0, again at index 2)',
      'config: track "idea": bpm must be > 0, got -1',
    ].join('\n');
    const errs = serverTrackErrors(msg);
    expect(errs.map((e) => [e.trackId, e.field])).toEqual([
      ['ballad', 'prompt'],
      ['ballad', 'variants'],
      ['idea', 'id'],
      ['idea', 'bpm'],
    ]);
    expect(errs[0].text).not.toMatch(/^config:/);
  });

  it('ties an adapter strength rejection to the adapter field of its track', () => {
    const [e] = serverTrackErrors('config: track "a": adapter_scale must not be negative, got -1');
    expect(e).toMatchObject({ trackId: 'a', field: 'adapter' });
  });

  it('leaves project-level problems without a track', () => {
    const errs = serverTrackErrors(
      'config: music synthesis model "x.gguf" not found in models/music: install it from the Models screen (Música tab)',
    );
    expect(errs).toEqual([
      { trackId: null, field: null, text: expect.stringContaining('Música tab') },
    ]);
  });

  it('keeps a track-level message with no recognisable field', () => {
    const [e] = serverTrackErrors('config: tracks "a" and "b" both resolve to output path "out/p/a.mp3"');
    expect(e.trackId).toBeNull();
    expect(e.text).toContain('both resolve');
  });
});

describe('validateTracks with a task', () => {
  const base = { id: 'a', prompt: 'jazz' };

  it('needs a source', () => {
    const v = validateTracks([{ ...base, task: 'cover' }]);
    expect(v.valid).toBe(false);
    expect(v.tracks[0].source).toBeTruthy();
  });

  it('accepts a complete cover, repaint and extract', () => {
    expect(validateTracks([{ ...base, task: 'cover', source: 'b.mp3', cover_strength: 0.5 }]).valid).toBe(true);
    expect(validateTracks([{ ...base, task: 'repaint', source: 'b.mp3', repaint_start: 1, repaint_end: 2 }]).valid).toBe(true);
    expect(validateTracks([{ ...base, task: 'extract', source: 'b.mp3', stem: 'vocals' }]).valid).toBe(true);
  });

  it('checks strength, region and stem', () => {
    const v = validateTracks([
      { ...base, task: 'cover', source: 'b.mp3', cover_strength: 1.5 },
      { ...base, id: 'b', task: 'repaint', source: 'b.mp3', repaint_start: 20, repaint_end: 10 },
      { ...base, id: 'c', task: 'extract', source: 'b.mp3' },
    ]);
    expect(v.tracks[0].strength).toBeTruthy();
    expect(v.tracks[1].region).toBeTruthy();
    expect(v.tracks[2].stem).toBeTruthy();
  });

  it('a new song is not asked for a source', () => {
    expect(validateTracks([base]).valid).toBe(true);
  });

  it('ties the server messages about task fields to their field', () => {
    const errs = serverTrackErrors('config: track "a": repaint_end (1) must be greater than repaint_start (2)\nconfig: track "b": source "x.mp3" not found in sources');
    expect(errs[0].field).toBe('region');
    expect(errs[1].field).toBe('source');
  });
});
