import { VideoclipPlan } from '../../core/api.models';
import { songSourceName, suggestVideoclipId, videoclipConfig } from './videoclip-config';

const PLAN: VideoclipPlan = {
  title: 'Noche',
  caption: 'warm pop',
  audio_file: 'out/songs/noche.MP3',
  audio_seconds: 12,
  transition_seconds: 0.8,
  subject_prompt: 'a woman with a red scarf',
  used_ai: true,
  shots: [
    { id: '01_verse', section: 'Verse', start: 0, seconds: 6, duration: 6.8, motion: 'zoom_in', intensity: 0.35, prompt: 'a road at dawn' },
    { id: '02_chorus', section: 'Chorus', start: 6, seconds: 6, duration: 6, motion: 'pan_left', intensity: 0.55, prompt: 'a field of flowers' },
  ],
};

describe('the project of a videoclip', () => {
  it('has one silent scene per shot, with its camera movement and the length the plan says', () => {
    const cfg = videoclipConfig(PLAN, 'noche-clip', 'voices/v.onnx', 'song.mp3');
    expect(cfg.scenes.map((s) => [s.id, s.prompt, s.silence_seconds, s.tts_text, s.motion])).toEqual([
      ['01_verse', 'a road at dawn', 6.8, '', { type: 'zoom_in', intensity: 0.35 }],
      ['02_chorus', 'a field of flowers', 6, '', { type: 'pan_left', intensity: 0.55 }],
    ]);
    expect(cfg.output).toMatchObject({ mode: 'video', file: 'out/noche-clip.mp4' });
  });

  it('shares the look, crossfades the scenes and uses the song as the soundtrack at full volume, with no ducking', () => {
    const cfg = videoclipConfig(PLAN, 'x', 'voices/v.onnx', 'song.mp3');
    expect(cfg.defaults).toMatchObject({ subject_prompt: 'a woman with a red scarf', transition_seconds: 0.8, voice: 'voices/v.onnx', fps: 24 });
    expect(cfg.defaults.negative_prompt).toContain('text');
    expect(cfg.bgm).toEqual({ file: 'song.mp3', volume: 1, fade_seconds: 1, ducking: false });
  });

  it('names the song in the sources by its extension, and makes a valid project id', () => {
    expect(songSourceName('out/songs/noche.MP3')).toBe('song.mp3');
    expect(songSourceName('a/b.wav')).toBe('song.wav');
    expect(suggestVideoclipId('Mis canciones', 'noche de verano')).toBe('Mis-canciones-noche-de-verano-clip');
    expect(suggestVideoclipId('p', 'q')).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);
    expect(suggestVideoclipId('_', '_')).toMatch(/^[A-Za-z0-9]/);
  });
});
