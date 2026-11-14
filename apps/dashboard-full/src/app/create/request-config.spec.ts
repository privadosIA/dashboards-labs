import { CatalogEntry, RequestPlan } from '../core/api.models';
import { machineOf } from '../editor/auto-plan';
import { SONG_LENGTHS, defaultLevel, scaleResolution, draftFromPlan, draftFromText, lengthFor, DEFAULT_STRENGTH, editResolution, ltxFramesFor, previewStarter, projectIdFor, sourceNameFor, speechSeconds, titleFromProjectId, trackFor, videoRequestPlan, musicConfig } from './request-config';

describe('request-config', () => {
  it('names the project from the date and the title, in characters the server takes', () => {
    const id = projectIdFor('Gato en la azotea, al atardecer', new Date(2026, 9, 20, 15, 32));
    expect(id).toBe('mobile-20261020-1532-gato-en-la-azotea-al-atardecer');
    expect(id).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);
    expect(projectIdFor('¡Canción de la despedida!', new Date(2026, 0, 2, 3, 4))).toBe('mobile-20260102-0304-cancion-de-la-despedida');
    expect(projectIdFor('???', new Date(2026, 0, 2, 3, 4))).toBe('mobile-20260102-0304');
    expect(projectIdFor('x'.repeat(200), new Date(2026, 0, 2, 3, 4)).length).toBeLessThanOrEqual(64);
  });

  it('reads the title back from the id of a project of this page', () => {
    expect(titleFromProjectId('mobile-20261020-1532-gato-en-la-azotea')).toBe('gato en la azotea');
    expect(titleFromProjectId('mobile-20261020-1532-gato-en-la-azotea-2')).toBe('gato en la azotea');
    expect(titleFromProjectId('mobile-20261020-1532')).toBe('2026-10-20 15:32');
    expect(titleFromProjectId('otro')).toBe('otro');
  });

  it('names a source with characters the server takes and keeps the extension', () => {
    expect(sourceNameFor('Mi foto (1).JPG', 1000, 'png')).toBe('Mi-foto-1-rs.jpg');
    expect(sourceNameFor('canción final.mp3', 1000, 'mp3')).toBe('cancion-final-rs.mp3');
    expect(sourceNameFor('sin-extension', 1000, 'mp3')).toBe('sin-extension-rs.mp3');
    expect(sourceNameFor('###.wav', 1000, 'mp3')).toBe('archivo-rs.wav');
  });

  it('puts a requested length on the nearest card length', () => {
    expect(lengthFor(undefined)).toBe('normal');
    expect(lengthFor(0)).toBe('normal');
    expect(lengthFor(80)).toBe('short');
    expect(lengthFor(100)).toBe('normal');
    expect(lengthFor(240)).toBe('long');
  });

  it('starts the draft from the plan', () => {
    const plan: RequestPlan = {
      kind: 'music', kind_source: 'model', title: 'Despedida', instrumental: true, seconds: 120, warnings: [], caption: 'sad piano', lyrics: '',
    };
    const d = draftFromPlan(plan);
    expect(d).toMatchObject({ kind: 'music', title: 'Despedida', caption: 'sad piano', instrumental: true, seconds: SONG_LENGTHS.normal });
  });

  it('uses the words as the prompt when the assistant could not read the request', () => {
    expect(draftFromText('un gato', 'video', 'un gato')).toMatchObject({ imagePrompt: 'un gato', caption: '' });
    expect(draftFromText('rock', 'music', 'rock')).toMatchObject({ imagePrompt: '', caption: 'rock' });
  });

  it('writes a song as one track, without lyrics when it is instrumental', () => {
    const d = { ...draftFromText('x', 'music', 'Mi canción'), generator: 'heartmula' as const, caption: 'rock', lyrics: '[Verse]\nhola', tags: 'rock,guitar', audio: 'ref.mp3', seconds: 180 };
    expect(trackFor(d)).toEqual({ id: 'pista_1', prompt: 'rock', duration_seconds: 180, title: 'Mi canción', variants: 1, lyrics: '[Verse]\nhola', tags: 'rock,guitar', reference: 'ref.mp3' });
    // ACE-Step has no tags: the ones left in the draft from another generator are not written.
    expect(trackFor({ ...d, generator: 'ace-step' }).tags).toBeUndefined();
    expect(trackFor({ ...d, instrumental: true }).lyrics).toBeUndefined();
    expect(trackFor({ ...d, instrumental: true }).instrumental).toBe(true);
  });
});

describe('a video with speech', () => {
  const file = (name: string, role: string) => ({ name, role, url: '' });
  const entry = (over: Partial<CatalogEntry>): CatalogEntry => ({
    id: 'x', kind: 'model', name: 'X', description: '', size_bytes: 1, installed: true, files: [], ...over,
  });
  const INTO = entry({ id: 'sd15', styles: ['general'], style_rank: 2, vram_mb: 4096, timing: { seconds: 4, resolution: '512x512', steps: 20, measured: false }, files: [file('sd15.safetensors', 'model')] });
  const LTX = entry({
    id: 'ltx', kind: 'video', name: 'LTX 2.3', vram_mb: 11520, min_ram_gb: 24, preset: { steps: 8, cfg_scale: 1, resolution: '768x416' },
    timing: { seconds: 145, resolution: '768x416', steps: 8, frames: 49, measured: true },
    files: [file('ltx.gguf', 'model'), file('gemma.gguf', 'text_encoder'), file('lv.safetensors', 'vae'), file('la.safetensors', 'audio_vae'), file('conn.safetensors', 'connectors')],
  });
  const machine = machineOf([{ index: 0, name: 'NVIDIA GeForce RTX 4070', free_vram_mb: 12282, total_vram_mb: 12282 }], { total_bytes: 30 * 2 ** 30, available_bytes: 25 * 2 ** 30 });
  const draft = (over = {}) => ({ ...draftFromText('mujer en la playa', 'video', 'Mujer'), motionPrompt: 'she smiles', ...over });

  it('measures a line at about 2.5 words a second', () => {
    expect(speechSeconds('')).toBe(0);
    expect(speechSeconds('hola a todos bienvenidos a mi canal')).toBeCloseTo(3.8, 1);
  });

  it('gives LTX frames for a line, never fewer than the preset nor more than the card holds', () => {
    expect(ltxFramesFor('hola', 49, 12282)).toBe(49);
    expect(ltxFramesFor('hola a todos bienvenidos a mi canal', 49, 12282)).toBe(73);
    expect(ltxFramesFor('una frase bastante más larga que no cabe en un plano corto de vídeo', 49, 12282)).toBe(73);
    expect(ltxFramesFor('una frase bastante más larga que no cabe en un plano corto de vídeo', 49, 16000)).toBe(97);
  });

  it('LTX says the line itself: it goes in the movement prompt, with the audio on and no narration', () => {
    const p = videoRequestPlan(previewStarter(), draft({ speech: 'hola a todos' }), [INTO, LTX], machine)!;
    expect(p.video?.id).toBe('ltx');
    expect(p.speechBy).toBe('model');
    expect(p.config.scenes[0].motion_prompt).toContain('says clearly: "hola a todos"');
    expect(p.config.scenes[0].tts_text).toBe('');
    expect(p.config.defaults.animate).toMatchObject({ engine: 'ltx-2.3', model_audio: true, model_audio_speech: true });
  });

  it('any other engine narrates it', () => {
    const p = videoRequestPlan(previewStarter(), draft({ speech: 'hola a todos' }), [INTO], machine)!;
    expect(p.speechBy === 'narration' || p.video === null).toBe(true);
    expect(p.config.scenes[0].tts_text).toBe('hola a todos');
    expect(p.config.scenes[0].motion_prompt).not.toContain('says clearly');
  });

  it('a request without speech is as it was', () => {
    const p = videoRequestPlan(previewStarter(), draft(), [INTO, LTX], machine)!;
    expect(p.speechBy).toBe('');
    expect(p.config.scenes[0].tts_text).toBe('');
    expect(p.config.defaults.animate?.model_audio).toBeFalsy();
  });

  it('the speech of an image request is ignored', () => {
    const p = videoRequestPlan(previewStarter(), draft({ kind: 'image', speech: 'hola' }), [INTO, LTX], machine)!;
    expect(p.speechBy).toBe('');
  });

  it('a style asked for picks a model of that style, and automatic keeps the usual one', () => {
    const PONY = entry({ id: 'pony', styles: ['anime'], style_rank: 1, vram_mb: 8000, timing: { seconds: 20, resolution: '1024x1024', steps: 25, measured: false }, files: [file('pony.safetensors', 'model')] });
    const photo = entry({ id: 'real', styles: ['photo'], style_rank: 1, vram_mb: 8000, timing: { seconds: 20, resolution: '1024x576', steps: 8, measured: false }, files: [file('real.safetensors', 'model')] });
    const cat = [photo, PONY];
    const image = (style: 'auto' | 'photo' | 'anime') => ({ ...draftFromText('una chica', 'image', 'Chica'), style });
    expect(videoRequestPlan(previewStarter(), image('auto'), cat, machine)!.imageEntry?.id).toBe('real');
    expect(videoRequestPlan(previewStarter(), image('anime'), cat, machine)!.imageEntry?.id).toBe('pony');
    expect(videoRequestPlan(previewStarter(), image('photo'), cat, machine)!.imageEntry?.id).toBe('real');
  });

  describe('a picture to edit', () => {
    const KONTEXT = entry({
      id: 'kontext', edit: true, vram_mb: 8192, preset: { steps: 20, cfg_scale: 1, resolution: '1024x576' },
      timing: { seconds: 42, resolution: '1024x576', steps: 20, measured: true },
      files: [file('k.gguf', 'model'), file('clip_l.safetensors', 'clip_l'), file('t5.safetensors', 't5xxl'), file('ae.safetensors', 'vae')],
    });
    const SD = entry({ id: 'sd15', styles: ['general'], style_rank: 2, vram_mb: 4096, timing: { seconds: 4, resolution: '512x512', steps: 20, measured: false }, files: [file('sd15.safetensors', 'model')] });
    const image = (over = {}) => ({ ...draftFromText('ponle una gorra roja', 'image', 'Gorra'), picture: 'foto.png', ...over });

    it('is edited by the editing model when the user picks Retoque, with the words as the instruction and no strength', () => {
      const p = videoRequestPlan(previewStarter(), image({ style: 'edit', pictureSize: { width: 1000, height: 1000 } }), [SD, KONTEXT], machine)!;
      expect(p.editing).toBe(true);
      expect(p.config.defaults.model_set).toMatchObject({ edit: true, diffusion_model: 'models/k.gguf', clip_l: 'models/clip_l.safetensors', t5xxl: 'models/t5.safetensors', vae: 'models/ae.safetensors', cfg_scale: 1 });
      expect(p.config.defaults.model).toBe('');
      expect(p.config.defaults.steps).toBe(20);
      expect(p.config.defaults.resolution).toBe('768x768');
      expect(p.config.scenes[0]).toMatchObject({ init_image: 'foto.png', prompt: 'ponle una gorra roja', variants: 1 });
      expect(p.config.scenes[0].strength).toBeUndefined();
    });

    it('uses the engine asked for when both are installed, the fast one otherwise, and says which', () => {
      const QWEN = entry({
        id: 'qwen', edit: true, vram_mb: 11500, min_ram_gb: 24, preset: { steps: 20, cfg_scale: 2.5, resolution: '1024x576' },
        timing: { seconds: 113, resolution: '1024x576', steps: 20, measured: true },
        files: [file('q.gguf', 'model'), file('vl.gguf', 'llm'), file('mm.gguf', 'llm_vision'), file('qv.safetensors', 'vae')],
      });
      const m = { ...machine, vramMb: 12288, ramGb: 30 };
      const ask = (editEngine?: 'fast' | 'precise') => videoRequestPlan(previewStarter(), image({ style: 'edit', editEngine }), [SD, KONTEXT, QWEN], m)!;
      expect(ask().editEngine).toBe('fast');
      expect(ask('fast').config.defaults.model_set?.clip_l).toBe('models/clip_l.safetensors');
      const precise = ask('precise');
      expect(precise.editEngine).toBe('precise');
      expect(precise.config.defaults.model_set).toMatchObject({ edit: true, llm: 'models/vl.gguf', llm_vision: 'models/mm.gguf', cfg_scale: 2.5 });
      expect(precise.config.defaults.model_set?.t5xxl).toBeUndefined();
      // Only the Qwen one installed: it is used without being asked.
      expect(videoRequestPlan(previewStarter(), image({ style: 'edit' }), [SD, QWEN], m)!.editEngine).toBe('precise');
    });

    it('starts a generation from the picture when asked, with the strength given', () => {
      const p = videoRequestPlan(previewStarter(), image({ strength: 0.3 }), [SD, KONTEXT], machine)!;
      expect(p.editing).toBeFalsy();
      expect(p.config.scenes[0]).toMatchObject({ init_image: 'foto.png', strength: 0.3 });
      expect(p.config.defaults.model_set?.edit).toBeFalsy();
    });

    it('leaves the default strength unwritten', () => {
      const p = videoRequestPlan(previewStarter(), image({ strength: DEFAULT_STRENGTH }), [SD, KONTEXT], machine)!;
      expect(p.config.scenes[0].strength).toBeUndefined();
    });

    it('is not edited unless the user picks Retoque: the usual model starts from the picture', () => {
      const p = videoRequestPlan(previewStarter(), image(), [SD, KONTEXT], machine)!;
      expect(p.editing).toBeFalsy();
      expect(p.config.scenes[0].init_image).toBe('foto.png');
    });

    it('falls back to starting from the picture when no editing model is installed', () => {
      const p = videoRequestPlan(previewStarter(), image({ style: 'edit' }), [SD], machine)!;
      expect(p.editing).toBeFalsy();
      expect(p.config.scenes[0].init_image).toBe('foto.png');
    });

    it('never picks the editing model for a request without a picture', () => {
      const p = videoRequestPlan(previewStarter(), image({ style: 'edit', picture: undefined }), [SD, KONTEXT], machine)!;
      expect(p.editing).toBeFalsy();
      expect(p.config.defaults.model_set?.edit).toBeFalsy();
    });

    it('keeps the shape of the picture in about the pixels the model was measured at', () => {
      expect(editResolution({ width: 1920, height: 1080 }, '1024x576')).toBe('1024x576');
      expect(editResolution({ width: 1080, height: 1920 }, '1024x576')).toBe('576x1024');
      expect(editResolution(undefined, '1024x576')).toBe('1024x576');
    });
  });

  it('names the generator in the project and skips the ACE-Step levels for the others', () => {
    const starter = { defaults: {}, output: { mode: 'video' }, scenes: [] } as unknown as Parameters<typeof musicConfig>[0];
    const machine = { vramMb: 12288, gpuName: 'x', gpuCount: 1, ramGb: 32, speed: 1 } as Parameters<typeof musicConfig>[3];
    const d = { ...draftFromText('x', 'music', 'Mi canción'), generator: 'diffrhythm2' as const, tags: 'pop,piano' };
    const cfg = musicConfig(starter, d, [], machine);
    expect(cfg.defaults.music).toEqual({ generator: 'diffrhythm2' });
    expect(cfg.tracks?.[0].tags).toBe('pop,piano');
    expect(musicConfig(starter, { ...d, generator: 'auto' }, [], machine).defaults.music?.generator).toBeUndefined();
  });
});

describe('levels, animated graphics and one song', () => {
  afterEach(() => vi.unstubAllGlobals());
  const machine = machineOf([{ index: 0, name: 'GPU', free_vram_mb: 12282, total_vram_mb: 12282 }], { total_bytes: 30 * 2 ** 30, available_bytes: 25 * 2 ** 30 });

  it('scales a resolution to a level in multiples of 32, never below 256 nor above the original', () => {
    expect(scaleResolution('1280x720', 'auto')).toBe('1280x720');
    expect(scaleResolution('1280x720', 'high')).toBe('1280x720');
    expect(scaleResolution('1280x720', 'normal')).toBe('960x544');
    expect(scaleResolution('1280x720', 'draft')).toBe('640x352');
    expect(scaleResolution('384x256', 'draft')).toBe('256x256');
    expect(scaleResolution('200x200', 'draft')).toBe('200x200');
  });

  it('starts at draft on a narrow screen, automatic on a wide one, and always draft for a song', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(defaultLevel('video')).toBe('draft');
    expect(defaultLevel('image')).toBe('draft');
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(defaultLevel('video')).toBe('auto');
    expect(defaultLevel('music')).toBe('draft');
  });

  it('writes an animated graphic as one motion scene with no picture model, at the level chosen', () => {
    const d = { ...draftFromText('tres ideas sobre fondo azul', 'video', 'Ideas'), animation: 'graphic' as const, resolution: 'draft' as const };
    const plan = videoRequestPlan(previewStarter(), d, [], machine)!;
    expect(plan.graphic).toBe(true);
    expect(plan.config.scenes).toHaveLength(1);
    expect(plan.config.scenes[0].motion_graphic).toBe('tres ideas sobre fondo azul');
    expect(plan.config.scenes[0].animate).toBeUndefined();
    expect(plan.config.defaults.resolution).toBe('640x352');
    expect(plan.config.defaults.animate).toBeUndefined();
  });

  it('a graphic with speech is narrated', () => {
    const d = { ...draftFromText('título', 'video', 'T'), animation: 'graphic' as const, speech: 'hola a todos' };
    expect(videoRequestPlan(previewStarter(), d, [], machine)?.speechBy).toBe('narration');
  });

  it('a song is one version of each track', () => {
    expect(trackFor(draftFromText('x', 'music', 'S')).variants).toBe(1);
  });
});
