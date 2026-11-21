import { CatalogEntry, ProjectConfig } from '../core/api.models';
import { fakeStorage } from '../core/storage-fake';
import {
  activeSceneTier,
  chosenModelEntry,
  activeTier,
  applyMiniMaxMode,
  ltxEntry,
  miniMaxEntry,
  miniMaxFirstFrameEntry,
  animateEngine,
  applyAnimateEngine,
  applySceneTier,
  undoAnimateEngine,
  clearSceneQuality,
  undoSceneTier,
  applyStyleEntry,
  applyTier,
  derivedTier,
  fitResolution,
  loadOverrides,
  pickStyleEntry,
  stylesOf,
  styleLabel,
  styleHelp,
  pickWanEntry,
  saveOverrides,
  scaleResolution,
  tierValues,
  undoTier,
} from './quality-tiers';

const entry = (over: Partial<CatalogEntry>): CatalogEntry => ({
  id: 'x',
  kind: 'model',
  name: 'X',
  description: '',
  size_bytes: 1,
  files: [],
  installed: true,
  ...over,
});

const KREA = entry({
  id: 'krea',
  name: 'Krea',
  styles: ['photo'],
  style_rank: 2,
  preset: { steps: 8, cfg_scale: 1, resolution: '1024x576' },
  files: [
    { name: 'krea.gguf', role: 'model', url: '' },
    { name: 'qwen.gguf', role: 'text_encoder', url: '' },
    { name: 'vae.safetensors', role: 'vae', url: '' },
  ],
});
const INTO = entry({ ...KREA, id: 'into', name: 'IntoRealism', style_rank: 1, files: [{ name: 'into.safetensors', role: 'model', url: '' }, ...KREA.files.slice(1)] });
const JUGG = entry({ id: 'jugg', styles: ['photo'], style_rank: 3, preset: { steps: 25 }, files: [{ name: 'jugg.safetensors', role: 'model', url: '' }] });
const PONY = entry({ id: 'pony', styles: ['anime'], style_rank: 1, preset: { steps: 25 }, files: [{ name: 'pony.safetensors', role: 'model', url: '' }] });
const wan = (id: string, quality: string, hi = false): CatalogEntry =>
  entry({
    id,
    kind: 'video',
    name: id,
    quality,
    files: [
      { name: `${id}.gguf`, role: 'model', url: '' },
      ...(hi ? [{ name: `${id}-hi.gguf`, role: 'high_noise_model', url: '' }] : []),
      { name: 't5.gguf', role: 'text_encoder', url: '' },
      { name: 'wan.vae', role: 'vae', url: '' },
    ],
  });
const WAN_LOW = wan('wan5q4', 'low');
const WAN_MED = wan('wan5q8', 'medium');
const WAN_HIGH = wan('wan14', 'high', true);
const CATALOG = [JUGG, PONY, KREA, INTO, WAN_LOW, WAN_MED, WAN_HIGH];

function cfg(over: Partial<ProjectConfig['output']> = {}): ProjectConfig {
  return {
    project: 'p',
    output: { mode: 'images', file: '', contact_sheet: false, ...over },
    defaults: {
      model: '',
      model_set: { diffusion_model: 'models/krea.gguf', llm: 'models/qwen.gguf', vae: 'models/vae.safetensors' },
      voice: '',
      resolution: '800x800',
      sampler: 'euler',
      steps: 3,
      fps: 24,
      subject_prompt: '',
      negative_prompt: '',
      lora_model_dir: '',
    },
    scenes: [
      { id: 'a', prompt: 'a', negative_prompt: '', tts_text: '', speed: 1, lora: 'old.safetensors', variants: 7 },
      { id: 'b', prompt: 'b', negative_prompt: '', tts_text: '', speed: 1, lora: '', image: 'mine.png' },
    ],
  };
}

describe('quality tiers', () => {
  it('fits a resolution to a pixel limit, keeping the shape in multiples of 64', () => {
    expect(fitResolution('1280x704', 2_000_000)).toBe('1280x704');
    const fitted = fitResolution('1280x704', 800_000);
    const [w, h] = fitted.split('x').map(Number);
    expect([w % 64, h % 64]).toEqual([0, 0]);
    expect(w * h).toBeLessThanOrEqual(800_000);
    expect(w / h).toBeGreaterThan(1.6);
  });

  it('a level never asks for more pixels than the card can hold when the limit is given', () => {
    const base = cfg();
    const free = applyTier(base, 'high', CATALOG, {});
    const limited = applyTier(base, 'high', CATALOG, {}, 800_000);
    const px = (r: string) => r.split('x').map(Number).reduce((a, b) => a * b, 1);
    expect(px(free.config.defaults.resolution)).toBeGreaterThan(800_000);
    expect(px(limited.config.defaults.resolution)).toBeLessThanOrEqual(800_000);
    expect(limited.note[0]).toBe(limited.config.defaults.resolution);
    expect(limited.config.defaults.steps).toBe(free.config.defaults.steps); // only the size changes
  });

  it('the same for the quality of one scene', () => {
    const base = cfg();
    const free = applySceneTier(base, 0, 'high', CATALOG, {})!;
    const limited = applySceneTier(base, 0, 'high', CATALOG, {}, 800_000)!;
    const px = (r: string) => r.split('x').map(Number).reduce((a, b) => a * b, 1);
    expect(px(free.config.scenes[0].render!.resolution!)).toBeGreaterThan(800_000);
    expect(px(limited.config.scenes[0].render!.resolution!)).toBeLessThanOrEqual(800_000);
  });

  it('rounds the scaled sides to multiples', () => {
    expect(scaleResolution('1024x576', 1.25, 64)).toBe('1280x704');
    expect(scaleResolution('1024x576', 0.75, 64)).toBe('768x448');
    expect(scaleResolution('832x480', 1.25, 16)).toBe('1040x608');
    expect(scaleResolution('bad', 2, 64)).toBe('bad');
  });

  it('derives from the preset, or from sd defaults without one', () => {
    expect(derivedTier('high', KREA.preset)).toMatchObject({ resolution: '1280x704', steps: 12, variants: 4 });
    expect(derivedTier('low', KREA.preset).steps).toBe(4);
    expect(derivedTier('medium', null)).toMatchObject({ resolution: '512x512', steps: 20 });
  });

  it('uses customizations and treats empty fields as derived', () => {
    const v = tierValues('high', KREA.preset, { high: { steps: 30, resolution: '', lora: 'l.safetensors' } });
    expect(v).toMatchObject({ steps: 30, resolution: '1280x704', lora: 'l.safetensors' });
  });

  it('picks the best installed model of a style', () => {
    expect(pickStyleEntry(CATALOG, 'photo')?.id).toBe('into');
    expect(pickStyleEntry([JUGG, { ...INTO, installed: false }, KREA], 'photo')?.id).toBe('krea');
    expect(pickStyleEntry(CATALOG, 'anime')?.id).toBe('pony');
    expect(pickStyleEntry(CATALOG, 'general')).toBeNull();
  });

  it('offers a look an installed model declares beyond the built-in ones, and only while one is installed', () => {
    const extra: CatalogEntry = { ...JUGG, id: 'extra', styles: ['special'], installed: true };
    expect(stylesOf(CATALOG)).toEqual(['photo', 'anime', 'general']);
    expect(stylesOf([...CATALOG, extra])).toEqual(['photo', 'anime', 'general', 'special']);
    expect(stylesOf([...CATALOG, { ...extra, installed: false }])).toEqual(['photo', 'anime', 'general']);
    expect(pickStyleEntry([...CATALOG, extra], 'special')?.id).toBe('extra');
    expect(styleLabel('special')).toBe('SPECIAL');
    expect(styleHelp('special')).not.toBe(styleHelp('auto'));
  });

  it('labels the project adult when the model is made for adults, and otherwise leaves the label alone', () => {
    const base = { ...cfg(), adult: false };
    expect(applyStyleEntry(base, { ...PONY, adult: true }).adult).toBe(true);
    expect(applyStyleEntry(base, PONY).adult).toBe(false);
    expect(applyStyleEntry(cfg(), PONY).adult).toBeUndefined();
    expect(base.adult).toBe(false); // input untouched
  });

  it('writes a model set for a bundle and a checkpoint otherwise', () => {
    const base = cfg();
    const set = applyStyleEntry(base, INTO);
    expect(set.defaults.model).toBe('');
    expect(set.defaults.model_set).toMatchObject({ diffusion_model: 'models/into.safetensors', llm: 'models/qwen.gguf', cfg_scale: 1 });
    expect(set.defaults).toMatchObject({ steps: 8, resolution: '1024x576' });
    const ck = applyStyleEntry(base, PONY);
    expect(ck.defaults.model).toBe('models/pony.safetensors');
    expect(ck.defaults.model_set).toBeUndefined();
    expect(base.defaults.model_set?.diffusion_model).toBe('models/krea.gguf'); // input untouched
  });

  it('applies a level to the defaults and the scenes that generate (images)', () => {
    const r = applyTier(cfg(), 'high', CATALOG, { high: { lora: 'l.safetensors' } });
    expect(r.config.defaults).toMatchObject({ resolution: '1280x704', steps: 12 });
    expect(r.config.defaults.model_set?.cfg_scale).toBe(1);
    expect(r.config.scenes[0]).toMatchObject({ variants: 4, lora: 'l.safetensors' });
    expect(r.config.scenes[1]).toMatchObject({ lora: '' }); // own picture: skipped
    expect(r.config.scenes[1].variants).toBeUndefined();
    expect(r.config.defaults.animate).toBeUndefined();
  });

  it('Low then High equals High directly', () => {
    const direct = applyTier(cfg(), 'high', CATALOG).config;
    const low = applyTier(cfg(), 'low', CATALOG).config;
    expect(applyTier(low, 'high', CATALOG).config).toEqual(direct);
  });

  it('writes no variants in video mode but configures the installed Wan', () => {
    const r = applyTier(cfg({ mode: 'video' }), 'high', CATALOG);
    expect(r.config.scenes[0].variants).toBe(7);
    expect(r.config.defaults.animate).toMatchObject({
      diffusion_model: 'models/video/wan14.gguf',
      high_noise_diffusion_model: 'models/video/wan14-hi.gguf',
      t5xxl: 'models/video/t5.gguf',
      vae: 'models/video/wan.vae',
      frames: 49,
      resolution: '1040x608',
      steps: 15,
    });
  });

  it('falls back to the nearest installed Wan and says so', () => {
    const only = [KREA, WAN_LOW];
    expect(pickWanEntry(only, 'high')?.used).toBe('low');
    const r = applyTier(cfg({ mode: 'video' }), 'high', only);
    expect(r.config.defaults.animate?.diffusion_model).toBe('models/video/wan5q4.gguf');
    expect(r.config.defaults.animate?.high_noise_diffusion_model).toBeUndefined();
    expect(r.note.join(' ')).toContain('no está instalado');
  });

  it('leaves the animation alone when no Wan is installed', () => {
    const r = applyTier(cfg({ mode: 'video' }), 'low', [KREA]);
    expect(r.config.defaults.animate).toBeUndefined();
    expect(r.note.join(' ')).toContain('no hay ningún Wan');
  });

  it('undoes exactly what the level wrote', () => {
    for (const mode of ['images', 'video']) {
      const before = cfg({ mode });
      before.defaults.steps = 9;
      const r = applyTier(before, 'high', CATALOG, { high: { lora: 'l.safetensors' } });
      expect(undoTier(r.config, r.undo)).toEqual(before);
    }
  });

  it('undo keeps edits made after the level', () => {
    const r = applyTier(cfg(), 'low', CATALOG);
    const edited = structuredClone(r.config);
    edited.defaults.sampler = 'dpm++2m';
    expect(undoTier(edited, r.undo).defaults.sampler).toBe('dpm++2m');
  });

  it('restores an existing animation block field by field', () => {
    const before = cfg({ mode: 'video' });
    before.defaults.animate = { diffusion_model: 'models/video/mine.gguf', t5xxl: 't', vae: 'v', cfg_scale: 5 };
    const r = applyTier(before, 'medium', CATALOG);
    expect(undoTier(r.config, r.undo).defaults.animate).toEqual(before.defaults.animate);
  });

  it('keeps customizations in localStorage and survives it failing', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    saveOverrides({ high: { steps: 30 } });
    expect(loadOverrides()).toEqual({ high: { steps: 30 } });
    saveOverrides({});
    expect(loadOverrides()).toEqual({});
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadOverrides()).toEqual({});
    vi.unstubAllGlobals();
  });
});

describe('one scene\'s quality', () => {
  const scenes = () => cfg().scenes;
  const project = (mode = 'video', animate = false): ProjectConfig => {
    const c = cfg({ mode });
    c.scenes = [
      { id: 'a', prompt: 'a', negative_prompt: '', tts_text: '', speed: 1, lora: '', animate },
      { id: 'b', prompt: 'b', negative_prompt: '', tts_text: '', speed: 1, lora: '', variants: 3 },
    ];
    return c;
  };

  it('gives only that scene its render, from the model preset, and leaves the project and the others alone', () => {
    const before = project();
    const r = applySceneTier(before, 0, 'high', CATALOG)!;
    expect(r.config.scenes[0].render).toEqual({ resolution: '1280x704', steps: 12 });
    expect(r.config.scenes[1].render).toBeUndefined();
    expect(r.config.defaults).toEqual(before.defaults); // not the project's
    expect(before.scenes[0].render).toBeUndefined(); // the input is not modified
    expect(r.note.join(' ')).toContain('1280x704');
  });

  it('does not depend on what the scene had: Low then High equals High', () => {
    const low = applySceneTier(project(), 0, 'low', CATALOG)!.config;
    expect(applySceneTier(low, 0, 'high', CATALOG)!.config.scenes[0].render).toEqual({ resolution: '1280x704', steps: 12 });
  });

  it('an animated scene also gets its Wan settings; a scene that does not animate does not', () => {
    const animated = applySceneTier(project('video', true), 0, 'high', CATALOG)!.config.scenes[0];
    expect(animated.animation).toEqual({ resolution: '1040x608', frames: 49, steps: 30 });
    expect(applySceneTier(project(), 0, 'high', CATALOG)!.config.scenes[0].animation).toBeUndefined();
  });

  it('images mode sets the scene\'s variants and no Wan settings', () => {
    const r = applySceneTier(project('images', true), 1, 'high', CATALOG)!.config.scenes[1];
    expect(r.variants).toBe(4);
    expect(r.animation).toBeUndefined();
  });

  it('uses the customized levels and the LoRA of the level', () => {
    const r = applySceneTier(project(), 0, 'high', CATALOG, { high: { steps: 30, lora: 'l.safetensors' } })!.config.scenes[0];
    expect(r.render?.steps).toBe(30);
    expect(r.lora).toBe('l.safetensors');
  });

  it('«Como el proyecto» removes the scene\'s own settings, and both can be undone', () => {
    const own = applySceneTier(project('video', true), 0, 'high', CATALOG)!;
    const cleared = clearSceneQuality(own.config, 0)!;
    expect(cleared.config.scenes[0].render).toBeUndefined();
    expect(cleared.config.scenes[0].animation).toBeUndefined();
    expect(undoSceneTier(cleared.config, cleared.undo).scenes[0]).toEqual(own.config.scenes[0]);
    expect(undoSceneTier(own.config, own.undo).scenes[0]).toEqual(project('video', true).scenes[0]);
  });

  it('undo finds the scene by its id if it moved', () => {
    const r = applySceneTier(project(), 0, 'low', CATALOG)!;
    const moved = structuredClone(r.config);
    moved.scenes.reverse();
    expect(undoSceneTier(moved, r.undo).scenes.find((s) => s.id === 'a')!.render).toBeUndefined();
  });

  it('an unknown scene changes nothing', () => {
    expect(applySceneTier(project(), 5, 'low', CATALOG)).toBeNull();
    expect(scenes().length).toBeGreaterThan(0);
  });
});

describe('AnimateDiff engine', () => {
  const SD15 = entry({ id: 'sd-1-5', files: [{ name: 'v1-5-pruned-emaonly.safetensors', role: 'model', url: '' }] });
  const MODULE = entry({
    id: 'video-animatediff-sd15-v3',
    kind: 'video',
    name: 'AnimateDiff',
    preset: { steps: 25, cfg_scale: 7, resolution: '512x512' },
    files: [{ name: 'mm_sd15_v3.safetensors', role: 'motion_module', url: '' }],
  });
  const CAT = [SD15, MODULE, WAN_LOW, WAN_MED, WAN_HIGH];
  const video = (animate?: ProjectConfig['defaults']['animate']): ProjectConfig => {
    const c = cfg({ mode: 'video' });
    if (animate) c.defaults.animate = animate;
    return c;
  };
  const AD = { engine: 'animatediff' as const, checkpoint: 'models/sd.safetensors', motion_module: 'models/video/mm.safetensors' };

  it('derives its own levels, with sides multiples of 8', () => {
    expect(tierValues('low', null, {}, false, 'animatediff')).toMatchObject({ wanResolution: '384x384', wanFrames: 8, wanSteps: 12 });
    expect(tierValues('medium', null, {}, false, 'animatediff')).toMatchObject({ wanResolution: '512x512', wanFrames: 16, wanSteps: 25 });
    expect(tierValues('high', null, {}, false, 'animatediff')).toMatchObject({ wanResolution: '640x640', wanFrames: 24, wanSteps: 38 });
    expect(derivedTier('high', null).wanFrames).toBe(49); // Wan unchanged
  });

  it('uses its own customizations, not Wan\'s', () => {
    const o = { high: { adFrames: 20, wanFrames: 61 } };
    expect(tierValues('high', null, o, false, 'animatediff').wanFrames).toBe(20);
    expect(tierValues('high', null, o, false, 'wan').wanFrames).toBe(61);
  });

  it('High writes only resolution, frames and steps and leaves the engine and its files alone', () => {
    const before = video(AD);
    const r = applyTier(before, 'high', CAT);
    expect(r.config.defaults.animate).toEqual({ ...AD, resolution: '640x640', frames: 24, steps: 38 });
    expect(r.note.join(' ')).toContain('AnimateDiff');
    expect(r.note.join(' ')).not.toContain('Wan');
    expect(undoTier(r.config, r.undo)).toEqual(before);
  });

  it('a Wan project still picks its Wan', () => {
    const r = applyTier(video({ diffusion_model: 'a', t5xxl: 'b', vae: 'c' }), 'high', CAT);
    expect(r.config.defaults.animate?.diffusion_model).toBe('models/video/wan14.gguf');
    expect(animateEngine(r.config)).toBe('wan');
  });

  it('a scene gets AnimateDiff values when it animates', () => {
    const c = video(AD);
    c.scenes = [{ id: 'a', prompt: 'a', negative_prompt: '', tts_text: '', speed: 1, lora: '', animate: true }];
    const r = applySceneTier(c, 0, 'low', CAT);
    expect(r?.config.scenes[0].animation).toEqual({ resolution: '384x384', frames: 8, steps: 12 });
    expect(r?.note.join(' ')).toContain('AnimateDiff');
  });

  it('choosing AnimateDiff writes the engine, the module, SD 1.5 and the preset, and Undo restores the Wan block', () => {
    const wanBlock = { diffusion_model: 'models/video/w.gguf', t5xxl: 't', vae: 'v', frames: 33, steps: 20, cfg_scale: 6 };
    const before = video(wanBlock);
    const r = applyAnimateEngine(before, 'animatediff', CAT);
    expect(r.config.defaults.animate).toEqual({
      ...wanBlock,
      engine: 'animatediff',
      checkpoint: 'models/v1-5-pruned-emaonly.safetensors',
      motion_module: 'models/video/mm_sd15_v3.safetensors',
      resolution: '512x512',
      steps: 25,
      cfg_scale: 7,
      frames: undefined,
    });
    expect(r.config.defaults.animate?.frames).toBeUndefined(); // 33 would be invalid for AnimateDiff
    expect(r.moduleMissing).toBe(false);
    expect(undoAnimateEngine(r.config, r.undo, true)).toEqual(before);
    expect(before.defaults.animate).toEqual(wanBlock); // the input is not modified
  });

  it('flags a motion module that is not installed but still writes it', () => {
    const r = applyAnimateEngine(video({ diffusion_model: '', t5xxl: '', vae: '' }), 'animatediff', [SD15, { ...MODULE, installed: false }]);
    expect(r.config.defaults.animate?.motion_module).toBe('models/video/mm_sd15_v3.safetensors');
    expect(r.moduleMissing).toBe(true);
  });

  it('without SD 1.5 installed the checkpoint is left for the user', () => {
    const r = applyAnimateEngine(video(), 'animatediff', [MODULE]);
    expect(r.config.defaults.animate?.checkpoint).toBeUndefined();
  });

  it('back to Wan keeps the AnimateDiff files and clears the shared settings; undoing a block that did not exist removes it', () => {
    const r = applyAnimateEngine(video({ ...AD, frames: 16, steps: 25 }), 'wan', CAT);
    expect(r.config.defaults.animate).toMatchObject({ engine: 'wan', checkpoint: AD.checkpoint, motion_module: AD.motion_module });
    expect(r.config.defaults.animate?.frames).toBeUndefined();
    const fresh = applyAnimateEngine(video(), 'animatediff', CAT);
    expect(undoAnimateEngine(fresh.config, fresh.undo, false).defaults.animate).toBeUndefined();
  });

  describe('LTX 2.3', () => {
    const LTX = entry({
      id: 'video-ltx-2-3-distilled-q4',
      kind: 'video',
      name: 'LTX 2.3',
      preset: { steps: 8, cfg_scale: 1, resolution: '768x416' },
      files: [
        { name: 'ltx.gguf', role: 'model', url: '' },
        { name: 'gemma.gguf', role: 'text_encoder', url: '' },
        { name: 'ltxvae.safetensors', role: 'vae', url: '' },
        { name: 'ltxavae.safetensors', role: 'audio_vae', url: '' },
        { name: 'conn.safetensors', role: 'connectors', url: '' },
      ],
    });
    const H3 = entry({
      id: 'video-minimax-h3-ref2va-q4',
      kind: 'video',
      name: 'MiniMax H3',
      preset: { steps: 20, cfg_scale: 1, resolution: '864x480' },
      files: [
        { name: 'dit.gguf', role: 'model', url: '' },
        { name: 'enc.gguf', role: 'text_encoder', url: '' },
        { name: 'vae.safetensors', role: 'vae', url: '' },
        { name: 'avae.safetensors', role: 'audio_vae', url: '' },
      ],
    });
    const wanBlock = { diffusion_model: 'models/video/w.gguf', t5xxl: 't', vae: 'v', frames: 33, steps: 10, cfg_scale: 6, high_noise_diffusion_model: 'models/video/hn.gguf', high_noise_steps: 8 };

    it('choosing it writes the five files and the preset, and Undo restores the Wan block exactly', () => {
      const before = video(wanBlock);
      const r = applyAnimateEngine(before, 'ltx-2.3', [LTX]);
      expect(r.config.defaults.animate).toEqual({
        engine: 'ltx-2.3',
        diffusion_model: 'models/video/ltx.gguf',
        llm: 'models/video/gemma.gguf',
        vae: 'models/video/ltxvae.safetensors',
        audio_vae: 'models/video/ltxavae.safetensors',
        connectors: 'models/video/conn.safetensors',
        resolution: '768x416',
        steps: 8,
        cfg_scale: 1,
      });
      expect(r.ltxMissing).toBe(false);
      expect(r.miniMaxMissing).toBe(false);
      expect(r.note).toContain('LTX 2.3');
      expect(undoAnimateEngine(r.config, r.undo, true)).toEqual(before);
      expect(before.defaults.animate).toEqual(wanBlock);
    });

    it('flags a bundle that is not installed', () => {
      expect(applyAnimateEngine(video(wanBlock), 'ltx-2.3', [{ ...LTX, installed: false }]).ltxMissing).toBe(true);
      expect(applyAnimateEngine(video(wanBlock), 'ltx-2.3', []).ltxMissing).toBe(true);
    });

    it('drops the H3-only keys when it replaces MiniMax H3', () => {
      const h3 = applyAnimateEngine(video(wanBlock), 'minimax-h3', [H3]).config;
      h3.defaults.animate!.lora = 'models/video/turbo.safetensors';
      h3.defaults.animate!.first_frame = true;
      const a = applyAnimateEngine(h3, 'ltx-2.3', [LTX, H3]).config.defaults.animate!;
      expect(a.lora).toBeUndefined();
      expect(a.first_frame).toBeUndefined();
      expect(a.connectors).toBe('models/video/conn.safetensors');
    });

    it('leaving it clears its files, including the connectors', () => {
      const ltx = applyAnimateEngine(video(wanBlock), 'ltx-2.3', [LTX]).config;
      for (const engine of ['wan', 'minimax-h3', 'animatediff'] as const) {
        const a = applyAnimateEngine(ltx, engine, [LTX, H3]).config.defaults.animate!;
        expect(a.connectors).toBeUndefined();
        if (engine === 'wan') for (const k of ['diffusion_model', 'vae', 'llm', 'audio_vae'] as const) expect(a[k]).toBeUndefined();
      }
    });

    it('tells the two bundles apart by the connectors file, whatever the catalog order', () => {
      expect(ltxEntry([H3, LTX])?.id).toBe('video-ltx-2-3-distilled-q4');
      expect(ltxEntry([H3])).toBeNull();
      expect(miniMaxEntry([LTX, H3])?.id).toBe('video-minimax-h3-ref2va-q4');
      expect(miniMaxEntry([LTX])).toBeNull();
      expect(miniMaxFirstFrameEntry([LTX, H3])).toBeNull();
      const a = applyAnimateEngine(video(wanBlock), 'minimax-h3', [LTX, H3]).config.defaults.animate!;
      expect(a.diffusion_model).toBe('models/video/dit.gguf');
      expect(a.connectors).toBeUndefined();
    });

    it('animateEngine knows it', () => {
      expect(animateEngine(video({ engine: 'ltx-2.3' }))).toBe('ltx-2.3');
    });
  });

  describe('MiniMax H3', () => {
    const H3 = entry({
      id: 'video-minimax-h3-ref2va-q4',
      kind: 'video',
      name: 'MiniMax H3',
      preset: { steps: 20, cfg_scale: 1, resolution: '864x480' },
      files: [
        { name: 'dit.gguf', role: 'model', url: '' },
        { name: 'enc.gguf', role: 'text_encoder', url: '' },
        { name: 'vae.safetensors', role: 'vae', url: '' },
        { name: 'avae.safetensors', role: 'audio_vae', url: '' },
        { name: 'turbo.safetensors', role: 'lora', url: '' },
      ],
    });
    const wanBlock = { diffusion_model: 'models/video/w.gguf', t5xxl: 't', vae: 'v', frames: 33, steps: 10, cfg_scale: 6, high_noise_diffusion_model: 'models/video/hn.gguf', high_noise_steps: 8 };

    it('choosing it writes the four files and the preset, never the LoRA, and Undo restores the Wan block', () => {
      const before = video(wanBlock);
      const r = applyAnimateEngine(before, 'minimax-h3', [H3]);
      expect(r.config.defaults.animate).toEqual({
        engine: 'minimax-h3',
        diffusion_model: 'models/video/dit.gguf',
        llm: 'models/video/enc.gguf',
        vae: 'models/video/vae.safetensors',
        audio_vae: 'models/video/avae.safetensors',
        resolution: '864x480',
        steps: 20,
        cfg_scale: 1,
      });
      expect(r.miniMaxMissing).toBe(false);
      expect(undoAnimateEngine(r.config, r.undo, true)).toEqual(before);
      expect(before.defaults.animate).toEqual(wanBlock);
    });

    it('flags a bundle that is not installed and leaves the files alone when the catalog has none', () => {
      expect(applyAnimateEngine(video(wanBlock), 'minimax-h3', [{ ...H3, installed: false }]).miniMaxMissing).toBe(true);
      const r = applyAnimateEngine(video(wanBlock), 'minimax-h3', []);
      expect(r.miniMaxMissing).toBe(true);
      expect(r.config.defaults.animate?.diffusion_model).toBe('models/video/w.gguf');
    });

    it('leaving it clears its files, so Wan does not inherit the H3 DiT', () => {
      const h3 = applyAnimateEngine(video(wanBlock), 'minimax-h3', [H3]).config;
      h3.defaults.animate!.lora = 'models/video/turbo.safetensors';
      const wan = applyAnimateEngine(h3, 'wan', [H3]).config.defaults.animate!;
      expect(wan.engine).toBe('wan');
      for (const k of ['diffusion_model', 'vae', 'llm', 'audio_vae', 'lora'] as const) expect(wan[k]).toBeUndefined();
    });

    const FF = entry({
      id: 'video-minimax-h3-fl2va-q4',
      kind: 'video',
      name: 'MiniMax H3 first frame',
      preset: { steps: 20, cfg_scale: 1, resolution: '864x480' },
      files: [
        { name: 'fl2va.gguf', role: 'model', url: '' },
        { name: 'enc.gguf', role: 'text_encoder', url: '' },
        { name: 'vae.safetensors', role: 'vae', url: '' },
        { name: 'avae.safetensors', role: 'audio_vae', url: '' },
        { name: 'fl2v8.safetensors', role: 'lora', url: '' },
      ],
    });

    it('the two bundles are told apart by their DiT', () => {
      expect(miniMaxEntry([FF, H3])?.id).toBe('video-minimax-h3-ref2va-q4');
      expect(miniMaxFirstFrameEntry([H3, FF])?.id).toBe('video-minimax-h3-fl2va-q4');
      expect(miniMaxFirstFrameEntry([H3])).toBeNull();
    });

    it('choosing the engine uses the first-frame bundle when it is installed, and the reference one otherwise', () => {
      const ff = applyAnimateEngine(video(wanBlock), 'minimax-h3', [H3, FF]).config.defaults.animate!;
      expect([ff.first_frame, ff.diffusion_model]).toEqual([true, 'models/video/fl2va.gguf']);
      const ref = applyAnimateEngine(video(wanBlock), 'minimax-h3', [H3, { ...FF, installed: false }]).config.defaults.animate!;
      expect([ref.first_frame, ref.diffusion_model]).toEqual([undefined, 'models/video/dit.gguf']);
      const wan = applyAnimateEngine(applyAnimateEngine(video(wanBlock), 'minimax-h3', [H3, FF]).config, 'wan', [H3, FF]).config.defaults.animate!;
      expect(wan.first_frame).toBeUndefined();
    });

    it('switching the mode swaps the DiT and the LoRA together and keeps the rest, without touching the input', () => {
      const ref = applyAnimateEngine(video(wanBlock), 'minimax-h3', [H3]).config;
      ref.defaults.animate!.lora = 'models/video/turbo.safetensors';
      ref.defaults.animate!.steps = 4;
      const r = applyMiniMaxMode(ref, true, [H3, FF]);
      expect(r.config.defaults.animate).toMatchObject({ first_frame: true, diffusion_model: 'models/video/fl2va.gguf', lora: 'models/video/fl2v8.safetensors', llm: 'models/video/enc.gguf' });
      expect(r.config.defaults.animate!.steps).toBeUndefined(); // the LoRA's own default steps come back
      expect(r.missing).toBe(false);
      expect(ref.defaults.animate!.first_frame).toBeUndefined();
      const back = applyMiniMaxMode(r.config, false, [H3, FF]).config.defaults.animate!;
      expect([back.first_frame, back.diffusion_model, back.lora]).toEqual([undefined, 'models/video/dit.gguf', 'models/video/turbo.safetensors']);
      expect(applyMiniMaxMode(r.config, true, [H3, { ...FF, installed: false }]).missing).toBe(true);
      // another engine is left alone
      expect(applyMiniMaxMode(video(wanBlock), true, [H3, FF]).config.defaults.animate).toEqual(wanBlock);
    });
  });
});

describe('the level in use', () => {
  it('is the one the project has applied, and none before any (or after a manual change)', () => {
    const base = cfg();
    expect(activeTier(base, CATALOG, {})).toBeNull();
    for (const tier of ['low', 'medium', 'high'] as const) {
      const applied = applyTier(base, tier, CATALOG, {}).config;
      expect(activeTier(applied, CATALOG, {})).toBe(tier);
    }
    const edited = applyTier(base, 'high', CATALOG, {}).config;
    edited.defaults.steps += 1;
    expect(activeTier(edited, CATALOG, {})).toBeNull();
  });

  it('only one level is in use at a time', () => {
    const applied = applyTier(cfg(), 'medium', CATALOG, {}).config;
    const used = (['low', 'medium', 'high'] as const).filter((t) => activeTier(applied, CATALOG, {}) === t);
    expect(used).toEqual(['medium']);
  });

  it('is the level a scene has applied, and none when it follows the project', () => {
    const base = cfg();
    expect(activeSceneTier(base, 0, CATALOG, {})).toBeNull();
    const applied = applySceneTier(base, 0, 'low', CATALOG, {})!.config;
    expect(activeSceneTier(applied, 0, CATALOG, {})).toBe('low');
    expect(activeSceneTier(applied, 1, CATALOG, {})).toBeNull();
    const changed = structuredClone(applied);
    changed.scenes[0].render!.steps = 99;
    expect(activeSceneTier(changed, 0, CATALOG, {})).toBeNull();
  });
});

describe('the model a project uses', () => {
  it('finds a checkpoint whose catalog file has no role (SD 1.5, SDXL), so its style is the one pressed', () => {
    const sdxl = entry({ id: 'sdxl', styles: ['general'], style_rank: 1, files: [{ name: 'sd_xl_base_1.0.safetensors', url: '' }] });
    const cfg = { defaults: { model: 'models/sd_xl_base_1.0.safetensors' } } as unknown as ProjectConfig;
    expect(chosenModelEntry(cfg, [JUGG, sdxl])?.id).toBe('sdxl');
  });

  it('writes a checkpoint with no role as the model when its style is applied (General), not an empty path', () => {
    const sdxl = entry({ id: 'sdxl', styles: ['general'], style_rank: 1, files: [{ name: 'sd_xl_base_1.0.safetensors', url: '' }] });
    const cfg = { defaults: { model: 'models/other.safetensors', steps: 20, resolution: '512x512' }, scenes: [] } as unknown as ProjectConfig;
    const out = applyStyleEntry(cfg, sdxl);
    expect(out.defaults.model).toBe('models/sd_xl_base_1.0.safetensors');
    expect(chosenModelEntry(out, [JUGG, sdxl])?.id).toBe('sdxl');
  });
});
