import { Scene } from '../../../core/api.models';
import { fromFormModel, numberOrUndefined, pictureModeOf, pictureModePatch, toFormModel, toScenePatch } from './scene-model.adapter';

const scene = (over: Partial<Scene> = {}): Scene => ({
  id: 'a',
  prompt: 'un perro',
  negative_prompt: '',
  tts_text: 'hola',
  speed: 1,
  lora: '',
  ...over,
});

/** The patch the form would send after changing `change` in the scene's own model. */
const patchOf = (s: Scene, change: Record<string, unknown>) => toScenePatch(s, { ...toFormModel(s), ...change } as never);

describe('scene model adapter', () => {
  describe('what the user did not touch', () => {
    const ctx = { effectiveSpeaker: 3, hasSpeakers: true } as never;

    it('shows the speaker in use without writing it', () => {
      const s = scene();
      const shown = toFormModel(s, ctx);
      expect(shown.speaker).toBe(3);
      expect(toScenePatch(s, { ...shown, prompt: 'otro' }, shown)).toEqual({ prompt: 'otro' });
    });

    it('writes the speaker only when the user picks one', () => {
      const s = scene();
      const shown = toFormModel(s, ctx);
      expect(toScenePatch(s, { ...shown, speaker: 3 }, shown)).toEqual({});
      expect(toScenePatch(s, { ...shown, speaker: 1 }, shown)).toEqual({ speaker: 1 });
    });

    it('choosing another voice forgets the speaker', () => {
      const s = scene({ voice: 'voices/a.onnx', speaker: 2 });
      const shown = toFormModel(s, ctx);
      expect(toScenePatch(s, { ...shown, voice: 'voices/b.onnx' }, shown)).toEqual({ voice: 'voices/b.onnx', speaker: undefined });
    });

    it('a block changes key by key', () => {
      const s = scene({ render: { steps: 20 } });
      const shown = toFormModel(s, ctx);
      expect(toScenePatch(s, { ...shown, render: { ...shown.render, resolution: '640x640' } }, shown)).toEqual({ render: { steps: 20, resolution: '640x640' } });
    });
  });

  it('an untouched model changes nothing', () => {
    const s = scene({ seed: 4, motion: { type: 'zoom_in', intensity: 0.7 }, look: { grain: 0.2, white_balance: 'warm' }, render: { steps: 20 } });
    expect(toScenePatch(s, toFormModel(s))).toEqual({});
  });

  it('numbers: an emptied box removes the key', () => {
    expect(patchOf(scene({ seed: 3 }), { seed: null })).toEqual({ seed: undefined });
    expect(patchOf(scene(), { seed: '7' })).toEqual({ seed: 7 });
    expect(numberOrUndefined('abc')).toBeUndefined();
  });

  it('render and animation: an emptied field goes back to the project, an emptied block is not kept', () => {
    const s = scene({ render: { resolution: '1280x704', steps: 30 } });
    expect(patchOf(s, { render: { resolution: '', steps: 30, cfg_scale: null } })).toEqual({ render: { steps: 30 } });
    expect(patchOf(s, { render: { resolution: '', steps: null, cfg_scale: null } })).toEqual({ render: undefined });
    expect(patchOf(scene(), { animation: { resolution: '832x480', frames: '33', steps: null } })).toEqual({
      animation: { resolution: '832x480', frames: 33 },
    });
  });

  it('narration: silence clears the text, narrating clears the silence', () => {
    expect(patchOf(scene(), { narration: 'silence' })).toEqual({ silence_seconds: 2, tts_text: '' });
    expect(patchOf(scene({ silence_seconds: 3, tts_text: '' }), { narration: 'tts' })).toEqual({ silence_seconds: undefined });
  });

  it('camera: static means no motion, any preset keeps the intensity', () => {
    const s = scene({ motion: { type: 'zoom_in', intensity: 0.8 } });
    expect(patchOf(s, { motionType: 'static' })).toEqual({ motion: undefined });
    expect(patchOf(s, { motionType: 'pan_left' })).toEqual({ motion: { type: 'pan_left', intensity: 0.8 } });
    expect(patchOf(scene(), { motionType: 'zoom_out' })).toEqual({ motion: { type: 'zoom_out', intensity: 0.5 } });
    expect(patchOf(s, { motionIntensity: 0.2 })).toEqual({ motion: { type: 'zoom_in', intensity: 0.2 } });
  });

  it('look: it appears with the first change and keeps the other half', () => {
    expect(patchOf(scene(), { grain: 0.4 })).toEqual({ look: { grain: 0.4, white_balance: 'neutral' } });
    expect(patchOf(scene({ look: { grain: 0.4, white_balance: 'neutral' } }), { whiteBalance: 'cool' })).toEqual({
      look: { grain: 0.4, white_balance: 'cool' },
    });
  });

  it('animate: off is written false and takes the chosen part of the animation with it', () => {
    const s = scene({ animate: true, clip_start: 1, clip_end: 2, clip_speed: 2 });
    expect(patchOf(s, { animate: false })).toEqual({ animate: false, clip_start: undefined, clip_end: undefined, clip_speed: undefined });
    expect(patchOf(scene(), { animate: true })).toEqual({ animate: true });
  });

  it('transition: empty means the project\'s and the seconds are rounded', () => {
    expect(patchOf(scene({ transition: 'fade' }), { transition: '' })).toEqual({ transition: undefined });
    expect(patchOf(scene(), { transition_seconds: '0.666' })).toEqual({ transition_seconds: 0.67 });
  });

  it('overlay: switching it on starts empty, off removes it, the fields edit it', () => {
    expect(patchOf(scene(), { overlayOn: true })).toEqual({ overlay: { text: '' } });
    expect(patchOf(scene({ overlay: { text: 'x' } }), { overlayOn: false })).toEqual({ overlay: undefined });
    expect(patchOf(scene({ overlay: { text: 'x' } }), { overlay: { text: 'y', start: '1', end: null, position: 'top' } })).toEqual({
      overlay: { text: 'y', start: 1, position: 'top' },
    });
  });

  it('init picture: its strength goes with it', () => {
    expect(patchOf(scene(), { init_image: '' })).toEqual({ init_image: '' });
    expect(patchOf(scene({ init_image: 'a.png', strength: 0.5 }), { init_image: null })).toEqual({ init_image: undefined, strength: undefined });
  });

  describe('picture mode', () => {
    it('is read from the scene', () => {
      expect(pictureModeOf(scene())).toBe('ai');
      expect(pictureModeOf(scene({ image: 'a.png' }))).toBe('own');
      expect(pictureModeOf(scene({ clip: 'a.mp4' }))).toBe('clip');
      expect(pictureModeOf(scene({ motion_graphic: '' }))).toBe('motion');
    });

    it('a clip excludes the picture, the starting picture and the animation', () => {
      const s = scene({ image: 'a.png', init_image: 'b.png', strength: 0.5, animate: true, render: { steps: 3 } });
      const next = fromFormModel(s, { ...toFormModel(s), pictureMode: 'clip' });
      expect(next).toMatchObject({ clip: '', image: undefined, init_image: undefined, strength: undefined, animate: undefined, render: undefined });
    });

    it('a motion graphic excludes everything else', () => {
      const s = scene({ clip: 'a.mp4', clip_start: 1 });
      const next = fromFormModel(s, { ...toFormModel(s), pictureMode: 'motion' });
      expect(next).toMatchObject({ motion_graphic: '', clip: undefined, clip_start: undefined });
    });

    it('back to generated clears the own picture and clip', () => {
      const s = scene({ image: 'a.png' });
      expect(patchOf(s, { pictureMode: 'ai' })).toEqual({ image: undefined });
    });

    it('own keeps the file chosen', () => {
      const s = scene({ image: 'a.png' });
      expect(patchOf(s, { image: 'b.png' })).toEqual({ image: 'b.png' });
    });
  });
});

describe('scene model adapter: what is only shown', () => {
  it('a speed stored as 0 is shown as 1 and not written until the user changes it', () => {
    const s: Scene = { id: 'a', prompt: 'p', negative_prompt: '', tts_text: 't', speed: 0, lora: '' };
    const shown = toFormModel(s);
    expect(shown.speed).toBe(1);
    expect(toScenePatch(s, { ...shown, prompt: 'q' }, shown)).toEqual({ prompt: 'q' });
    expect(toScenePatch(s, { ...shown, speed: 0.8 }, shown)).toEqual({ speed: 0.8 });
  });

  describe('a scene drawn by a part of the catalog', () => {
    const part = (over: Partial<Scene> = {}): Scene => scene({ prompt: '', motion_part: 'counter', motion_params: { to: 5 }, motion_text: 'hola', motion_bpm: 100, ...over });

    it('is the part way, also when the part is `auto` and the scene carries a description', () => {
      expect(pictureModeOf(part())).toBe('part');
      expect(pictureModeOf(part({ motion_part: 'auto', motion_graphic: 'tres ideas' }))).toBe('part');
      expect(pictureModeOf(part({ motion_part: '' }))).toBe('part');
      expect(pictureModeOf(scene({ motion_graphic: 'tres ideas' }))).toBe('motion');
    });

    it('shows its part, parameters, text and tempo in the form', () => {
      expect(toFormModel(part())).toMatchObject({ pictureMode: 'part', motion_part: 'counter', motion_params: { to: 5 }, motion_text: 'hola', motion_bpm: 100 });
      expect(toFormModel(scene())).toMatchObject({ motion_text: null, motion_bpm: null });
    });

    it('is not changed by a form nobody touched', () => {
      const s = part({ prompt: '' });
      expect(toScenePatch(s, toFormModel(s))).toEqual({});
    });

    it('choosing the way clears the exclusions and starts with the part not picked yet', () => {
      const s = scene({ image: 'a.png', animate: true, motion_prompt: 'x', init_image: 'b.png', strength: 0.5, render: { steps: 5 }, animation: { frames: 33 } });
      const patch = pictureModePatch(s, 'part');
      expect(patch).toMatchObject({ motion_part: '', image: undefined, animate: undefined, motion_prompt: undefined, init_image: undefined, strength: undefined, render: undefined, animation: undefined });
      expect(Object.keys(patch)).toContain('render');
    });

    it('a named part has no description, and `auto` keeps the one it has', () => {
      expect(fromFormModel(part({ motion_graphic: 'old' }), toFormModel(part({ motion_graphic: 'old' }))).motion_graphic).toBeUndefined();
      const auto = part({ motion_part: 'auto', motion_params: undefined, motion_graphic: 'tres ideas' });
      expect(fromFormModel(auto, toFormModel(auto)).motion_graphic).toBe('tres ideas');
      expect(toScenePatch(auto, { ...toFormModel(auto), motion_graphic: 'otra' } as never)).toEqual({ motion_graphic: 'otra' });
    });

    it('writes the text and the tempo as typed, and nothing for an empty text or tempo', () => {
      const s = part();
      expect(patchOf(s, { motion_text: 'adiós', motion_bpm: 90 })).toEqual({ motion_text: 'adiós', motion_bpm: 90 });
      expect(patchOf(s, { motion_text: '  ', motion_bpm: null })).toEqual({ motion_text: undefined, motion_bpm: undefined });
    });

    it('leaving the way clears every field of the part', () => {
      const s = part({ motion_part: 'auto', motion_graphic: 'tres ideas', prompt: 'algo' });
      const back = pictureModePatch(s, 'ai');
      expect(back).toMatchObject({ motion_part: undefined, motion_params: undefined, motion_text: undefined, motion_bpm: undefined, motion_graphic: undefined });
      // Going to the animated graphic keeps the description and drops the part.
      const motion = pictureModePatch(s, 'motion');
      expect(motion).toMatchObject({ motion_part: undefined, motion_params: undefined });
      expect('motion_graphic' in motion).toBe(false);
    });
  });
});
