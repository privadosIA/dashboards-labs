import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { load } from 'js-yaml';

import { ProjectConfig } from '../core/api.models';
import { EditorStore } from './editor.store';
import { toYaml } from '../shared/project-yaml';

const CONFIG: ProjectConfig = {
  project: 'demo',
  output: { mode: 'video', file: 'out/demo.mp4', contact_sheet: false },
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
  },
  scenes: [
    {
      id: 'intro',
      prompt: 'ciudad',
      negative_prompt: 'blurry',
      seed: 42,
      tts_text: 'hola',
      speed: 1,
      lora: '',
      motion: { type: 'zoom_in', intensity: 0.5 },
      look: { grain: 0.3, white_balance: 'warm' },
    },
    {
      id: 'respiro',
      prompt: 'niebla',
      negative_prompt: '',
      tts_text: '',
      speed: 0,
      lora: '',
      silence_seconds: 2,
    },
  ],
};

describe('toYaml', () => {
  it('round-trips the model with presence semantics intact', () => {
    const doc = load(toYaml(CONFIG)) as Record<string, unknown>;
    const scenes = doc['scenes'] as Record<string, unknown>[];
    expect(scenes[0]['seed']).toBe(42);
    expect(scenes[0]['tts_text']).toBe('hola');
    expect('silence_seconds' in scenes[0]).toBe(false); // absent, not null
    expect('seed' in scenes[1]).toBe(false); // random seed = absent key
    expect(scenes[1]['silence_seconds']).toBe(2);
    expect('tts_text' in scenes[1]).toBe(false); // empty string pruned
    expect((scenes[0]['motion'] as Record<string, unknown>)['type']).toBe('zoom_in');
    expect((scenes[0]['look'] as Record<string, unknown>)['white_balance']).toBe('warm');
    expect((doc['output'] as Record<string, unknown>)['file']).toBe('out/demo.mp4');
  });

  const FULL: ProjectConfig = {
    ...CONFIG,
    defaults: {
      ...CONFIG.defaults,
      model: '',
      model_set: { diffusion_model: 'models/k.gguf', llm: 'models/q.gguf', vae: 'models/v.safetensors', cfg_scale: 1 },
      animate: { diffusion_model: 'models/video/w.gguf', t5xxl: 'models/video/u.gguf', vae: 'models/video/v.safetensors', frames: 65 },
    },
    scenes: [
      { ...CONFIG.scenes[0], animate: true, motion_prompt: 'she turns the page' },
      { ...CONFIG.scenes[1], animate: false },
    ],
  };

  it('writes no animate or motion_prompt keys when nothing animates', () => {
    const doc = load(toYaml(CONFIG)) as { defaults: Record<string, unknown>; scenes: Record<string, unknown>[] };
    expect('animate' in doc.defaults).toBe(false);
    expect('model_set' in doc.defaults).toBe(false);
    for (const sc of doc.scenes) {
      expect('animate' in sc).toBe(false);
      expect('motion_prompt' in sc).toBe(false);
    }
  });

  it('does not write animate: false (only an opt-in is written)', () => {
    const doc = load(toYaml(FULL)) as { scenes: Record<string, unknown>[] };
    expect(doc.scenes[0]['animate']).toBe(true);
    expect(doc.scenes[0]['motion_prompt']).toBe('she turns the page');
    expect('animate' in doc.scenes[1]).toBe(false);
  });

  it('keeps a model set, an animation block and an animated scene through a round trip', () => {
    const doc = load(toYaml(structuredClone(FULL))) as { defaults: Record<string, unknown> };
    expect(doc.defaults['model_set']).toEqual({
      diffusion_model: 'models/k.gguf', llm: 'models/q.gguf', vae: 'models/v.safetensors', cfg_scale: 1,
    });
    expect(doc.defaults['animate']).toEqual({
      diffusion_model: 'models/video/w.gguf', t5xxl: 'models/video/u.gguf', vae: 'models/video/v.safetensors', frames: 65,
    });
    expect('model' in doc.defaults).toBe(false); // the empty checkpoint is not written
  });

  it('prunes a model set and an animation block with nothing set', () => {
    const empty: ProjectConfig = {
      ...CONFIG,
      defaults: { ...CONFIG.defaults, model_set: { diffusion_model: '', llm: '', vae: '' }, animate: { diffusion_model: '', t5xxl: '', vae: '' } },
    };
    const doc = load(toYaml(empty)) as { defaults: Record<string, unknown> };
    expect('model_set' in doc.defaults).toBe(false);
    expect('animate' in doc.defaults).toBe(false);
  });

  it('does not write unset animation settings (the defaults stay the server\'s)', () => {
    const only: ProjectConfig = {
      ...CONFIG,
      defaults: { ...CONFIG.defaults, animate: { diffusion_model: 'a', t5xxl: 'b', vae: 'c', resolution: '', frames: undefined } },
    };
    const doc = load(toYaml(only)) as { defaults: { animate: Record<string, unknown> } };
    expect(doc.defaults.animate).toEqual({ diffusion_model: 'a', t5xxl: 'b', vae: 'c' });
  });
});

describe('EditorStore', () => {
  let store: EditorStore;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [EditorStore, provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(EditorStore);
    http = TestBed.inject(HttpTestingController);
    const loading = store.load('demo');
    http
      .expectOne('/api/projects/demo/config')
      .flush({ yaml: 'x', parsed: structuredClone(CONFIG), valid: true, warnings: [] });
    await loading;
  });

  afterEach(() => http.verify());

  it('loads clean and tracks dirty on edits', () => {
    expect(store.dirty()).toBe(false);
    store.updateScene(0, { prompt: 'otra ciudad' });
    expect(store.dirty()).toBe(true);
    expect(store.config()!.scenes[0].prompt).toBe('otra ciudad');
  });

  describe('editing the starting pictures by instruction', () => {
    const KONTEXT = {
      id: 'kontext', kind: 'model', name: 'Kontext', description: '', size_bytes: 1, installed: true, edit: true,
      preset: { steps: 20, cfg_scale: 1, resolution: '1024x576' },
      files: [
        { name: 'k.gguf', role: 'model', url: '' },
        { name: 'clip_l.safetensors', role: 'clip_l', url: '' },
        { name: 't5.safetensors', role: 't5xxl', url: '' },
        { name: 'ae.safetensors', role: 'vae', url: '' },
      ],
    };
    const load = async () => {
      const p = store.loadCatalog();
      http.expectOne('/api/assets/catalog').flush({ entries: [KONTEXT] });
      await p;
    };

    it('needs an installed editing model', async () => {
      store.setEditing(true);
      expect(store.editing()).toBe(false);
      await load();
      expect(store.editEntry()?.id).toBe('kontext');
    });

    it('switches the project to the editing model, and back to what it was', async () => {
      await load();
      store.updateScene(0, { init_image: 'foto.png', strength: 0.3 });
      store.setEditing(true);
      const d = store.config()!.defaults;
      expect(store.editing()).toBe(true);
      expect(d.model).toBe('');
      expect(d.model_set).toMatchObject({ edit: true, diffusion_model: 'models/k.gguf', clip_l: 'models/clip_l.safetensors', t5xxl: 'models/t5.safetensors', vae: 'models/ae.safetensors' });
      expect(d.steps).toBe(20);
      expect(store.config()!.scenes[0].strength).toBeUndefined();
      expect(store.config()!.scenes[0].init_image).toBe('foto.png');

      store.setEditing(false);
      const back = store.config()!.defaults;
      expect(store.editing()).toBe(false);
      expect(back.model).toBe('models/m.safetensors');
      expect(back.model_set).toBeUndefined();
      expect(back.steps).toBe(30);
    });
  });

  describe('the engine of Retouch', () => {
    const entry = (id: string, files: { name: string; role: string }[]) => ({
      id, kind: 'model', name: id, description: '', size_bytes: 1, installed: true, edit: true,
      preset: { steps: 20, cfg_scale: id === 'qwen' ? 2.5 : 1, resolution: '1024x576' },
      files: files.map((f) => ({ ...f, url: '' })),
    });
    const FAST = entry('kontext', [{ name: 'k.gguf', role: 'model' }, { name: 'clip_l.safetensors', role: 'clip_l' }, { name: 't5.safetensors', role: 't5xxl' }, { name: 'ae.safetensors', role: 'vae' }]);
    const PRECISE = entry('qwen', [{ name: 'q.gguf', role: 'model' }, { name: 'vl.gguf', role: 'llm' }, { name: 'mm.gguf', role: 'llm_vision' }, { name: 'qv.safetensors', role: 'vae' }]);
    const load = async (entries: unknown[]) => {
      const p = store.loadCatalog();
      http.expectOne('/api/assets/catalog').flush({ entries });
      await p;
    };

    it('offers both engines, and starts with the fast one', async () => {
      await load([PRECISE, FAST]);
      expect(store.editEngines().sort()).toEqual(['fast', 'precise']);
      store.setEditing(true);
      expect(store.editEngine()).toBe('fast');
    });

    it('uses the only engine installed without asking', async () => {
      await load([PRECISE]);
      expect(store.editEngines()).toEqual(['precise']);
      store.setEditing(true);
      expect(store.editEngine()).toBe('precise');
      expect(store.config()!.defaults.model_set).toMatchObject({ edit: true, diffusion_model: 'models/q.gguf', llm: 'models/vl.gguf', llm_vision: 'models/mm.gguf', vae: 'models/qv.safetensors', cfg_scale: 2.5 });
      expect(store.config()!.defaults.model_set?.clip_l).toBeUndefined();
    });

    it('changing the engine swaps the model and leaves the scenes, and going back still restores the project', async () => {
      await load([FAST, PRECISE]);
      store.updateScene(0, { init_image: 'foto.png', prompt: 'ponle una gorra' });
      store.setEditing(true);
      store.setEditEngine('precise');
      expect(store.editEngine()).toBe('precise');
      expect(store.config()!.defaults.model_set).toMatchObject({ llm_vision: 'models/mm.gguf' });
      expect(store.config()!.scenes[0]).toMatchObject({ init_image: 'foto.png', prompt: 'ponle una gorra' });
      store.setEditEngine('fast');
      expect(store.config()!.defaults.model_set).toMatchObject({ clip_l: 'models/clip_l.safetensors' });
      expect(store.config()!.defaults.model_set?.llm_vision).toBeUndefined();
      store.setEditing(false);
      expect(store.config()!.defaults.model).toBe('models/m.safetensors');
    });
  });

  describe('insertScenes (the shots of a described clip)', () => {
    const shots = [
      { prompt: 'a bench', motion: 'slow push in', seconds: 4.04, model: 'gemma4:26b' },
      { prompt: 'a path', seconds: 0.4, model: 'gemma4:26b' },
    ];

    it('adds one scene per shot right after the given one, in order, leaving the others alone', () => {
      const before = structuredClone(store.config()!.scenes);
      store.insertScenes(0, shots);
      const scenes = store.config()!.scenes;
      expect(scenes.map((s) => s.prompt)).toEqual([before[0].prompt, 'a bench', 'a path', ...before.slice(1).map((s) => s.prompt)]);
      expect(scenes[0]).toEqual(before[0]);
      expect(scenes.slice(3)).toEqual(before.slice(1));
      expect(store.selected()).toBe(1);
      expect(store.dirty()).toBe(true);
    });

    it('gives each scene a unique id, skipping the ones taken', () => {
      store.updateScene(1, { id: 'referencia_1' });
      store.insertScenes(1, shots);
      const ids = store.config()!.scenes.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toContain('referencia_2');
      expect(ids).toContain('referencia_3');
    });

    it('records the model and, in a video project, the length of the shot as silence (at least 1 s, one decimal)', () => {
      store.insertScenes(0, shots);
      const [a, b] = store.config()!.scenes.slice(1, 3);
      expect(a.described_by).toBe('gemma4:26b');
      expect(a.silence_seconds).toBe(4);
      expect(b.silence_seconds).toBe(1);
      expect(a.tts_text).toBe('');
    });

    it('writes no silence in an images project', () => {
      store.updateOutput({ mode: 'images' });
      store.insertScenes(0, shots);
      expect(store.config()!.scenes[1].silence_seconds).toBeUndefined();
    });

    it('animates the new scenes with the shot movement when the project is set to animate', () => {
      store.updateDefaults({ animate: { model: 'models/video/wan.gguf' } as never });
      store.insertScenes(0, shots);
      const [a, b] = store.config()!.scenes.slice(1, 3);
      expect(a.animate).toBe(true);
      expect(a.motion_prompt).toBe('slow push in');
      expect(b.animate).toBe(true);
      expect(b.motion_prompt).toBeUndefined();
    });

    it('does nothing without shots', () => {
      store.insertScenes(0, []);
      expect(store.dirty()).toBe(false);
    });
  });

  it('reorders scenes and the model order is the scene order', () => {
    store.reorder(0, 1);
    expect(store.config()!.scenes.map((s) => s.id)).toEqual(['respiro', 'intro']);
    expect(store.selected()).toBe(1);
  });

  it('save PUTs YAML that differs only in the edited field', async () => {
    store.updateScene(0, { prompt: 'editada' });
    const saving = store.save();
    const req = http.expectOne({ method: 'PUT', url: '/api/projects/demo/config' });
    const sent = load(req.request.body.yaml) as { scenes: Record<string, unknown>[] };
    expect(sent.scenes[0]['prompt']).toBe('editada');
    expect(sent.scenes[0]['seed']).toBe(42); // everything else intact
    expect(sent.scenes[1]['silence_seconds']).toBe(2);
    req.flush({ saved: true, warnings: [] });
    expect(await saving).toBe(true);
    expect(store.dirty()).toBe(false);
  });

  it('attaches a server rejection to the scene it names and stays dirty', async () => {
    store.updateScene(0, { prompt: 'x' });
    const saving = store.save();
    http
      .expectOne({ method: 'PUT', url: '/api/projects/demo/config' })
      .flush(
        { error: { code: 'validation_failed', message: 'config: scene "intro" has an empty tts_text' } },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    expect(await saving).toBe(false);
    expect(store.serverError()?.sceneId).toBe('intro');
    expect(store.serverError()?.message).toContain('empty tts_text');
    expect(store.dirty()).toBe(true);
  });

  it('blocks saving while the mirrored validation fails', () => {
    store.updateScene(0, { silence_seconds: 2 }); // tts + silence conflict
    expect(store.validation()!.scenes[0].narration).toBeTruthy();
    expect(store.canSave()).toBe(false);
  });

  // --- model set mode and the animation block ----------------------------------

  it('switching to a model set clears the checkpoint and edits an empty set', () => {
    store.setModelMode('set');
    const d = store.config()!.defaults;
    expect(d.model).toBe('');
    expect(d.model_set).toEqual({ diffusion_model: '', llm: '', vae: '' });
    expect(store.dirty()).toBe(true);
  });

  it('switching back to a checkpoint removes the model set', () => {
    store.setModelMode('set');
    store.updateModelSet({ diffusion_model: 'models/k.gguf' });
    store.setModelMode('checkpoint');
    expect(store.config()!.defaults.model_set).toBeUndefined();
  });

  it('switching to a model set keeps one already there', () => {
    store.setModelMode('set');
    store.updateModelSet({ diffusion_model: 'models/k.gguf', llm: 'models/q.gguf', vae: 'models/v.safetensors', cfg_scale: 1 });
    store.setModelMode('set');
    expect(store.config()!.defaults.model_set!.diffusion_model).toBe('models/k.gguf');
  });

  it('never sends a checkpoint and a model set together', async () => {
    store.setModelMode('set');
    store.updateModelSet({ diffusion_model: 'models/k.gguf', llm: 'models/q.gguf', vae: 'models/v.safetensors', cfg_scale: 1 });
    const saving = store.save();
    const req = http.expectOne({ method: 'PUT', url: '/api/projects/demo/config' });
    const sent = load(req.request.body.yaml) as { defaults: Record<string, unknown> };
    expect('model' in sent.defaults).toBe(false);
    expect(sent.defaults['model_set']).toBeTruthy();
    req.flush({ saved: true, warnings: [] });
    await saving;
  });

  it('adds and removes the animation block and edits its fields', () => {
    store.setAnimateBlock(true);
    expect(store.config()!.defaults.animate).toEqual({ diffusion_model: '', t5xxl: '', vae: '' });
    store.updateAnimate({ diffusion_model: 'models/video/w.gguf', frames: 65 });
    expect(store.config()!.defaults.animate!.frames).toBe(65);
    store.setAnimateBlock(false);
    expect(store.config()!.defaults.animate).toBeUndefined();
  });

  it('blocks saving an animated scene while the animation block is incomplete', () => {
    store.updateScene(0, { animate: true });
    expect(store.canSave()).toBe(false);
    store.setAnimateBlock(true);
    store.updateAnimate({ diffusion_model: 'a', t5xxl: 'b', vae: 'c' });
    expect(store.canSave()).toBe(true);
  });

  it('an incomplete model set blocks saving and says which file is missing', () => {
    store.setModelMode('set');
    store.updateModelSet({ diffusion_model: 'models/k.gguf', llm: 'models/q.gguf' });
    expect(store.canSave()).toBe(false);
    expect(store.validation()!.defaults.modelSet).toContain('vae');
  });
});

describe('background music in the editor', () => {
  const video = (bgm?: ProjectConfig['bgm']): ProjectConfig => ({ ...structuredClone(CONFIG), bgm });

  it('writes the block only when there is one', () => {
    expect(load(toYaml(video())) as Record<string, unknown>).not.toHaveProperty('bgm');
    const doc = load(toYaml(video({ prompt: 'calm piano', volume: 0.3, ducking: false }))) as { bgm: Record<string, unknown> };
    expect(doc.bgm).toEqual({ prompt: 'calm piano', volume: 0.3, ducking: false });
  });

  it('leaves it out of images and music projects, which cannot have it', () => {
    const images = { ...video({ prompt: 'p' }), output: { ...CONFIG.output, mode: 'images' } };
    expect(load(toYaml(images)) as Record<string, unknown>).not.toHaveProperty('bgm');
  });

  describe('edits', () => {
    let store: EditorStore;
    let http: HttpTestingController;

    beforeEach(async () => {
      TestBed.configureTestingModule({ providers: [EditorStore, provideHttpClient(), provideHttpClientTesting()] });
      store = TestBed.inject(EditorStore);
      http = TestBed.inject(HttpTestingController);
      const loading = store.load('demo');
      http.expectOne('/api/projects/demo/config').flush({ yaml: 'x', parsed: structuredClone(CONFIG), valid: true });
      await loading;
    });

    afterEach(() => http.verify());

    it('choosing a prompt starts an empty one that blocks saving until it is written', () => {
      store.setBGMKind('prompt');
      expect(store.bgmIncomplete()).toBe(true);
      expect(store.canSave()).toBe(false);
      store.updateBGM({ prompt: 'calm piano' });
      expect(store.bgmIncomplete()).toBe(false);
      expect(store.canSave()).toBe(true);
    });

    it('switching from prompt to file drops the prompt and its seed', () => {
      store.setBGMKind('prompt');
      store.updateBGM({ prompt: 'calm', seed: 3 });
      store.setBGMKind('file');
      expect(store.config()!.bgm?.prompt).toBeUndefined();
      expect(store.config()!.bgm?.seed).toBeUndefined();
      expect(store.bgmIncomplete()).toBe(true); // no file yet
      store.updateBGM({ file: 'theme.mp3' });
      expect(store.bgmIncomplete()).toBe(false);
    });

    it('none removes the block', () => {
      store.setBGMKind('prompt');
      store.updateBGM({ prompt: 'calm' });
      store.setBGMKind('none');
      expect(store.config()!.bgm).toBeUndefined();
      expect(store.dirty()).toBe(true);
    });

    it('uploads a file under a free name and lists the sources again', async () => {
      store.sources.set([{ name: 'theme.mp3', size: 1, modified: '' }]);
      const up = store.uploadSource(new File(['x'], 'theme.mp3'));
      const put = http.expectOne({ method: 'PUT', url: '/api/projects/demo/sources/theme-2.mp3' });
      put.flush({ name: 'theme-2.mp3' }, { status: 201, statusText: 'Created' });
      await Promise.resolve();
      http.expectOne('/api/projects/demo/sources').flush({ sources: [{ name: 'theme.mp3', size: 1, modified: '' }, { name: 'theme-2.mp3', size: 1, modified: '' }] });
      expect(await up).toBe('theme-2.mp3');
      expect(store.sources().length).toBe(2);
    });

    it('uploads a starting picture with as=picture, a video or GIF stored as a png, and returns its metadata', async () => {
      store.sources.set([{ name: 'clip.png', size: 1, modified: '' }]);
      const up = store.uploadPicture(new File(['x'], 'clip.mp4'));
      const put = http.expectOne((r) => r.method === 'PUT' && r.url === '/api/projects/demo/sources/clip-2.png' && r.params.get('as') === 'picture' || r.urlWithParams === '/api/projects/demo/sources/clip-2.png?as=picture');
      put.flush({ name: 'clip-2.png', metadata: { prompt: 'a red apple', seed: 42 } }, { status: 201, statusText: 'Created' });
      await Promise.resolve();
      http.expectOne('/api/projects/demo/sources').flush({ sources: [] });
      expect(await up).toEqual({ name: 'clip-2.png', metadata: { prompt: 'a red apple', seed: 42 } });
    });

    it('keeps the reason when a starting picture is refused', async () => {
      const up = store.uploadPicture(new File([''], 'bad.gif'));
      http
        .expectOne((r) => r.urlWithParams === '/api/projects/demo/sources/bad.png?as=picture')
        .flush({ error: { code: 'validation', message: 'cannot take the first frame' } }, { status: 422, statusText: 'Unprocessable' });
      expect(await up).toBeNull();
      expect(store.sourceError()).toBe('cannot take the first frame');
    });

    it('keeps the reason when the upload is refused', async () => {
      const up = store.uploadSource(new File([''], 'a.mp3'));
      http
        .expectOne({ method: 'PUT', url: '/api/projects/demo/sources/a.mp3' })
        .flush({ error: { code: 'invalid', message: 'the file is empty' } }, { status: 400, statusText: 'Bad Request' });
      expect(await up).toBeNull();
      expect(store.sourceError()).toBe('the file is empty');
    });
  });
});

describe('toYaml: the adult label', () => {
  const base = { project: 'p', output: { mode: 'video', file: 'o.mp4', contact_sheet: false }, defaults: {}, scenes: [] } as never as Parameters<typeof toYaml>[0];
  it('keeps true, false and absent as they are', () => {
    expect(toYaml({ ...base, adult: true })).toContain('adult: true');
    expect(toYaml({ ...base, adult: false })).toContain('adult: false');
    expect(toYaml(base)).not.toContain('adult');
  });
});
