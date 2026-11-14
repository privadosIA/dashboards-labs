import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatTooltip } from '@angular/material/tooltip';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { load } from 'js-yaml';

import { ApiService } from '../../core/api.service';
import { CatalogEntry, EnvironmentReport, ProjectConfig } from '../../core/api.models';
import { EditorStore } from '../editor.store';
import { toYaml } from '../../shared/project-yaml';
import { EditorPageComponent } from '../editor-page/editor-page.component';
import { fakeStorage } from '../../core/storage-fake';
import { DefaultsPanelComponent } from './defaults-panel.component';
import { SCENE_FORM_TEST_PROVIDERS } from '../scene-form/dynamic/testing/scene-form-providers';

const BASE: ProjectConfig = {
  project: 'demo',
  output: { mode: 'video', file: 'out/demo.mp4', contact_sheet: false },
  defaults: {
    model: 'models/m.safetensors',
    voice: 'voices/v.onnx',
    resolution: '1024x576',
    sampler: 'euler',
    steps: 8,
    fps: 30,
    subject_prompt: '',
    negative_prompt: '',
    lora_model_dir: '',
  },
  scenes: [{ id: 'intro', prompt: 'ciudad', negative_prompt: '', tts_text: 'hola', speed: 1, lora: '' }],
};

const SET = {
  diffusion_model: 'models/krea2_turbo-Q4_K_M.gguf',
  llm: 'models/Qwen3VL-4B-Instruct-Q4_K_M.gguf',
  vae: 'models/wan_2.1_vae.safetensors',
  cfg_scale: 1,
};

const ENV: EnvironmentReport = {
  binaries: [],
  models: [
    { name: 'm.safetensors', size: 1 },
    { name: 'krea2_turbo-Q4_K_M.gguf', size: 1 },
    { name: 'Qwen3VL-4B-Instruct-Q4_K_M.gguf', size: 1 },
    { name: 'wan_2.1_vae.safetensors', size: 1 },
  ],
  voices: [{ name: 'v.onnx', size: 1 }],
  loras: [],
  gpus: [],
};

const ASSETS = {
  kinds: [
    { kind: 'model', dir: 'models', extensions: [], assets: [] },
    {
      kind: 'video',
      dir: 'models/video',
      extensions: [],
      assets: [
        { name: 'Wan2.2-TI2V-5B-Q4_K_S.gguf', size: 1 },
        { name: 'umt5-xxl-encoder-Q4_K_S.gguf', size: 1 },
        { name: 'wan2.2_vae.safetensors', size: 1 },
      ],
    },
  ],
};

/** The video inventory with the A14B files installed too. */
const ASSETS_A14B = {
  kinds: [
    ASSETS.kinds[0],
    {
      ...ASSETS.kinds[1],
      assets: [
        ...ASSETS.kinds[1].assets!,
        { name: 'Wan2.2-I2V-A14B-HighNoise-Q4_K_S.gguf', size: 1 },
        { name: 'Wan2.2-I2V-A14B-LowNoise-Q4_K_S.gguf', size: 1 },
      ],
    },
  ],
};

const CATALOG: CatalogEntry[] = [
  {
    id: 'krea2-turbo-q4',
    kind: 'model',
    name: 'Krea 2 Turbo',
    description: '',
    size_bytes: 1,
    files: [
      { name: 'krea2_turbo-Q4_K_M.gguf', role: 'model', url: 'https://x/k' },
      { name: 'Qwen3VL-4B-Instruct-Q4_K_M.gguf', role: 'text_encoder', url: 'https://x/q' },
    ],
    installed: true,
    preset: { steps: 8, cfg_scale: 1, resolution: '1024x576' },
  },
  {
    id: 'sdxl-pony-diffusion-v6',
    kind: 'model',
    name: 'Pony',
    description: '',
    size_bytes: 1,
    files: [{ name: 'pony.safetensors', role: 'model', url: 'https://x/p' }],
    installed: true,
    preset: { steps: 25 },
    prompt_hint: 'Empieza con score_9, score_8_up, score_7_up',
  },
  {
    id: 'sd-1-5',
    kind: 'model',
    name: 'SD 1.5',
    description: '',
    size_bytes: 1,
    files: [{ name: 'v1-5-pruned-emaonly.safetensors', url: 'https://x/s' }],
    installed: true,
  },
];

type PanelApi = {
  modelMode(): string;
  pickModel(value: string, mode: 'checkpoint' | 'set'): void;
  setOptions(f: string): { value: string; missing: boolean }[];
  animateOptions(f: string): { value: string; missing: boolean }[];
  setEngine(e: string): void;
  moduleOptions(): { value: string; missing: boolean }[];
  checkpointOptions(): { value: string; missing: boolean }[];
};

describe('DefaultsPanelComponent: model sets and animation', () => {
  let fixture: ComponentFixture<EditorPageComponent>;
  let http: HttpTestingController;
  let store: EditorStore;

  async function mount(config: ProjectConfig): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [EditorPageComponent],
      // A music project redirects to the music studio: any route will do for that navigation to succeed.
      providers: [provideHttpClient(), provideHttpClientTesting(), ...SCENE_FORM_TEST_PROVIDERS, provideRouter([{ path: '**', children: [] }])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(EditorPageComponent);
    fixture.componentRef.setInput('id', 'demo');
    fixture.detectChanges();
    http
      .expectOne('/api/projects/demo/config')
      .flush({ yaml: '', parsed: structuredClone(config), valid: true, warnings: [] });
    http.expectOne('/api/environment').flush(ENV);
    await fixture.whenStable();
    fixture.detectChanges();
    store = fixture.debugElement.injector.get(EditorStore);
  }

  /** What the next catalog request answers; `null` makes it fail. */
  let catalogReply: CatalogEntry[] | null = CATALOG;
  /** Answers the catalog request the panel makes once a model set is in use. */
  function answerCatalog(): void {
    for (const r of http.match('/api/assets/catalog')) {
      if (catalogReply) r.flush({ entries: catalogReply });
      else r.flush({}, { status: 500, statusText: 'boom' });
    }
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const panel = () =>
    fixture.debugElement.query(By.directive(DefaultsPanelComponent)).componentInstance as PanelApi;
  async function settle(): Promise<void> {
    await fixture.whenStable();
    answerCatalog();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  /** Expands the accordion panels so their content is rendered and queryable. */
  async function expandAll(): Promise<void> {
    for (const h of Array.from(el().querySelectorAll('mat-expansion-panel-header')) as HTMLElement[]) {
      if (h.getAttribute('aria-expanded') !== 'true') h.click();
    }
    await settle();
  }
  /** Full values the selects keep in their tooltips. */
  const tooltipMessages = () =>
    fixture.debugElement.queryAll(By.directive(MatTooltip)).map((d) => d.injector.get(MatTooltip).message);
  const toggleButtons = () =>
    Array.from(el().querySelectorAll('[data-testid=model-mode] button')) as HTMLButtonElement[];

  beforeEach(() => {
    catalogReply = CATALOG;
  });
  afterEach(() => {
    answerCatalog();
    // expandAll() also opens the background-music panel, which lists the project's sources
    http.match((r) => r.url.endsWith('/sources')).forEach((r) => r.flush({ sources: [] }));
    http.match((r) => r.url.endsWith('/manifest.json')); // the scene form of an images project looks for its pictures
    http.verify();
  });

  it('opens a project with a model set in model-set mode and shows its three files', async () => {
    await mount({ ...BASE, defaults: { ...BASE.defaults, model: '', model_set: SET } });
    await expandAll();
    expect(panel().modelMode()).toBe('set');
    const selects = Array.from(el().querySelectorAll('mat-select')).map((s) => s.textContent ?? '');
    expect(selects.some((t) => t.includes('models/krea2') && t.includes('Q4_K_M.gguf'))).toBe(true);
    // long paths are shortened in the middle (start and variant kept) ...
    expect(selects.some((t) => t.includes('models/Qwen3') && t.includes('Q4_K_M.gguf') && t.includes('…'))).toBe(true);
    expect(selects.some((t) => t.includes('models/wan_2') && t.includes('safetensors'))).toBe(true);
    // ... and the full value stays in a tooltip
    expect(tooltipMessages()).toContain('models/Qwen3VL-4B-Instruct-Q4_K_M.gguf');
    expect(tooltipMessages()).toContain('models/krea2_turbo-Q4_K_M.gguf');
    // the single-checkpoint selector is not there
    expect(el().textContent).not.toContain('Modelo (sd)');
    expect(el().textContent).toContain('cfg_scale');
    expect(el().querySelector('[data-testid=model-set-note]')?.textContent).toContain('cfg_scale 1');
  });

  it('opens a plain project in checkpoint mode', async () => {
    await mount(BASE);
    await expandAll();
    expect(panel().modelMode()).toBe('checkpoint');
    expect(el().textContent).toContain('Modelo (sd)');
    expect(el().querySelector('[data-testid=model-set-note]')).toBeNull();
  });

  it('leaves the global prompts empty, not "undefined", when the project has none', async () => {
    const defaults: Record<string, unknown> = { ...BASE.defaults };
    delete defaults['subject_prompt'];
    delete defaults['negative_prompt'];
    await mount({ ...BASE, defaults: defaults as ProjectConfig['defaults'] });
    await expandAll();
    const values = Array.from(el().querySelectorAll('input')).map((i) => i.value);
    expect(values).not.toContain('undefined');
  });

  it('switching to a model set clears the checkpoint, and switching back removes the set', async () => {
    await mount(BASE);
    await expandAll();
    toggleButtons()[1].click(); // Conjunto de modelos
    await settle();
    expect(store.config()!.defaults.model).toBe('');
    expect(store.config()!.defaults.model_set).toEqual({ diffusion_model: '', llm: '', vae: '' });
    expect(panel().modelMode()).toBe('set');

    toggleButtons()[0].click(); // Checkpoint único
    await settle();
    expect(store.config()!.defaults.model_set).toBeUndefined();
    expect(panel().modelMode()).toBe('checkpoint');
  });

  it('keeps a configured file that is missing from models/ selected and flagged', async () => {
    await mount({
      ...BASE,
      defaults: { ...BASE.defaults, model: '', model_set: { ...SET, vae: 'models/ya_no_esta.safetensors' } },
    });
    const opts = panel().setOptions('vae');
    expect(opts[0]).toEqual({ value: 'models/ya_no_esta.safetensors', missing: true });
    expect(opts.some((o) => o.value === 'models/wan_2.1_vae.safetensors' && !o.missing)).toBe(true);
    // the files that exist are not flagged
    expect(panel().setOptions('llm').every((o) => !o.missing)).toBe(true);
  });

  it('offers the installed models for each file of the set', async () => {
    await mount({ ...BASE, defaults: { ...BASE.defaults, model: '', model_set: SET } });
    for (const f of ['diffusion_model', 'llm', 'vae']) {
      expect(panel().setOptions(f).map((o) => o.value)).toContain('models/krea2_turbo-Q4_K_M.gguf');
    }
  });

  it('configuring Wan loads the video inventory and writes no optional setting', async () => {
    await mount(BASE);
    await expandAll();
    const enable = el().querySelector('[data-testid=animate-enable] input') as HTMLInputElement;
    enable.click();
    await settle();
    http.expectOne('/api/assets').flush(ASSETS);
    await settle();
    expect(store.config()!.defaults.animate).toEqual({ diffusion_model: '', t5xxl: '', vae: '' });
    expect(panel().animateOptions('diffusion_model').map((o) => o.value)).toEqual([
      'models/video/Wan2.2-TI2V-5B-Q4_K_S.gguf',
      'models/video/umt5-xxl-encoder-Q4_K_S.gguf',
      'models/video/wan2.2_vae.safetensors',
    ]);

    store.updateAnimate({
      diffusion_model: 'models/video/Wan2.2-TI2V-5B-Q4_K_S.gguf',
      t5xxl: 'models/video/umt5-xxl-encoder-Q4_K_S.gguf',
      vae: 'models/video/wan2.2_vae.safetensors',
    });
    await settle();
    const doc = load(toYaml(store.config()!)) as { defaults: { animate: Record<string, unknown> } };
    expect(Object.keys(doc.defaults.animate).sort()).toEqual(['diffusion_model', 't5xxl', 'vae']);
  });

  it('shows the defaults as suggestions in the optional settings', async () => {
    await mount(BASE);
    await expandAll();
    (el().querySelector('[data-testid=animate-enable] input') as HTMLInputElement).click();
    await settle();
    http.expectOne('/api/assets').flush(ASSETS);
    await settle();
    const placeholders = Array.from(el().querySelectorAll('[data-testid=animate-panel] input[placeholder]')).map(
      (i) => (i as HTMLInputElement).placeholder,
    );
    expect(placeholders).toEqual(expect.arrayContaining(['832x480', '33', '16', '20', '6']));
    // the defaults are also visible as hints (Material hides placeholders while the label sits in the field)
    const hints = Array.from(el().querySelectorAll('[data-testid=animate-panel] mat-hint')).map((h) =>
      (h.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
    for (const v of ['832x480', '33', '16', '20', '6']) {
      expect(hints).toContain(`por defecto ${v}`);
    }
  });

  it('turning the animation off removes defaults.animate', async () => {
    await mount({
      ...BASE,
      defaults: {
        ...BASE.defaults,
        animate: { diffusion_model: 'models/video/a.gguf', t5xxl: 'models/video/b.gguf', vae: 'models/video/c.safetensors' },
      },
    });
    http.expectOne('/api/assets').flush(ASSETS); // the block exists: the inventory is loaded
    await expandAll();
    (el().querySelector('[data-testid=animate-enable] input') as HTMLInputElement).click();
    await settle();
    expect(store.config()!.defaults.animate).toBeUndefined();
  });

  it('says that animation is not used in images mode', async () => {
    await mount({ ...BASE, output: { mode: 'images', file: '', contact_sheet: false } });
    await expandAll();
    expect(el().querySelector('[data-testid=animate-images-note]')?.textContent).toContain('modo imágenes');
  });

  it('does not ask for the video inventory when nothing uses the animation block', async () => {
    await mount(BASE);
    await expandAll();
    expect(http.match('/api/assets')).toHaveLength(0);
  });

  it('flags "no está en disco" only on a file that is really missing, not on every selection', async () => {
    await mount({
      ...BASE,
      defaults: { ...BASE.defaults, model: '', model_set: { ...SET, vae: 'models/ya_no_esta.safetensors' } },
    });
    await expandAll();
    const texts = Array.from(el().querySelector('[data-testid=defaults-section]')!.querySelectorAll('mat-select')).map(
      (s) => (s.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
    const byFile = (name: string) => texts.find((t) => t.includes(name))!;
    expect(byFile('models/krea2')).not.toContain('no está en disco');
    expect(byFile('models/Qwen3')).not.toContain('no está en disco');
    expect(byFile('models/ya_no')).toContain('no está en disco');
  });

  describe('form grid', () => {
    it('gives every field of the sections a fixed share of the row, so none floats free', async () => {
      await mount({ ...BASE, defaults: { ...BASE.defaults, model: '', model_set: SET } });
      http.expectNone('/api/assets');
      await expandAll();
      const fields = Array.from(el().querySelectorAll('.grid > mat-form-field')) as HTMLElement[];
      expect(fields.length).toBeGreaterThan(8);
      const unsized = fields.filter((f) => !/\b(span-\d+|wide)\b/.test(f.className));
      expect(unsized.map((f) => f.textContent?.trim().slice(0, 20))).toEqual([]);
    });

    it('puts the note and the recommended-settings button beside cfg_scale, in their own block', async () => {
      await mount({ ...BASE, defaults: { ...BASE.defaults, model: '', model_set: SET } });
      await expandAll();
      const aux = el().querySelector('.grid > .aux') as HTMLElement;
      expect(aux).not.toBeNull();
      expect(aux.querySelector('[data-testid=model-set-note]')).not.toBeNull();
      expect(aux.querySelector('[data-testid=apply-preset]')).not.toBeNull();
      // the note and the button are not loose items of the grid that could touch the next row
      expect(el().querySelector('.grid > [data-testid=model-set-note]')).toBeNull();
      expect(el().querySelector('.grid > .preset')).toBeNull();
    });
  });

  describe('AnimateDiff engine', () => {
    const SD15: CatalogEntry = {
      id: 'sd-1-5',
      kind: 'model',
      name: 'SD 1.5',
      description: '',
      size_bytes: 1,
      installed: true,
      files: [{ name: 'v1-5-pruned-emaonly.safetensors', role: 'model', url: '' }],
    };
    const MODULE: CatalogEntry = {
      id: 'video-animatediff-sd15-v3',
      kind: 'video',
      name: 'AnimateDiff v3',
      description: '',
      size_bytes: 1,
      installed: true,
      preset: { steps: 25, cfg_scale: 7, resolution: '512x512' },
      files: [{ name: 'mm_sd15_v3.safetensors', role: 'motion_module', url: '' }],
    };
    const WAN_BLOCK = {
      diffusion_model: 'models/video/Wan2.2-TI2V-5B-Q4_K_S.gguf',
      t5xxl: 'models/video/umt5-xxl-encoder-Q4_K_S.gguf',
      vae: 'models/video/wan2.2_vae.safetensors',
      frames: 33,
    };
    const ASSETS_AD = {
      kinds: [ASSETS.kinds[0], { ...ASSETS.kinds[1], assets: [...ASSETS.kinds[1].assets!, { name: 'mm_sd15_v3.safetensors', size: 1 }] }],
    };
    const open = async (animate: Record<string, unknown>, catalog: CatalogEntry[] = [...CATALOG, SD15, MODULE]) => {
      catalogReply = catalog;
      await mount({ ...BASE, defaults: { ...BASE.defaults, animate } });
      http.expectOne('/api/assets').flush(ASSETS_AD);
      await expandAll();
    };
    const note = () => el().querySelector('[data-testid=engine-applied]')?.textContent ?? '';
    const yaml = () => load(toYaml(store.config()!)) as { defaults: { animate: Record<string, unknown> } };

    it('a Wan project shows the Wan fields and no AnimateDiff ones', async () => {
      await open(WAN_BLOCK);
      expect(el().querySelector('[data-testid=animate-engine]')).not.toBeNull();
      expect(el().querySelector('[data-testid=animate-highnoise]')).not.toBeNull();
      expect(el().querySelector('[data-testid=animate-module]')).toBeNull();
      expect(el().querySelector('[data-testid=animate-strength]')).toBeNull();
    });

    it('choosing AnimateDiff applies the preset in one edit and shows its fields instead of the Wan ones', async () => {
      await open(WAN_BLOCK);
      panel().setEngine('animatediff');
      await settle();
      expect(store.config()!.defaults.animate).toMatchObject({
        engine: 'animatediff',
        checkpoint: 'models/v1-5-pruned-emaonly.safetensors',
        motion_module: 'models/video/mm_sd15_v3.safetensors',
        resolution: '512x512',
        steps: 25,
        cfg_scale: 7,
      });
      expect(store.config()!.defaults.animate?.frames).toBeUndefined();
      expect(el().querySelector('[data-testid=animate-module]')).not.toBeNull();
      expect(el().querySelector('[data-testid=animate-checkpoint]')).not.toBeNull();
      expect(el().querySelector('[data-testid=animate-strength]')).not.toBeNull();
      expect(el().querySelector('[data-testid=animate-highnoise]')).toBeNull();
      expect(note()).toContain('AnimateDiff');
      expect(el().querySelector('[data-testid=animatediff-note]')?.textContent).toContain('misma proporción');
      const hints = Array.from(el().querySelectorAll('[data-testid=animate-panel] mat-hint')).map((h) =>
        (h.textContent ?? '').replace(/\s+/g, ' ').trim(),
      );
      for (const v of ['512x512', '16', '8', '25', '7', '0.75']) expect(hints).toContain(`por defecto ${v}`);
    });

    it('Deshacer restores the Wan block', async () => {
      await open(WAN_BLOCK);
      panel().setEngine('animatediff');
      await settle();
      (el().querySelector('[data-testid=undo-engine]') as HTMLButtonElement).click();
      await settle();
      expect(store.config()!.defaults.animate).toEqual(WAN_BLOCK);
      expect(el().querySelector('[data-testid=engine-applied]')).toBeNull();
    });

    it('going back to Wan keeps the AnimateDiff files in the data and shows the Wan fields again', async () => {
      await open(WAN_BLOCK);
      panel().setEngine('animatediff');
      await settle();
      panel().setEngine('wan');
      await settle();
      expect(store.config()!.defaults.animate).toMatchObject({ engine: 'wan', diffusion_model: WAN_BLOCK.diffusion_model, motion_module: 'models/video/mm_sd15_v3.safetensors' });
      expect(store.config()!.defaults.animate?.frames).toBeUndefined(); // Wan's 4n+1 default again
      expect(el().querySelector('[data-testid=animate-highnoise]')).not.toBeNull();
      expect(el().querySelector('[data-testid=animate-module]')).toBeNull();
    });

    it('offers the installed image models and the installed motion modules, and flags a missing one', async () => {
      await open({ engine: 'animatediff', checkpoint: 'models/m.safetensors', motion_module: 'models/video/gone.safetensors' });
      expect(panel().checkpointOptions().map((o) => o.value)).toContain('models/m.safetensors');
      expect(panel().moduleOptions()).toEqual([
        { value: 'models/video/gone.safetensors', missing: true },
        { value: 'models/video/mm_sd15_v3.safetensors', missing: false },
      ]);
    });

    it('points to the Vídeo tab when the module is not installed', async () => {
      await open(WAN_BLOCK, [SD15, { ...MODULE, installed: false }]);
      panel().setEngine('animatediff');
      await settle();
      expect(el().querySelector('[data-testid=engine-module-missing]')?.textContent).toContain('Vídeo');
    });

    it('writes an AnimateDiff block without empty Wan paths', async () => {
      await open({ engine: 'animatediff', checkpoint: 'models/m.safetensors', motion_module: 'models/video/mm_sd15_v3.safetensors' });
      expect(Object.keys(yaml().defaults.animate).sort()).toEqual(['checkpoint', 'engine', 'motion_module']);
    });

    it('the quality levels follow the engine and leave it alone', async () => {
      await open({ engine: 'animatediff', checkpoint: 'models/m.safetensors', motion_module: 'models/video/mm_sd15_v3.safetensors' });
      store.applyTier('high', store.catalog(), {});
      await settle();
      expect(store.config()!.defaults.animate).toMatchObject({
        engine: 'animatediff',
        checkpoint: 'models/m.safetensors',
        resolution: '640x640',
        frames: 24,
        steps: 38,
      });
      expect(el().querySelector('[data-testid=tier-video-note]')?.textContent).toContain('AnimateDiff');
    });
  });

  describe('high-noise expert (Wan A14B)', () => {
    const A = {
      diffusion_model: 'models/video/Wan2.2-I2V-A14B-LowNoise-Q4_K_S.gguf',
      t5xxl: 'models/video/umt5-xxl-encoder-Q4_K_S.gguf',
      vae: 'models/video/wan_2.1_vae.safetensors',
    };
    const HN = 'models/video/Wan2.2-I2V-A14B-HighNoise-Q4_K_S.gguf';
    const withAnimate = (a: Record<string, unknown>) => ({
      ...BASE,
      defaults: { ...BASE.defaults, animate: { ...A, ...a } },
    });
    const open = async (a: Record<string, unknown>) => {
      await mount(withAnimate(a));
      http.expectOne('/api/assets').flush(ASSETS_A14B);
      await expandAll();
    };
    const highSteps = () => el().querySelector('[data-testid=animate-highnoise-steps]') as HTMLInputElement | null;
    const highCfg = () => el().querySelector('[data-testid=animate-highnoise-cfg]') as HTMLInputElement | null;
    const setNum = async (input: HTMLInputElement, v: string) => {
      input.value = v;
      input.dispatchEvent(new Event('change'));
      await settle();
    };
    const yaml = () => load(toYaml(store.config()!)) as { defaults: { animate: Record<string, unknown> } };

    it('shows the optional selector and no high-noise fields while no expert is chosen', async () => {
      await open({});
      expect(el().querySelector('[data-testid=animate-highnoise]')).not.toBeNull();
      expect(highSteps()).toBeNull();
      expect(highCfg()).toBeNull();
      expect(el().querySelector('[data-testid=highnoise-note]')).toBeNull();
    });

    it('choosing an expert shows its steps and cfg with the two-expert defaults and the cost note', async () => {
      await open({});
      store.setHighNoiseModel(HN);
      await settle();
      expect(highSteps()).not.toBeNull();
      expect(highCfg()).not.toBeNull();
      expect(highSteps()!.value).toBe('');
      expect(highCfg()!.value).toBe('');
      const hints = Array.from(el().querySelectorAll('[data-testid=animate-panel] mat-hint')).map((h) =>
        (h.textContent ?? '').replace(/\s+/g, ' ').trim(),
      );
      for (const v of ['8', '3.5', '10']) expect(hints).toContain(`por defecto ${v}`);
      expect(hints).not.toContain('por defecto 20'); // steps default follows the mode
      const note = el().querySelector('[data-testid=highnoise-note]')?.textContent ?? '';
      expect(note).toContain('ocho veces');
      expect(note).toContain('21 GB');
      expect(note).toContain('no una garantía');
    });

    it('writes only the expert when its steps and cfg are left empty', async () => {
      await open({});
      store.setHighNoiseModel(HN);
      await settle();
      expect(Object.keys(yaml().defaults.animate).sort()).toEqual(
        ['diffusion_model', 'high_noise_diffusion_model', 't5xxl', 'vae'],
      );
    });

    it('keeps what the user types for the high-noise steps and cfg, with cfg 0 as a value', async () => {
      await open({ high_noise_diffusion_model: HN });
      await setNum(highSteps()!, '6');
      await setNum(highCfg()!, '0');
      expect(yaml().defaults.animate).toMatchObject({ high_noise_steps: 6, high_noise_cfg_scale: 0 });
      await setNum(highSteps()!, '');
      expect(yaml().defaults.animate['high_noise_steps']).toBeUndefined();
    });

    it('clearing the expert removes every high_noise_* key from the saved project', async () => {
      await open({ high_noise_diffusion_model: HN, high_noise_steps: 6, high_noise_cfg_scale: 2 });
      store.setHighNoiseModel('');
      await settle();
      const keys = Object.keys(yaml().defaults.animate);
      expect(keys.filter((k) => k.startsWith('high_noise'))).toEqual([]);
      expect(highSteps()).toBeNull();
    });

    it('lists the installed files, flagging a configured one that is gone', async () => {
      await open({ high_noise_diffusion_model: 'models/video/ya_no_esta.gguf' });
      const opts = (panel() as unknown as { animateOptions(f: string): { value: string; missing: boolean }[] }).animateOptions(
        'high_noise_diffusion_model',
      );
      expect(opts[0]).toEqual({ value: 'models/video/ya_no_esta.gguf', missing: true });
      expect(opts.some((o) => o.value === HN && !o.missing)).toBe(true);
    });

    it('flags a configured high-noise expert that is gone, in the closed selector too', async () => {
      await open({ high_noise_diffusion_model: 'models/video/ya_no_esta.gguf' });
      const sel = el().querySelector('[data-testid=animate-highnoise]') as HTMLElement;
      expect((sel.textContent ?? '').replace(/\s+/g, ' ')).toContain('no está en disco');
    });

    it('shows "ninguno" while no expert is chosen', async () => {
      await open({});
      const sel = el().querySelector('[data-testid=animate-highnoise]') as HTMLElement;
      expect(sel.textContent).toContain('ninguno');
    });

    it('blocks saving with a negative high-noise cfg and shows the error', async () => {
      await open({ high_noise_diffusion_model: HN });
      await setNum(highCfg()!, '-1');
      expect(store.validation()?.valid).toBe(false);
      expect(el().textContent).toContain('high_noise_cfg_scale no puede ser negativo');
    });
  });

  describe('recommended settings', () => {
    const preset = () => el().querySelector('[data-testid=apply-preset]') as HTMLButtonElement | null;
    const withSet = (over: Partial<typeof SET> = {}) => ({
      ...BASE,
      defaults: { ...BASE.defaults, model: '', steps: 20, resolution: '512x512', model_set: { ...SET, cfg_scale: 7, ...over } },
    });

    it('offers the preset of the chosen model and applies steps, cfg and resolution in one edit', async () => {
      await mount(withSet());
      await expandAll();
      expect(preset()).not.toBeNull();
      expect(el().querySelector('[data-testid=preset-values]')?.textContent).toContain('8 pasos');
      expect(el().querySelector('[data-testid=preset-values]')?.textContent).toContain('cfg 1');
      expect(el().querySelector('[data-testid=preset-values]')?.textContent).toContain('1024x576');
      store.dirty.set(false);

      preset()!.click();
      await settle();
      const d = store.config()!.defaults;
      expect([d.steps, d.resolution, d.model_set?.cfg_scale]).toEqual([8, '1024x576', 1]);
      expect(store.dirty()).toBe(true);
    });

    it('applies the preset of the new model when it is chosen, and says so', async () => {
      await mount(withSet({ diffusion_model: '' }));
      await expandAll();
      expect(preset()).toBeNull();
      panel().pickModel('models/krea2_turbo-Q4_K_M.gguf', 'set');
      await settle();
      const d = store.config()!.defaults;
      expect(d.model_set?.diffusion_model).toBe('models/krea2_turbo-Q4_K_M.gguf');
      expect([d.steps, d.resolution, d.model_set?.cfg_scale]).toEqual([8, '1024x576', 1]);
      expect(el().querySelector('[data-testid=preset-applied]')?.textContent).toContain('8 pasos');
    });

    it('"Deshacer" restores the values the automatic apply overwrote', async () => {
      await mount(withSet({ diffusion_model: '' }));
      await expandAll();
      panel().pickModel('models/krea2_turbo-Q4_K_M.gguf', 'set');
      await settle();
      (el().querySelector('[data-testid=undo-preset]') as HTMLButtonElement).click();
      await settle();
      const d = store.config()!.defaults;
      expect([d.steps, d.resolution, d.model_set?.cfg_scale]).toEqual([20, '512x512', 7]);
      expect(el().querySelector('[data-testid=preset-applied]')).toBeNull();
    });

    it('opening a project applies nothing', async () => {
      await mount(withSet());
      await expandAll();
      const d = store.config()!.defaults;
      expect([d.steps, d.resolution, d.model_set?.cfg_scale]).toEqual([20, '512x512', 7]);
      expect(el().querySelector('[data-testid=preset-applied]')).toBeNull();
    });

    it('does nothing when the chosen model has no preset', async () => {
      await mount(withSet());
      await expandAll();
      panel().pickModel('models/v1-5-pruned-emaonly.safetensors', 'set');
      await settle();
      const d = store.config()!.defaults;
      expect([d.steps, d.resolution, d.model_set?.cfg_scale]).toEqual([20, '512x512', 7]);
      expect(el().querySelector('[data-testid=preset-applied]')).toBeNull();
    });

    it('is not offered for a model without a preset', async () => {
      await mount(withSet({ diffusion_model: 'models/v1-5-pruned-emaonly.safetensors' }));
      await expandAll();
      expect(preset()).toBeNull();
    });

    it('is not offered when the catalog fails, and nothing breaks', async () => {
      catalogReply = null;
      await mount(withSet());
      await expandAll();
      expect(preset()).toBeNull();
      expect(el().querySelector('[data-testid=model-set-note]')).not.toBeNull();
    });

    it('works with a single checkpoint: steps only, and shows the prompt hint', async () => {
      await mount({ ...BASE, defaults: { ...BASE.defaults, model: 'models/m.safetensors', steps: 8, resolution: '512x512' } });
      await expandAll();
      expect(preset()).toBeNull();
      expect(el().querySelector('[data-testid=prompt-hint]')).toBeNull();
      panel().pickModel('models/pony.safetensors', 'checkpoint');
      await settle();
      const d = store.config()!.defaults;
      expect([d.steps, d.resolution, d.model]).toEqual([25, '512x512', 'models/pony.safetensors']);
      expect(preset()).not.toBeNull();
      expect(el().querySelector('[data-testid=prompt-hint]')?.textContent).toContain('score_9, score_8_up, score_7_up');
      expect(store.config()!.defaults.model_set).toBeUndefined();
    });

    it('skips the fields the preset does not declare', async () => {
      await mount(withSet());
      store.applyPreset({ cfg_scale: 0.5 });
      const d = store.config()!.defaults;
      expect([d.steps, d.resolution, d.model_set?.cfg_scale]).toEqual([20, '512x512', 0.5]);
    });
  });

  describe('MiniMax H3 mode', () => {
    const h3 = (id: string, model: string, lora: string): CatalogEntry => ({
      id, kind: 'video', name: id, description: '', size_bytes: 1, installed: true,
      files: [
        { name: model, role: 'model', url: '' }, { name: 'enc.gguf', role: 'text_encoder', url: '' },
        { name: 'vae.safetensors', role: 'vae', url: '' }, { name: 'avae.safetensors', role: 'audio_vae', url: '' },
        { name: lora, role: 'lora', url: '' },
      ],
    });
    const REF = h3('ref', 'ref2va.gguf', 'turbo4.safetensors');
    const FF = h3('ff', 'fl2va.gguf', 'turbo8.safetensors');

    it('the image mode select switches first frame and reference, swapping the DiT and the LoRA together', async () => {
      catalogReply = [REF, FF];
      const cfg = { ...BASE, defaults: { ...BASE.defaults, animate: { engine: 'minimax-h3', diffusion_model: 'models/video/ref2va.gguf', llm: 'models/video/enc.gguf', vae: 'models/video/vae.safetensors', audio_vae: 'models/video/avae.safetensors', lora: 'models/video/turbo4.safetensors' } } };
      await mount(cfg as ProjectConfig);
      http.expectOne('/api/assets').flush(ASSETS); // the block exists: the inventory is loaded
      await expandAll();
      await settle();
      const sel = el().querySelector('[data-testid=animate-mm-mode]');
      expect(sel).not.toBeNull();
      expect(sel?.textContent).toContain('Referencia');
      store.setMiniMaxMode(true);
      await settle();
      expect(store.config()!.defaults.animate).toMatchObject({ first_frame: true, diffusion_model: 'models/video/fl2va.gguf', lora: 'models/video/turbo8.safetensors' });
      expect(el().querySelector('[data-testid=animate-mm-mode]')?.textContent).toContain('Primer fotograma');
      store.setMiniMaxMode(false);
      await settle();
      expect(store.config()!.defaults.animate).toMatchObject({ diffusion_model: 'models/video/ref2va.gguf', lora: 'models/video/turbo4.safetensors' });
      expect(store.config()!.defaults.animate?.first_frame).toBeUndefined();
    });
  });

  describe('LTX 2.3 mode', () => {
    const LTX: CatalogEntry = {
      id: 'ltx', kind: 'video', name: 'LTX 2.3', description: '', size_bytes: 1, installed: true,
      preset: { steps: 8, cfg_scale: 1, resolution: '768x416' },
      files: [
        { name: 'ltx.gguf', role: 'model', url: '' }, { name: 'gemma.gguf', role: 'text_encoder', url: '' },
        { name: 'lv.safetensors', role: 'vae', url: '' }, { name: 'la.safetensors', role: 'audio_vae', url: '' },
        { name: 'conn.safetensors', role: 'connectors', url: '' },
      ],
    };

    it('choosing the engine writes the five files and shows five selectors, the grid note and no FPS', async () => {
      catalogReply = [LTX];
      const cfg = { ...BASE, defaults: { ...BASE.defaults, animate: { diffusion_model: 'models/video/w.gguf', t5xxl: 't', vae: 'v' } } };
      await mount(cfg as ProjectConfig);
      http.expectOne('/api/assets').flush(ASSETS);
      await expandAll();
      await settle();
      store.setAnimateEngine('ltx-2.3');
      await settle();
      expect(store.config()!.defaults.animate).toMatchObject({
        engine: 'ltx-2.3', diffusion_model: 'models/video/ltx.gguf', llm: 'models/video/gemma.gguf', vae: 'models/video/lv.safetensors',
        audio_vae: 'models/video/la.safetensors', connectors: 'models/video/conn.safetensors', resolution: '768x416', steps: 8,
      });
      for (const id of ['animate-ltx-dit', 'animate-ltx-llm', 'animate-ltx-vae', 'animate-ltx-audio-vae', 'animate-ltx-connectors']) {
        expect(el().querySelector(`[data-testid=${id}]`), id).not.toBeNull();
      }
      expect(el().querySelector('[data-testid=ltx-note]')?.textContent).toContain('8k+1');
      expect(el().querySelector('[data-testid=engine-ltx-missing]')).toBeNull();
      expect(el().querySelector('[data-testid=animate-mm-mode]')).toBeNull();
    });

    it('the ambient-sound toggle is shown for LTX, saves model_audio, and engine presets leave it alone', async () => {
      catalogReply = [LTX];
      const cfg = { ...BASE, defaults: { ...BASE.defaults, animate: { diffusion_model: 'models/video/w.gguf', t5xxl: 't', vae: 'v' } } };
      await mount(cfg as ProjectConfig);
      http.expectOne('/api/assets').flush(ASSETS);
      await expandAll();
      await settle();
      expect(el().querySelector('[data-testid=animate-model-audio]'), 'hidden for Wan').toBeNull();
      store.setAnimateEngine('ltx-2.3');
      await settle();
      expect(el().querySelector('[data-testid=animate-model-audio]')).not.toBeNull();
      expect(store.config()!.defaults.animate?.model_audio).toBeUndefined();
      store.updateAnimate({ model_audio: true });
      store.setAnimateEngine('ltx-2.3');
      await settle();
      expect(store.config()!.defaults.animate?.model_audio).toBe(true);
      store.setAnimateEngine('wan');
      await settle();
      expect(store.config()!.defaults.animate?.model_audio).toBeUndefined();
      expect(el().querySelector('[data-testid=animate-model-audio]')).toBeNull();
    });

    it('flags a bundle that is not completely installed and Undo goes back to the Wan block', async () => {
      catalogReply = [{ ...LTX, installed: false }];
      const wanBlock = { diffusion_model: 'models/video/w.gguf', t5xxl: 't', vae: 'v' };
      const cfg = { ...BASE, defaults: { ...BASE.defaults, animate: wanBlock } };
      await mount(cfg as ProjectConfig);
      http.expectOne('/api/assets').flush(ASSETS);
      await expandAll();
      await settle();
      store.setAnimateEngine('ltx-2.3');
      await settle();
      expect(el().querySelector('[data-testid=engine-ltx-missing]')).not.toBeNull();
      store.undoAnimateEngine();
      await settle();
      expect(store.config()!.defaults.animate).toEqual(wanBlock);
    });
  });

  describe('easy mode', () => {
    const btn = (id: string) => el().querySelector(`[data-testid=${id}]`) as HTMLButtonElement;
    const TIMED: CatalogEntry[] = [
      { ...CATALOG[0], styles: ['photo'], style_rank: 1, vram_mb: 8000, timing: { seconds: 18, resolution: '1024x576', steps: 8, measured: true } },
    ];
    const imagesSet = () => ({
      ...BASE,
      output: { ...BASE.output, mode: 'images' },
      defaults: { ...BASE.defaults, model: '', steps: 3, resolution: '800x800', model_set: SET },
      scenes: [{ ...BASE.scenes[0], variants: 9 }],
    });
    beforeEach(() => {
      ENV.gpus = [{ index: 0, name: 'NVIDIA GeForce RTX 5060 Ti', free_vram_mb: 15000, total_vram_mb: 16311 }];
      ENV.ram = { total_bytes: 30 * 2 ** 30, available_bytes: 25 * 2 ** 30 };
      catalogReply = TIMED;
    });
    afterEach(() => {
      ENV.gpus = [];
      delete ENV.ram;
    });

    it('shows what it would do for this machine and how long it takes, and writes nothing yet', async () => {
      await mount(imagesSet());
      await expandAll();
      expect(el().querySelector('[data-testid=auto-machine]')?.textContent).toContain('RTX 5060 Ti');
      expect(el().querySelector('[data-testid=auto-machine]')?.textContent).toContain('30');
      expect(el().querySelector('[data-testid=auto-lines]')?.textContent).toContain('Imagen');
      expect(el().querySelector('[data-testid=auto-time]')?.textContent).toMatch(/≈ \d+ min|≈ \d+ h/);
      expect(store.config()!.defaults.resolution).toBe('800x800');
    });

    it('applies the plan in one edit and Undo puts the project back', async () => {
      await mount(imagesSet());
      await expandAll();
      btn('auto-apply').click();
      await settle();
      const d = store.config()!.defaults;
      expect(d.resolution).toBe('1280x704'); // the highest level, with no limit
      expect(d.steps).toBe(12);
      expect(el().querySelector('[data-testid=auto-applied]')?.textContent).toContain('Imagen');
      btn('auto-undo').click();
      await settle();
      const u = store.config()!.defaults;
      expect([u.resolution, u.steps, store.config()!.scenes[0].variants]).toEqual(['800x800', 3, 9]);
      expect(el().querySelector('[data-testid=auto-applied]')).toBeNull();
    });

    it('Apply and generate saves the plan, launches the run and opens it; if saving fails it launches nothing', async () => {
      await mount(imagesSet());
      await expandAll();
      const save = vi.spyOn(store, 'save').mockResolvedValue(true);
      const launch = vi.spyOn(TestBed.inject(ApiService), 'launchRun').mockReturnValue(of({ run: { id: 'r7' } }) as never);
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      btn('auto-generate').click();
      await settle();
      expect(store.config()!.defaults.resolution).toBe('1280x704');
      expect(save).toHaveBeenCalled();
      expect(launch).toHaveBeenCalledWith('demo', {});
      expect(navigate).toHaveBeenCalledWith(['/runs', 'r7']);

      launch.mockClear();
      save.mockResolvedValue(false);
      btn('auto-generate').click();
      await settle();
      expect(launch).not.toHaveBeenCalled();
    });

    const manyScenes = (n: number) => ({ ...imagesSet(), scenes: Array.from({ length: n }, (_, i) => ({ ...BASE.scenes[0], id: `s${i}`, variants: 1 })) });
    const setBudget = (i: number) => {
      const cmp = fixture.debugElement.query(By.directive(DefaultsPanelComponent)).componentInstance as unknown as { budgetIndex: { set(v: number): void } };
      cmp.budgetIndex.set(i);
    };

    it('a short wait gives a lower level of quality', async () => {
      await mount(manyScenes(40));
      await expandAll();
      setBudget(1); // 15 minutes
      await settle();
      expect(el().querySelector('[data-testid=auto-over]')).toBeNull();
      btn('auto-apply').click();
      await settle();
      expect(store.config()!.defaults.resolution).toBe('768x448'); // the lowest level: the higher ones do not fit
    });

    it('says so when not even the fastest way fits the wait', async () => {
      await mount(manyScenes(400));
      await expandAll();
      setBudget(1);
      await settle();
      expect(el().querySelector('[data-testid=auto-over]')?.textContent).toContain('En ese tiempo no llega');
    });

    it('a scene added to a project with animation configured is animated too; without animation it is not', async () => {
      await mount({ ...BASE, defaults: { ...BASE.defaults, animate: { diffusion_model: 'models/video/w.gguf', t5xxl: 't', vae: 'v' } } });
      await expandAll();
      http.match('/api/assets').forEach((r) => r.flush({ kinds: [] })); // the animation block lists the installed video files
      store.addScene();
      expect(store.config()!.scenes.at(-1)!.animate).toBe(true);
    });

    it('a scene added to a project without animation stays a picture', async () => {
      await mount(BASE);
      await expandAll();
      store.addScene();
      expect(store.config()!.scenes.at(-1)!.animate).toBeUndefined();
    });

    it('is not shown for a music project', async () => {
      await mount({ ...imagesSet(), output: { ...BASE.output, mode: 'music' } });
      await expandAll();
      expect(el().querySelector('[data-testid=auto-panel]')).toBeNull();
    });
  });

  describe('style and quality', () => {
    const btn = (id: string) => el().querySelector(`[data-testid=${id}]`) as HTMLButtonElement;
    const STYLED: CatalogEntry[] = [
      { ...CATALOG[0], styles: ['photo'], style_rank: 1 },
      { ...CATALOG[1], styles: ['anime'], style_rank: 1 },
      { ...CATALOG[2], installed: false, styles: ['general'], style_rank: 1 },
    ];
    const imagesSet = () => ({
      ...BASE,
      output: { ...BASE.output, mode: 'images' },
      defaults: { ...BASE.defaults, model: '', steps: 3, resolution: '800x800', model_set: SET },
      scenes: [{ ...BASE.scenes[0], variants: 9 }],
    });

    it('enables only the styles with an installed model', async () => {
      catalogReply = STYLED;
      await mount(imagesSet());
      await expandAll();
      expect(btn('style-photo').disabled).toBe(false);
      expect(btn('style-anime').disabled).toBe(false);
      expect(btn('style-general').disabled).toBe(true);
    });

    it('picking a style chooses the installed model and its settings', async () => {
      catalogReply = STYLED;
      await mount(imagesSet());
      await expandAll();
      btn('style-anime').click();
      await settle();
      const d = store.config()!.defaults;
      expect(d.model).toBe('models/pony.safetensors');
      expect(d.model_set).toBeUndefined();
      expect(d.steps).toBe(25);
      expect(store.dirty()).toBe(true);
    });

    describe('Retoque', () => {
      const KONTEXT: CatalogEntry = {
        id: 'kontext', kind: 'model', name: 'Kontext', description: '', size_bytes: 1, installed: true, edit: true,
        preset: { steps: 20, cfg_scale: 1, resolution: '1024x576' },
        files: [
          { name: 'k.gguf', role: 'model', url: '' },
          { name: 'clip_l.safetensors', role: 'clip_l', url: '' },
          { name: 't5.safetensors', role: 't5xxl', url: '' },
          { name: 'ae.safetensors', role: 'vae', url: '' },
        ],
      };

      it('is a fourth look, disabled and explained when no editing model is installed', async () => {
        catalogReply = STYLED;
        await mount(imagesSet());
        await expandAll();
        expect(btn('style-edit').disabled).toBe(true);
        expect(el().querySelector('[data-testid=style-edit-missing]')).not.toBeNull();
        expect(el().querySelector('[data-testid=style-help]')?.textContent?.trim()).not.toBe('');
      });

      it('makes the project edit its pictures when picked, marks it as the current look and goes back when another is picked', async () => {
        catalogReply = [...STYLED, KONTEXT];
        await mount(imagesSet());
        await expandAll();
        expect(btn('style-edit').disabled).toBe(false);
        btn('style-edit').click();
        await settle();
        expect(store.editing()).toBe(true);
        expect(store.config()!.defaults.model_set).toMatchObject({ edit: true, diffusion_model: 'models/k.gguf' });
        expect(btn('style-edit').getAttribute('aria-pressed')).toBe('true');
        expect(btn('style-anime').getAttribute('aria-pressed')).toBe('false');
        expect(el().querySelector('[data-testid=style-edit-note]')).not.toBeNull();

        btn('style-anime').click();
        await settle();
        expect(store.editing()).toBe(false);
        expect(store.config()!.defaults.model).toBe('models/pony.safetensors');
        expect(btn('style-anime').getAttribute('aria-pressed')).toBe('true');
      });
    });

    it('applies a quality level in one edit and undoes it', async () => {
      catalogReply = STYLED;
      await mount(imagesSet());
      await expandAll();
      store.dirty.set(false);
      btn('tier-high').click();
      await settle();
      const c = store.config()!;
      expect([c.defaults.steps, c.defaults.resolution]).toEqual([12, '1280x704']);
      expect(c.scenes[0].variants).toBe(4);
      expect(store.dirty()).toBe(true);
      expect(el().querySelector('[data-testid=tier-applied]')?.textContent).toContain('1280x704');

      btn('undo-tier').click();
      await settle();
      const u = store.config()!;
      expect([u.defaults.steps, u.defaults.resolution, u.scenes[0].variants]).toEqual([3, '800x800', 9]);
      expect(el().querySelector('[data-testid=tier-applied]')).toBeNull();
    });

    it('opening a project applies nothing', async () => {
      catalogReply = STYLED;
      await mount(imagesSet());
      await expandAll();
      const c = store.config()!;
      expect([c.defaults.steps, c.defaults.resolution, c.scenes[0].variants]).toEqual([3, '800x800', 9]);
      expect(store.tierApplied()).toBeNull();
    });

    it('uses the customized values of a level and restores the derived ones', async () => {
      vi.stubGlobal('localStorage', fakeStorage());
      catalogReply = STYLED;
      await mount(imagesSet());
      await expandAll();
      const input = el().querySelector('[data-testid=tune-high] input[type=number]') as HTMLInputElement;
      input.value = '30';
      input.dispatchEvent(new Event('change'));
      await settle();
      btn('tier-high').click();
      await settle();
      expect(store.config()!.defaults.steps).toBe(30);

      btn('restore-tiers').click();
      await settle();
      btn('tier-high').click();
      await settle();
      expect(store.config()!.defaults.steps).toBe(12);
      vi.unstubAllGlobals();
    });
  });
});
