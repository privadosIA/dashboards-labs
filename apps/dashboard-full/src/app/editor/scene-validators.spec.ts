import { ProjectConfig, Scene } from '../core/api.models';
import type { Part } from '@lab/motion-parts';

import { sceneIdFromServerError, validateConfig } from './scene-validators';

function cfg(partial: Partial<ProjectConfig> = {}, scenes: Partial<Scene>[] = []): ProjectConfig {
  return {
    project: 'demo',
    output: { mode: 'video', file: 'out/demo.mp4', contact_sheet: false, ...partial.output },
    defaults: {
      model: 'models/m.safetensors',
      voice: 'voices/v.onnx',
      resolution: '1280x720',
      sampler: 'euler',
      steps: 30,
      fps: 30,
      subject_prompt: '',
      negative_prompt: '',
      lora_model_dir: '',
      ...partial.defaults,
    },
    scenes: scenes.map((s, i) => ({
      id: `s${i}`,
      prompt: 'algo',
      negative_prompt: '',
      tts_text: 'hola',
      speed: 1,
      lora: '',
      ...s,
    })),
  };
}

describe('validateConfig (mirror of the Go rules)', () => {
  it('accepts a healthy video config', () => {
    const v = validateConfig(cfg({}, [{}, { id: 'otro' }]));
    expect(v.valid).toBe(true);
  });

  it('flags duplicate and empty scene ids', () => {
    const v = validateConfig(cfg({}, [{ id: 'a' }, { id: 'a' }, { id: '' }]));
    expect(v.valid).toBe(false);
    expect(v.scenes[1].id).toContain('duplicado');
    expect(v.scenes[2].id).toBeTruthy();
  });

  it('flags empty prompts', () => {
    const v = validateConfig(cfg({}, [{ prompt: '' }]));
    expect(v.scenes[0].prompt).toBeTruthy();
  });

  describe('motion graphics and overlays', () => {
    it('a motion graphic needs no prompt but does need its description', () => {
      const ok = validateConfig(cfg({}, [{ prompt: '', motion_graphic: 'tres ideas sobre azul' }]));
      expect(ok.valid).toBe(true);
      const empty = validateConfig(cfg({}, [{ prompt: '', motion_graphic: '  ' }]));
      expect(empty.scenes[0].motionGraphic).toBeTruthy();
      expect(empty.scenes[0].prompt).toBeUndefined();
      expect(empty.valid).toBe(false);
    });

    it('accepts an overlay on any scene and rejects the ones the server rejects', () => {
      expect(validateConfig(cfg({}, [{ overlay: { text: 'Capítulo 1', position: 'top', start: 1, end: 3 } }])).valid).toBe(true);
      const bad = (overlay: Scene['overlay'], extra: Partial<Scene> = {}) => validateConfig(cfg({}, [{ overlay, ...extra }])).scenes[0].overlay;
      expect(bad({ text: ' ' })).toBeTruthy();
      expect(bad({ text: 'x', start: -1 })).toBeTruthy();
      expect(bad({ text: 'x', start: 2, end: 2 })).toBeTruthy();
      expect(bad({ text: 'x', end: 0 })).toBeTruthy();
      expect(bad({ text: 'x', end: 9 }, { tts_text: '', silence_seconds: 4 })).toBeTruthy();
      expect(bad({ text: 'x', start: 5 }, { tts_text: '', silence_seconds: 4 })).toBeTruthy();
      expect(bad({ text: 'x', start: 1, end: 3 }, { tts_text: '', silence_seconds: 4 })).toBeUndefined();
    });
  });

  it('flags tts_text together with silence_seconds (mutually exclusive)', () => {
    const v = validateConfig(cfg({}, [{ tts_text: 'hola', silence_seconds: 2 }]));
    expect(v.scenes[0].narration).toContain('excluyentes');
  });

  it('requires narration or silence in video mode, but not in images mode', () => {
    const video = validateConfig(cfg({}, [{ tts_text: '' }]));
    expect(video.scenes[0].narration).toBeTruthy();
    const images = validateConfig(
      cfg({ output: { mode: 'images', file: '', contact_sheet: false } }, [{ tts_text: '' }]),
    );
    expect(images.scenes[0].narration).toBeUndefined();
  });

  it('validates WIDTHxHEIGHT resolution and the output file in video mode', () => {
    const v = validateConfig(cfg({ defaults: { resolution: '1280×720' } as never }, [{}]));
    expect(v.defaults.resolution).toBeTruthy();
    const noFile = validateConfig(cfg({ output: { mode: 'video', file: '', contact_sheet: false } }, [{}]));
    expect(noFile.output.file).toBeTruthy();
  });

  it('bounds motion intensity, grain and variants', () => {
    const v = validateConfig(
      cfg({}, [
        { motion: { type: 'zoom_in', intensity: 1.5 } },
        { look: { grain: -0.1, white_balance: 'warm' } },
        { variants: 0 },
      ]),
    );
    expect(v.scenes[0].motion).toBeTruthy();
    expect(v.scenes[1].look).toBeTruthy();
    expect(v.scenes[2].variants).toBeTruthy();
  });

  it('rejects unknown motion and white-balance presets', () => {
    const v = validateConfig(
      cfg({}, [
        { motion: { type: 'dolly_zoom' } },
        { look: { grain: 0.2, white_balance: 'sepia' } },
      ]),
    );
    expect(v.scenes[0].motion).toBeTruthy();
    expect(v.scenes[1].look).toBeTruthy();
  });
});

describe('sceneIdFromServerError', () => {
  it('extracts the scene a Go validation message names', () => {
    expect(sceneIdFromServerError('config: scene "intro" has an empty prompt')).toBe('intro');
    expect(sceneIdFromServerError('config: output_file is required')).toBeNull();
  });
});

describe('validateConfig: model sets and animation (mirror of the Go rules)', () => {
  const WAN = { diffusion_model: 'models/video/wan.gguf', t5xxl: 'models/video/umt5.gguf', vae: 'models/video/vae.safetensors' };
  const SET = { diffusion_model: 'models/k.gguf', llm: 'models/q.gguf', vae: 'models/v.safetensors', cfg_scale: 1 };

  it('accepts a model set instead of a single checkpoint', () => {
    const v = validateConfig(cfg({ defaults: { model: '', model_set: SET } as ProjectConfig['defaults'] }, [{}]));
    expect(v.valid).toBe(true);
    expect(v.defaults.modelSet).toBeUndefined();
  });

  it('rejects a checkpoint and a model set together, naming both fields', () => {
    const v = validateConfig(cfg({ defaults: { model: 'models/m.safetensors', model_set: SET } as ProjectConfig['defaults'] }, [{}]));
    expect(v.valid).toBe(false);
    expect(v.defaults.model).toContain('defaults.model');
    expect(v.defaults.model).toContain('defaults.model_set');
  });

  it('rejects an incomplete model set naming the missing file', () => {
    const noVae = validateConfig(cfg({ defaults: { model: '', model_set: { ...SET, vae: '' } } as ProjectConfig['defaults'] }, [{}]));
    expect(noVae.valid).toBe(false);
    expect(noVae.defaults.modelSet).toContain('vae');
    const noLlm = validateConfig(cfg({ defaults: { model: '', model_set: { ...SET, llm: '' } } as ProjectConfig['defaults'] }, [{}]));
    expect(noLlm.defaults.modelSet).toContain('llm');
    const noModel = validateConfig(cfg({ defaults: { model: '', model_set: { ...SET, diffusion_model: '' } } as ProjectConfig['defaults'] }, [{}]));
    expect(noModel.defaults.modelSet).toContain('diffusion_model');
  });

  it('an editing model set needs its two text encoders and no llm', () => {
    const edit = { diffusion_model: 'models/k.gguf', vae: 'models/ae.safetensors', edit: true, clip_l: 'models/c.safetensors', t5xxl: 'models/t.safetensors' };
    const ok = validateConfig(cfg({ defaults: { model: '', model_set: edit } as ProjectConfig['defaults'] }, [{}]));
    expect(ok.defaults.modelSet).toBeUndefined();
    const noT5 = validateConfig(cfg({ defaults: { model: '', model_set: { ...edit, t5xxl: '' } } as ProjectConfig['defaults'] }, [{}]));
    expect(noT5.defaults.modelSet).toContain('t5xxl');
    const noClip = validateConfig(cfg({ defaults: { model: '', model_set: { ...edit, clip_l: '' } } as ProjectConfig['defaults'] }, [{}]));
    expect(noClip.defaults.modelSet).toContain('clip_l');
  });

  it('a Qwen editing model set needs its llm and vision projector and no FLUX encoders', () => {
    const qwen = { diffusion_model: 'models/q.gguf', vae: 'models/qv.safetensors', edit: true, llm: 'models/vl.gguf', llm_vision: 'models/mm.gguf' };
    const check = (ms: object) => validateConfig(cfg({ defaults: { model: '', model_set: ms } as ProjectConfig['defaults'] }, [{}])).defaults.modelSet;
    expect(check(qwen)).toBeUndefined();
    expect(check({ ...qwen, llm_vision: '' })).toContain('llm_vision');
    expect(check({ ...qwen, llm: '' })).toContain('llm');
    expect(check({ ...qwen, t5xxl: 'models/t.safetensors' })).toContain('una sola familia');
  });

  it('rejects a negative cfg_scale in a model set', () => {
    const v = validateConfig(cfg({ defaults: { model: '', model_set: { ...SET, cfg_scale: -1 } } as ProjectConfig['defaults'] }, [{}]));
    expect(v.valid).toBe(false);
    expect(v.defaults.modelSet).toContain('cfg_scale');
  });

  it('blocks a scene that animates when defaults.animate is absent, naming it', () => {
    const v = validateConfig(cfg({}, [{ animate: true }]));
    expect(v.valid).toBe(false);
    expect(v.scenes[0].animate).toContain('defaults.animate');
  });

  it('blocks a scene that animates when a Wan file is missing', () => {
    const v = validateConfig(cfg({ defaults: { animate: { ...WAN, vae: '' } } as ProjectConfig['defaults'] }, [{ animate: true }]));
    expect(v.valid).toBe(false);
    expect(v.scenes[0].animate).toBeTruthy();
  });

  it('accepts an animated scene with the three Wan files', () => {
    const v = validateConfig(cfg({ defaults: { animate: WAN } as ProjectConfig['defaults'] }, [{ animate: true }]));
    expect(v.valid).toBe(true);
  });

  it('does not require Wan files when nobody animates, and ignores animate in images mode', () => {
    expect(validateConfig(cfg({}, [{}])).valid).toBe(true);
    const images = cfg({ output: { mode: 'images', file: '', contact_sheet: false } }, [{ animate: true, tts_text: '' }]);
    expect(validateConfig(images).valid).toBe(true);
  });

  it('checks the animation settings: resolution multiple of 16, frames 4n+1, positive fps and steps', () => {
    const bad = (a: Partial<typeof WAN> & Record<string, unknown>) =>
      validateConfig(cfg({ defaults: { animate: { ...WAN, ...a } } as ProjectConfig['defaults'] }, [{}]));
    expect(bad({ resolution: '830x480' }).defaults.animate).toContain('múltiplos de 16');
    expect(bad({ resolution: 'grande' }).defaults.animate).toContain('resolution');
    expect(bad({ frames: 30 }).defaults.animate).toContain('4n+1');
    expect(bad({ fps: 0 }).defaults.animate).toContain('fps');
    expect(bad({ steps: -3 }).defaults.animate).toContain('steps');
    expect(bad({ cfg_scale: -1 }).defaults.animate).toContain('cfg_scale');
    for (const ok of [{ resolution: '832x480' }, { frames: 33 }, { frames: 65 }, { fps: 16 }, { steps: 20 }, { cfg_scale: 6 }]) {
      expect(bad(ok).valid).toBe(true);
    }
  });

  it('mirrors the high-noise rules: settings need the expert, steps positive, cfg not negative', () => {
    const run = (a: Record<string, unknown>) =>
      validateConfig(cfg({ defaults: { animate: { ...WAN, ...a } } as ProjectConfig['defaults'] }, [{}]));
    const HN = 'models/video/high.gguf';
    expect(run({ high_noise_steps: 8 }).defaults.animate).toContain('necesitan defaults.animate.high_noise_diffusion_model');
    expect(run({ high_noise_cfg_scale: 3.5 }).defaults.animate).toContain('necesitan');
    expect(run({ high_noise_cfg_scale: 0 }).defaults.animate).toContain('necesitan'); // 0 is a value, still refused
    expect(run({ high_noise_diffusion_model: HN, high_noise_steps: 0 }).defaults.animate).toContain('high_noise_steps');
    expect(run({ high_noise_diffusion_model: HN, high_noise_steps: -2 }).defaults.animate).toContain('positivo');
    expect(run({ high_noise_diffusion_model: HN, high_noise_cfg_scale: -1 }).defaults.animate).toContain('high_noise_cfg_scale');
    for (const ok of [
      { high_noise_diffusion_model: HN },
      { high_noise_diffusion_model: HN, high_noise_steps: 8, high_noise_cfg_scale: 3.5 },
      { high_noise_diffusion_model: HN, high_noise_cfg_scale: 0 },
    ]) {
      expect(run(ok).valid).toBe(true);
    }
  });
});


describe('a scene\'s own quality', () => {
  const quality = (s: Partial<Scene>) => validateConfig(cfg({}, [s])).scenes[0].quality;

  it('accepts valid settings and none at all', () => {
    expect(quality({})).toBeUndefined();
    expect(quality({ render: { resolution: '1280x704', steps: 12, cfg_scale: 0 }, animation: { resolution: '832x480', frames: 49, steps: 10 } })).toBeUndefined();
    expect(validateConfig(cfg({}, [{ render: { steps: 12 } }])).valid).toBe(true);
  });

  it('flags a malformed render resolution, steps below 1 and a negative cfg, naming the scene and the field', () => {
    expect(quality({ render: { resolution: 'big' } })).toContain('render.resolution');
    expect(quality({ render: { resolution: 'big' } })).toContain('«s0»');
    expect(quality({ render: { steps: 0 } })).toContain('render.steps');
    expect(quality({ render: { cfg_scale: -1 } })).toContain('render.cfg_scale');
    expect(validateConfig(cfg({}, [{ render: { steps: 0 } }])).valid).toBe(false);
  });

  it('flags animation sides that are not multiples of 16, frames that are not 4n+1 and steps below 1', () => {
    expect(quality({ animation: { resolution: '830x480' } })).toContain('múltiplos de 16');
    expect(quality({ animation: { frames: 30 } })).toContain('4n+1');
    expect(quality({ animation: { steps: 0 } })).toContain('animation.steps');
  });

  it('does not complain about an animation block on a scene that does not animate', () => {
    expect(quality({ animate: false, animation: { frames: 49 } })).toBeUndefined();
  });
});

describe('AnimateDiff rules', () => {
  const ad = { engine: 'animatediff' as const, checkpoint: 'models/sd.safetensors', motion_module: 'models/video/mm.safetensors' };
  const project = (animate: object, scene: Partial<Scene> = {}) =>
    cfg({ defaults: { animate: animate as never } as never }, [{ animate: true, ...scene }]);

  it('needs the checkpoint and the module, not the Wan files', () => {
    expect(validateConfig(project(ad)).valid).toBe(true);
    const v = validateConfig(project({ engine: 'animatediff', checkpoint: 'x' }));
    expect(v.valid).toBe(false);
    expect(v.scenes[0].animate).toContain('AnimateDiff');
  });

  it('accepts 16 frames and sides multiples of 8, and refuses the rest', () => {
    expect(validateConfig(project({ ...ad, frames: 16, resolution: '640x352' })).valid).toBe(true);
    expect(validateConfig(project({ ...ad, frames: 40 })).defaults.animate).toContain('entre 8 y 32');
    expect(validateConfig(project({ ...ad, resolution: '514x512' })).defaults.animate).toContain('múltiplos de 8');
    expect(validateConfig(project({ ...ad, strength: 0 })).defaults.animate).toContain('strength');
    expect(validateConfig(project({ ...ad, strength: 1.2 })).defaults.animate).toContain('strength');
  });

  it('Wan still refuses 16 frames', () => {
    const v = validateConfig(project({ diffusion_model: 'a', t5xxl: 'b', vae: 'c', frames: 16 }));
    expect(v.defaults.animate).toContain('4n+1');
  });

  it('validates a scene\'s own animation with the engine\'s rules', () => {
    expect(validateConfig(project(ad, { animation: { frames: 12, resolution: '384x384' } })).valid).toBe(true);
    const v = validateConfig(project(ad, { animation: { frames: 40 } }));
    expect(v.scenes[0].quality).toContain('entre 8 y 32');
    const w = validateConfig(project({ diffusion_model: 'a', t5xxl: 'b', vae: 'c' }, { animation: { frames: 12 } }));
    expect(w.scenes[0].quality).toContain('4n+1');
  });

  describe('a scene drawn by a part of the catalog', () => {
    const counter: Part = {
      name: 'counter',
      description: 'A counter',
      levels: ['simple', 'medium', 'advanced'],
      costMs: 55,
      manual: false,
      params: [
        { name: 'to', type: 'int', default: '100', min: 1, max: 999 },
        { name: 'speed', type: 'number', default: '1.5', min: 0.5, max: 4 },
        { name: 'on', type: 'bool', default: 'true' },
        { name: 'align', type: 'enum', default: 'left', options: ['left', 'center'] },
        { name: 'label', type: 'string', default: 'x', maxLength: 5 },
      ],
    };
    const errorsOf = (scene: Partial<Scene>, parts: readonly Part[] | null = [counter]) => validateConfig(cfg({}, [{ prompt: '', ...scene }]), parts ?? undefined).scenes[0];

    it('is fine with a part of the catalog, parameters inside their limits, a short text and a tempo in range', () => {
      const v = validateConfig(cfg({}, [{ prompt: '', motion_part: 'counter', motion_params: { to: 10, speed: 2, on: false, align: 'center', label: 'hi' }, motion_text: 'hola', motion_bpm: 90 }]), [counter]);
      expect(v.scenes[0]).toEqual({});
      expect(v.valid).toBe(true);
    });

    it('does not ask for a prompt', () => {
      expect(errorsOf({ motion_part: 'counter' }).prompt).toBeUndefined();
    });

    it('asks to choose a part when the way is chosen and none is picked', () => {
      expect(errorsOf({ motion_part: '' }).part).toContain('Elige una parte');
    });

    it('refuses a part the catalog does not have, only when the catalog is known', () => {
      expect(errorsOf({ motion_part: 'nope' }).part).toContain('«nope»');
      expect(errorsOf({ motion_part: 'nope' }, null).part).toBeUndefined();
    });

    it('refuses a parameter that is not the part\'s or is outside its limits', () => {
      expect(errorsOf({ motion_part: 'counter', motion_params: { zzz: 1 } }).partParams).toContain('«zzz»');
      expect(errorsOf({ motion_part: 'counter', motion_params: { to: 1000 } }).partParams).toContain('entre 1 y 999');
      expect(errorsOf({ motion_part: 'counter', motion_params: { to: 1.5 } }).partParams).toContain('entero');
      expect(errorsOf({ motion_part: 'counter', motion_params: { speed: 'fast' } }).partParams).toContain('número');
      expect(errorsOf({ motion_part: 'counter', motion_params: { on: 'yes' } }).partParams).toContain('verdadero');
      expect(errorsOf({ motion_part: 'counter', motion_params: { align: 'up' } }).partParams).toContain('left, center');
      expect(errorsOf({ motion_part: 'counter', motion_params: { label: 'too long' } }).partParams).toContain('hasta 5');
    });

    it('refuses a text of more than 120 characters and a tempo outside 40 to 240', () => {
      expect(errorsOf({ motion_part: 'counter', motion_text: 'a'.repeat(121) }).partText).toContain('120');
      expect(errorsOf({ motion_part: 'counter', motion_text: 'a'.repeat(120) }).partText).toBeUndefined();
      expect(errorsOf({ motion_part: 'counter', motion_bpm: 39 }).partBpm).toContain('40');
      expect(errorsOf({ motion_part: 'counter', motion_bpm: 241 }).partBpm).toContain('240');
      expect(errorsOf({ motion_part: 'counter', motion_bpm: 240 }).partBpm).toBeUndefined();
    });

    it('asks for the description when the model is to choose', () => {
      expect(errorsOf({ motion_part: 'auto', motion_graphic: '' }).motionGraphic).toContain('elija la parte');
      expect(errorsOf({ motion_part: 'auto', motion_graphic: 'tres ideas' })).toEqual({});
    });

    it('refuses a part together with what the server does not let it be combined with', () => {
      for (const extra of [{ image: 'a.png' }, { clip: 'a.mp4' }, { init_image: 'b.png' }, { animate: true }, { motion_prompt: 'x' }, { render: { steps: 5 } }, { animation: { frames: 33 } }]) {
        expect(errorsOf({ motion_part: 'counter', ...extra }).part, JSON.stringify(extra)).toContain('no se combina');
      }
      expect(errorsOf({ motion_part: 'counter', animate: false }).part).toBeUndefined();
    });

    it('refuses parameters, text or tempo without a part', () => {
      for (const extra of [{ motion_params: { to: 1 } }, { motion_text: 'x' }, { motion_bpm: 100 }]) {
        expect(errorsOf({ prompt: 'algo', ...extra }).part, JSON.stringify(extra)).toContain('necesitan una parte');
      }
    });
  });
});
