import { CatalogEntry, GpuStatus, ProjectConfig } from '../core/api.models';
import { AutoMachine, BUDGETS, describePlan, durationText, easyConfigForNewProject, easyPlanForNewProject, estimateSeconds, fitResolution, machineOf, maxPicturePixels, pictureSeconds, planAuto, videoOptionsFor } from './auto-plan';

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

const INTO = entry({
  id: 'into',
  name: 'IntoRealism',
  styles: ['photo'],
  style_rank: 1,
  vram_mb: 14336,
  preset: { steps: 8, cfg_scale: 1, resolution: '1024x576' },
  timing: { seconds: 19, resolution: '1024x576', steps: 8, measured: true },
  files: [
    { name: 'into.safetensors', role: 'model', url: '' },
    { name: 'qwen.gguf', role: 'text_encoder', url: '' },
    { name: 'vae.safetensors', role: 'vae', url: '' },
  ],
});
const SD15 = entry({ id: 'sd-1-5', styles: ['general'], style_rank: 2, vram_mb: 4096, timing: { seconds: 4, resolution: '512x512', steps: 20, measured: false }, files: [{ name: 'sd15.safetensors', role: 'model', url: '' }] });
const wan = (id: string, quality: string, seconds: number, steps: number, vram: number, hi = false): CatalogEntry =>
  entry({
    id,
    kind: 'video',
    name: id,
    quality,
    vram_mb: vram,
    timing: { seconds, resolution: '832x480', steps, frames: 33, measured: true },
    files: [
      { name: `${id}.gguf`, role: 'model', url: '' },
      ...(hi ? [{ name: `${id}-hi.gguf`, role: 'high_noise_model', url: '' }] : []),
      { name: 't5.gguf', role: 'text_encoder', url: '' },
      { name: 'wan.vae', role: 'vae', url: '' },
    ],
  });
const WAN_LOW = wan('wan5q4', 'low', 85, 20, 6144);
const WAN_MED = wan('wan5q8', 'medium', 85, 20, 8192);
const WAN_HIGH = wan('wan14', 'high', 680, 10, 11264, true);
const H3 = entry({
  id: 'h3',
  kind: 'video',
  name: 'MiniMax H3',
  vram_mb: 14336,
  min_ram_gb: 24,
  preset: { steps: 20, cfg_scale: 1, resolution: '864x480' },
  timing: { seconds: 258, resolution: '864x480', steps: 20, frames: 56, turbo_seconds: 96, turbo_steps: 4, measured: true },
  files: [
    { name: 'dit.gguf', role: 'model', url: '' },
    { name: 'enc.gguf', role: 'text_encoder', url: '' },
    { name: 'v.safetensors', role: 'vae', url: '' },
    { name: 'a.safetensors', role: 'audio_vae', url: '' },
    { name: 'turbo.safetensors', role: 'lora', url: '' },
  ],
});
const LTX = entry({
  id: 'ltx',
  kind: 'video',
  name: 'LTX 2.3',
  vram_mb: 11520,
  min_ram_gb: 24,
  preset: { steps: 8, cfg_scale: 1, resolution: '768x416' },
  timing: { seconds: 145, resolution: '768x416', steps: 8, frames: 49, measured: true },
  files: [
    { name: 'ltx.gguf', role: 'model', url: '' },
    { name: 'gemma.gguf', role: 'text_encoder', url: '' },
    { name: 'lv.safetensors', role: 'vae', url: '' },
    { name: 'la.safetensors', role: 'audio_vae', url: '' },
    { name: 'conn.safetensors', role: 'connectors', url: '' },
  ],
});
const CATALOG = [INTO, SD15, WAN_LOW, WAN_MED, WAN_HIGH, H3];

const gpu = (name: string, totalMb: number, freeMb = totalMb): GpuStatus => ({ index: 0, name, free_vram_mb: freeMb, total_vram_mb: totalMb });
const BIG = machineOf([gpu('NVIDIA GeForce RTX 5060 Ti', 16311)], { total_bytes: 30 * 2 ** 30, available_bytes: 25 * 2 ** 30 });
const SMALL = machineOf([gpu('NVIDIA GeForce RTX 4070', 12282)], { total_bytes: 30 * 2 ** 30, available_bytes: 25 * 2 ** 30 });

function project(mode: 'video' | 'images', scenes: number, animated: boolean): ProjectConfig {
  return {
    project: 'p',
    output: { mode, file: '', contact_sheet: false },
    defaults: { model: '', voice: '', resolution: '1024x576', sampler: 'euler', steps: 8, fps: 24, subject_prompt: '', negative_prompt: '', lora_model_dir: '' },
    scenes: Array.from({ length: scenes }, (_, i) => ({ id: `s${i}`, prompt: 'p', negative_prompt: '', tts_text: '', speed: 1, lora: '', silence_seconds: 2, animate: animated })),
  };
}

describe('the machine', () => {
  it('knows the reference card and guesses the unknown ones', () => {
    expect(BIG).toMatchObject({ vramMb: 16311, ramGb: 30, speed: 1, speedGuessed: false });
    expect(machineOf([gpu('NVIDIA Something New', 8000)], null)).toMatchObject({ speed: 1.5, speedGuessed: true, ramGb: null });
    expect(machineOf([], null)).toMatchObject({ vramMb: 0, speed: 20 });
  });

  it('prefers the speed measured in the machine\'s own runs to the table, and says how many it comes from', () => {
    const m = machineOf([{ ...gpu('NVIDIA GeForce RTX 5060 Ti', 16311), speed_factor: 2.5, speed_samples: 6 }], null);
    expect(m).toMatchObject({ speed: 2.5, speedGuessed: false, speedMeasured: 6 });
    expect(machineOf([gpu('NVIDIA GeForce RTX 5060 Ti', 16311)], null)).toMatchObject({ speed: 1, speedMeasured: 0 });
    const unknown = machineOf([{ ...gpu('NVIDIA Something New', 8000), speed_factor: 0.8, speed_samples: 3 }], null);
    expect(unknown).toMatchObject({ speed: 0.8, speedGuessed: false });
    // a slower machine takes proportionally longer
    const slow = planAuto(project('video', 3, false), CATALOG, { ...BIG, speed: 2 }, null);
    const fast = planAuto(project('video', 3, false), CATALOG, BIG, null);
    expect(slow.seconds).toBeGreaterThan(fast.seconds * 1.8);
  });

  it('picks the biggest card and uses its total memory, not what the desktop leaves free', () => {
    const m = machineOf([gpu('NVIDIA GeForce RTX 4070', 12282, 3000), { index: 1, name: 'NVIDIA GeForce RTX 5060 Ti', free_vram_mb: 15000, total_vram_mb: 16311 }], null);
    expect(m).toMatchObject({ vramMb: 16311, gpuName: 'NVIDIA GeForce RTX 5060 Ti', gpuCount: 2 });
  });
});

describe('time', () => {
  it('scales a picture by pixels and steps', () => {
    expect(pictureSeconds(INTO, '1024x576', 8)).toBe(19);
    expect(pictureSeconds(INTO, '1024x576', 4)).toBeCloseTo(9.5);
    expect(pictureSeconds(INTO, '2048x1152', 8)).toBeCloseTo(76);
  });

  it('estimates a project from what its models take, times the card factor', () => {
    const c = planAuto(project('video', 2, false), CATALOG, BIG, null).config;
    const one = estimateSeconds(c, CATALOG, 1);
    expect(Math.abs(estimateSeconds(c, CATALOG, 2) - 2 * one)).toBeLessThanOrEqual(1);
    expect(one).toBeGreaterThan(40);
  });

  it('writes the estimate as minutes and hours', () => {
    expect(durationText(20)).toBe('≈ 1 min');
    expect(durationText(45 * 60)).toBe('≈ 45 min');
    expect(durationText(80 * 60)).toBe('≈ 1 h 20 min');
    expect(durationText(3 * 3600)).toBe('≈ 3 h');
  });
});

describe('the plan with LTX 2.3', () => {
  const WITH = [INTO, SD15, WAN_LOW, WAN_MED, WAN_HIGH, H3, LTX];

  it('a 12 GB card runs it at its preset resolution, with no lower-resolution note', () => {
    const p = planAuto(project('video', 3, true), [INTO, SD15, LTX], SMALL, null);
    expect(p.video?.id).toBe('ltx');
    expect(p.config.defaults.animate).toMatchObject({ engine: 'ltx-2.3', resolution: '768x416', steps: 8, connectors: 'models/video/conn.safetensors' });
    expect(p.notes.join(' ')).not.toContain('menor');
  });

  it('is left out, with a note, when the card or the RAM is too small', () => {
    const tiny = machineOf([gpu('GTX', 8192)], { total_bytes: 30 * 2 ** 30, available_bytes: 25 * 2 ** 30 });
    const p = planAuto(project('video', 1, true), [INTO, SD15, LTX], tiny, null);
    expect(p.video).toBeNull();
    expect(p.notes.join(' ')).toContain('LTX 2.3');
    expect(planAuto(project('video', 1, true), [INTO, SD15, LTX], { ...SMALL, ramGb: 16 }, null).video).toBeNull();
  });

  it('is not mentioned when it is not installed', () => {
    const p = planAuto(project('video', 1, true), [INTO, SD15, { ...LTX, installed: false }, WAN_LOW], BIG, null);
    expect(p.video?.id).not.toBe('ltx');
    expect(p.notes.join(' ')).not.toContain('LTX');
  });

  it('is chosen before the H3 draft when a time limit rules out the full H3 and Wan high', () => {
    const limited = planAuto(project('video', 6, true), WITH, BIG, 25 * 60);
    expect(limited.fits).toBe(true);
    expect(limited.video?.id).toBe('ltx');
    expect(limited.config.defaults.animate?.engine).toBe('ltx-2.3');
  });

  it('does not change the plan without a limit: H3 stays first on a 16 GB card', () => {
    expect(planAuto(project('video', 3, true), WITH, BIG, null).video?.id).toBe('h3-full');
  });

  it('shows it in the plan summary', () => {
    const p = planAuto(project('video', 2, true), [INTO, SD15, LTX], SMALL, null);
    expect(describePlan(p).join(' ')).toContain('LTX 2.3');
  });
});

describe('the plan', () => {
  it('without a limit takes the best animation that fits: MiniMax H3 on a 16 GB card', () => {
    const p = planAuto(project('video', 3, true), CATALOG, BIG, null);
    expect(p.video?.id).toBe('h3-full');
    expect(p.imageEntry?.id).toBe('into');
    expect(p.fits).toBe(true);
    expect(p.config.defaults.animate).toMatchObject({ engine: 'minimax-h3' });
    expect(p.config.defaults.animate?.lora).toBeUndefined();
    expect(p.seconds).toBeGreaterThan(3 * 258);
  });

  it('with a 12 GB card leaves MiniMax H3 out, says why, and takes Wan A14B', () => {
    const p = planAuto(project('video', 3, true), CATALOG, SMALL, null);
    expect(p.video?.id).toBe('wan-high');
    expect(p.notes.join(' ')).toContain('MiniMax H3');
    expect(p.config.defaults.animate?.high_noise_diffusion_model).toBeTruthy();
  });

  it('with little RAM leaves MiniMax H3 out too', () => {
    const lowRam = { ...BIG, ramGb: 16 };
    expect(planAuto(project('video', 1, true), CATALOG, lowRam, null).video?.id).toBe('wan-high');
  });

  it('a time limit moves to a faster animation, and writes the turbo LoRA for a draft', () => {
    const scenes = 6;
    const full = planAuto(project('video', scenes, true), CATALOG, BIG, null);
    expect(planAuto(project('video', scenes, true), CATALOG, BIG, 45 * 60).video?.id).toBe('h3-full'); // it still fits
    const limited = planAuto(project('video', scenes, true), CATALOG, BIG, 20 * 60);
    expect(limited.fits).toBe(true);
    expect(limited.seconds).toBeLessThanOrEqual(20 * 60);
    expect(limited.seconds).toBeLessThan(full.seconds);
    expect(limited.video?.id).toBe('h3-draft');
    expect(limited.config.defaults.animate).toMatchObject({ engine: 'minimax-h3', lora: 'models/video/turbo.safetensors', steps: 4 });
  });

  it('pays for a slower animation with cheaper pictures instead of dropping to a worse animation', () => {
    const p = planAuto(project('video', 6, true), CATALOG, BIG, 10 * 60);
    expect(p.fits).toBe(true);
    expect(p.video?.id).toBe('wan-medium');
    expect(p.config.defaults.resolution).toBe('768x448'); // the pictures at the lowest level
    expect(p.config.defaults.animate).toMatchObject({ engine: 'wan', frames: 33 }); // the animation at its own level
  });

  it('limits the pictures to what the card can do: IntoRealism at the highest level does not fit 16 GB', () => {
    const max = maxPicturePixels(INTO, BIG)!;
    expect(max).toBeGreaterThan(1024 * 576); // the preset resolution always fits
    expect(max).toBeLessThan(1280 * 704); // the measured limit: 15.2 GB of 16.3 at 1280x704 failed in a real run
    const p = planAuto(project('video', 3, false), CATALOG, BIG, null);
    const [w, h] = p.config.defaults.resolution.split('x').map(Number);
    expect(w * h).toBeLessThanOrEqual(max);
    expect(p.notes.join(' ')).toContain('se limita');
  });

  it('does not limit a small model, and fitResolution keeps the shape in multiples of 64', () => {
    expect(maxPicturePixels(SD15, BIG)).toBeGreaterThan(2_000_000);
    expect(fitResolution('1280x704', 2_000_000)).toBe('1280x704');
    const fitted = fitResolution('1280x704', 800_000);
    const [w, h] = fitted.split('x').map(Number);
    expect(w % 64).toBe(0);
    expect(h % 64).toBe(0);
    expect(w * h).toBeLessThanOrEqual(800_000);
    expect(maxPicturePixels(INTO, machineOf([], null))).toBeNull();
  });

  it('prefers the first-frame H3 bundle when it is installed: it writes first_frame, its DiT and, as a draft, its 8-step LoRA', () => {
    const FF = entry({
      id: 'h3ff',
      kind: 'video',
      name: 'MiniMax H3 first frame',
      vram_mb: 14336,
      min_ram_gb: 24,
      preset: { steps: 20, cfg_scale: 1, resolution: '864x480' },
      timing: { seconds: 290, resolution: '864x480', steps: 20, frames: 56, turbo_seconds: 168, turbo_steps: 8, measured: true },
      files: [
        { name: 'fl2va.gguf', role: 'model', url: '' },
        { name: 'enc.gguf', role: 'text_encoder', url: '' },
        { name: 'v.safetensors', role: 'vae', url: '' },
        { name: 'a.safetensors', role: 'audio_vae', url: '' },
        { name: 'fl2v8.safetensors', role: 'lora', url: '' },
      ],
    });
    const catalog = [...CATALOG, FF];
    const full = planAuto(project('video', 3, true), catalog, BIG, null);
    expect(full.video?.firstFrame).toBe(true);
    expect(full.video?.entry.id).toBe('h3ff');
    expect(full.config.defaults.animate).toMatchObject({ engine: 'minimax-h3', first_frame: true, diffusion_model: 'models/video/fl2va.gguf' });
    expect(full.config.defaults.animate?.lora).toBeUndefined();
    // a short wait: the draft of the first-frame bundle (8 steps), a bit slower than the reference draft's 4
    const draft = planAuto(project('video', 6, true), catalog, BIG, 25 * 60);
    expect(draft.video).toMatchObject({ id: 'h3-draft', firstFrame: true });
    expect(draft.config.defaults.animate).toMatchObject({ first_frame: true, lora: 'models/video/fl2v8.safetensors', steps: 8 });
    // not installed: the reference bundle as before
    const notThere = planAuto(project('video', 3, true), [...CATALOG, { ...FF, installed: false }], BIG, null);
    expect(notThere.video?.firstFrame).toBe(false);
    expect(notThere.config.defaults.animate?.first_frame).toBeUndefined();
  });

  it('on a 12 GB card H3 runs at the lower resolution its entry measured; on a smaller one it is left out', () => {
    const FF = entry({
      id: 'h3ff',
      kind: 'video',
      name: 'MiniMax H3 first frame',
      vram_mb: 14336,
      min_ram_gb: 24,
      low_vram: { vram_mb: 11520, resolution: '768x416' },
      preset: { steps: 20, cfg_scale: 1, resolution: '864x480' },
      timing: { seconds: 290, resolution: '864x480', steps: 20, frames: 56, turbo_seconds: 168, turbo_steps: 8, measured: true },
      files: [
        { name: 'fl2va.gguf', role: 'model', url: '' },
        { name: 'enc.gguf', role: 'text_encoder', url: '' },
        { name: 'v.safetensors', role: 'vae', url: '' },
        { name: 'a.safetensors', role: 'audio_vae', url: '' },
        { name: 'fl2v8.safetensors', role: 'lora', url: '' },
      ],
    });
    const catalog = [INTO, SD15, FF];
    const card = (name: string, mb: number) => machineOf([{ index: 0, name, free_vram_mb: mb - 500, total_vram_mb: mb }], { total_bytes: 30 * 2 ** 30, available_bytes: 25 * 2 ** 30 });
    const p = planAuto(project('video', 3, true), catalog, card('NVIDIA GeForce RTX 4070', 12282), null);
    expect(p.video).toMatchObject({ id: 'h3-full', firstFrame: true, resolution: '768x416' });
    expect(p.config.defaults.animate).toMatchObject({ engine: 'minimax-h3', first_frame: true, resolution: '768x416' });
    expect(p.notes.join('|')).toContain('768x416');
    // the estimate follows the smaller picture: fewer pixels, less time than at 864x480
    const full = planAuto(project('video', 3, true), catalog, card('NVIDIA GeForce RTX 5060 Ti', 16311), null);
    expect(full.video?.resolution).toBeUndefined();
    expect(full.config.defaults.animate?.resolution).toBe('864x480');
    expect(p.seconds).toBeLessThan(full.seconds * 1.5 * (card('x', 12282).speed / full.machine.speed));
    // 8 GB: not even the lower resolution fits
    expect(planAuto(project('video', 3, true), catalog, card('NVIDIA GeForce RTX 3060', 8192), null).video?.engine).not.toBe('minimax-h3');
  });

  it('animates only the scenes a predicate accepts, and the time counts only those', () => {
    const cfg = project('video', 4, false);
    const all = planAuto(cfg, CATALOG, BIG, null, true);
    const some = planAuto(cfg, CATALOG, BIG, null, (s) => s.id === cfg.scenes[1].id || s.id === cfg.scenes[3].id);
    expect(some.newlyAnimated).toBe(2);
    expect(some.config.scenes.map((s) => !!s.animate)).toEqual([false, true, false, true]);
    expect(some.seconds).toBeLessThan(all.seconds);
    expect(some.seconds).toBeGreaterThan(planAuto(cfg, CATALOG, BIG, null).seconds);
    // a predicate that accepts nothing animates nothing and chooses no animation
    const none = planAuto(cfg, CATALOG, BIG, null, () => false);
    expect(none.newlyAnimated).toBe(0);
    expect(none.video).toBeNull();
  });

  it('switches animation on in the scenes when asked, and only when something can animate', () => {
    const off = planAuto(project('video', 3, false), CATALOG, BIG, null);
    expect(off.video).toBeNull();
    expect(off.animationAvailable).toBe(true);
    const on = planAuto(project('video', 3, false), CATALOG, BIG, null, true);
    expect(on.video?.id).toBe('h3-full');
    expect(on.newlyAnimated).toBe(3);
    expect(on.config.scenes.every((s) => s.animate === true)).toBe(true);
    expect(on.seconds).toBeGreaterThan(off.seconds * 5);
    // scenes that bring their own clip are not touched; images mode does not animate
    const withClip = project('video', 2, false);
    withClip.scenes[1].clip = 'mine.mp4';
    expect(planAuto(withClip, CATALOG, BIG, null, true).config.scenes[1].animate).toBeFalsy();
    expect(planAuto(project('images', 2, false), CATALOG, BIG, null, true).animationAvailable).toBe(false);
    // nothing installed can animate here: nothing is switched on
    const none = planAuto(project('video', 2, false), [INTO], BIG, null, true);
    expect(none.animationAvailable).toBe(false);
    expect(none.config.scenes.some((s) => s.animate)).toBe(false);
  });

  it('does not write an animation block into a project that animates nothing', () => {
    const p = planAuto(project('video', 3, false), CATALOG, BIG, null);
    expect(p.video).toBeNull();
    expect(p.config.defaults.animate).toBeUndefined();
    const withBlock = project('video', 3, false);
    withBlock.defaults.animate = { diffusion_model: 'models/video/own.gguf', t5xxl: 't', vae: 'v' };
    expect(planAuto(withBlock, CATALOG, BIG, null).config.defaults.animate).toEqual({ diffusion_model: 'models/video/own.gguf', t5xxl: 't', vae: 'v' });
  });

  it('when nothing fits the limit it takes the fastest and says how long that is', () => {
    const p = planAuto(project('video', 30, true), CATALOG, BIG, 5 * 60);
    expect(p.fits).toBe(false);
    expect(p.fastest).toBe(p.seconds);
    expect(p.seconds).toBeGreaterThan(5 * 60);
  });

  it('a project that does not animate only chooses the image model and the level', () => {
    const none = planAuto(project('video', 10, false), CATALOG, BIG, null);
    expect(none.video).toBeNull();
    expect(none.tier).toBe('high');
    const fast = planAuto(project('video', 10, false), CATALOG, BIG, 3 * 60);
    expect(fast.tier).not.toBe('high');
    expect(fast.seconds).toBeLessThan(none.seconds);
  });

  it('images mode multiplies by the variants of the level', () => {
    const p = planAuto(project('images', 4, false), CATALOG, BIG, null);
    expect(p.config.scenes.every((s) => s.variants === 4)).toBe(true);
    expect(p.seconds).toBeGreaterThan(4 * 4 * 19);
  });

  it('suggests what to install to do better when the best animation is missing', () => {
    const noH3 = CATALOG.map((e) => (e.id === 'h3' ? { ...e, installed: false } : e));
    const p = planAuto(project('video', 2, true), noH3, BIG, null);
    expect(p.video?.id).toBe('wan-high');
    expect(p.better.map((e) => e.id)).toEqual(['h3']);
  });

  it('with no GPU nothing fits: it says so and changes nothing it cannot', () => {
    const none: AutoMachine = machineOf([], null);
    const p = planAuto(project('video', 1, true), CATALOG, none, null);
    expect(p.imageEntry).toBeNull();
    expect(p.video).toBeNull();
    expect(p.notes.length).toBeGreaterThan(0);
  });

  it('offers a ladder of waiting times that starts with no limit', () => {
    expect(BUDGETS[0]).toBeNull();
    expect(BUDGETS.slice(1)).toEqual([...BUDGETS.slice(1)].sort((a, b) => (a ?? 0) - (b ?? 0)));
  });

describe('Easy mode for a new project', () => {
  const empty = (mode: 'video' | 'images' | 'music' = 'video'): ProjectConfig => ({ ...project(mode as 'video', 0, false), scenes: [] });

  it('writes the best image model, its highest level and the best animation, and leaves the scenes as they are (none)', () => {
    const c = easyConfigForNewProject(empty(), CATALOG, BIG)!;
    expect(c.scenes).toEqual([]);
    expect(c.defaults.model_set?.diffusion_model).toBe('models/into.safetensors');
    expect(c.defaults.animate).toMatchObject({ engine: 'minimax-h3' });
    expect(c.defaults.steps).toBeGreaterThan(8); // the high level
  });

  it('an images project gets no animation', () => {
    const c = easyConfigForNewProject(empty('images'), CATALOG, BIG)!;
    expect(c.defaults.animate).toBeUndefined();
    expect(c.defaults.model_set).toBeTruthy();
  });

  it('chooses nothing when no image model fits, and nothing for music', () => {
    expect(easyConfigForNewProject(empty(), CATALOG, machineOf([], null))).toBeNull();
    expect(easyConfigForNewProject(empty('music'), CATALOG, BIG)).toBeNull();
  });
});
});

describe('the engine of a request and its speech', () => {
  const WITH = [INTO, SD15, WAN_LOW, WAN_MED, WAN_HIGH, H3, LTX];
  const empty = (mode: 'video' | 'images' = 'video'): ProjectConfig => project(mode as 'video', 1, true);

  it('lists every engine that fits with its time, in the planner order', () => {
    const o = videoOptionsFor(empty(), WITH, BIG);
    const ids = o.map((x) => x.id);
    expect(ids.indexOf('h3-full')).toBeLessThan(ids.indexOf('ltx'));
    expect(ids).toContain('ltx');
    expect(o.every((x) => x.seconds > 0)).toBe(true);
    expect(o.find((x) => x.id === 'ltx')!.seconds).toBeLessThan(o.find((x) => x.id === 'h3-full')!.seconds);
  });

  it('does not offer an engine that does not fit the card', () => {
    const o = videoOptionsFor(empty(), [INTO, SD15, LTX, WAN_HIGH, WAN_MED], machineOf([gpu('NVIDIA GeForce RTX 4060', 8192)], { total_bytes: 30 * 2 ** 30, available_bytes: 25 * 2 ** 30 }));
    expect(o.map((x) => x.id)).toEqual(['wan-medium']);
  });

  it('lists nothing for a project of images', () => {
    expect(videoOptionsFor(empty('images'), WITH, BIG)).toEqual([]);
  });

  it('writes the engine the user picked, even when automatic would take another', () => {
    const p = easyPlanForNewProject(empty(), WITH, BIG, { engine: 'ltx' })!;
    expect(p.video?.id).toBe('ltx');
    expect(p.config.defaults.animate?.engine).toBe('ltx-2.3');
    expect(p.speechPick).toBe(false);
  });

  it('speech sends automatic to LTX 2.3 with the model audio on', () => {
    const p = easyPlanForNewProject(empty(), WITH, BIG, { speech: true })!;
    expect(p.video?.id).toBe('ltx');
    expect(p.config.defaults.animate).toMatchObject({ engine: 'ltx-2.3', model_audio: true });
    expect(p.speechPick).toBe(true);
  });

  it('speech never replaces an engine the user picked', () => {
    const p = easyPlanForNewProject(empty(), WITH, BIG, { speech: true, engine: 'h3-full' })!;
    expect(p.video?.id).toBe('h3-full');
    expect(p.speechPick).toBe(false);
    expect(p.config.defaults.animate?.model_audio).toBeFalsy();
  });

  it('speech without LTX keeps the usual engine and says so', () => {
    const p = easyPlanForNewProject(empty(), CATALOG, BIG, { speech: true })!;
    expect(p.video?.id).toBe('h3-full');
    expect(p.noSpeechEngine).toBe(true);
    expect(p.speechPick).toBe(false);
  });

  it('without speech nothing changes', () => {
    const p = easyPlanForNewProject(empty(), WITH, BIG)!;
    expect(p.video?.id).toBe('h3-full');
    expect(p.noSpeechEngine).toBe(false);
  });
});

