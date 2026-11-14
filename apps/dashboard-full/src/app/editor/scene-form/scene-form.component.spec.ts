import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { load } from 'js-yaml';
import { of } from 'rxjs';

import { ProjectConfig } from '../../core/api.models';
import { EnvironmentStore } from '../../core/environment.store';
import { EditorStore } from '../editor.store';
import { toYaml } from '../../shared/project-yaml';
import { SceneInitComponent } from './blocks/scene-init/scene-init.component';
import { SceneFormComponent } from './scene-form.component';
import { AvailabilityStore } from '../../core/availability.store';
import { ALL_AVAILABLE } from '../../core/availability.fake';
import { SCENE_FORM_TEST_PROVIDERS } from './dynamic/testing/scene-form-providers';

const CONFIG: ProjectConfig = {
  project: 'demo',
  output: { mode: 'video', file: 'out/demo.mp4', contact_sheet: false },
  defaults: {
    model: '',
    voice: '',
    resolution: '1280x720',
    sampler: 'euler',
    steps: 30,
    fps: 30,
    subject_prompt: '',
    negative_prompt: '',
    lora_model_dir: '',
  },
  scenes: [
    { id: 'intro', prompt: 'ciudad', negative_prompt: '', tts_text: 'hola', speed: 1, lora: '' },
  ],
};

type FormApi = {
  setNarration(mode: string): void;
  setMotionIntensity(v: number): void;
  setGrain(v: number): void;
  setWhiteBalance(wb: string): void;
  patch(p: Record<string, unknown>): void;
  setMotionPrompt(v: string): void;
  setPictureMode(mode: string): void;
  uploadImage(input: unknown): Promise<void>;
};

describe('SceneFormComponent controls', () => {
  let store: EditorStore;
  let cmp: FormApi;
  let http: HttpTestingController;
  let fixture: ComponentFixture<SceneFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SceneFormComponent],
      providers: [EditorStore, provideHttpClient(), provideHttpClientTesting(), ...SCENE_FORM_TEST_PROVIDERS],
    }).compileComponents();
    store = TestBed.inject(EditorStore);
    TestBed.inject(AvailabilityStore).data.set(ALL_AVAILABLE);
    http = TestBed.inject(HttpTestingController);
    const loading = store.load('demo');
    http
      .expectOne('/api/projects/demo/config')
      .flush({ yaml: '', parsed: structuredClone(CONFIG), valid: true, warnings: [] });
    await loading;

    fixture = TestBed.createComponent(SceneFormComponent);
    fixture.detectChanges();
    cmp = fixture.componentInstance as unknown as FormApi;
  });

  const scene = () => store.config()!.scenes[0];

  it('narration toggle: silencio sets silence_seconds and clears tts; back restores narrated mode', () => {
    cmp.setNarration('silence');
    expect(scene().silence_seconds).toBe(2.0);
    expect(scene().tts_text).toBe('');
    cmp.setNarration('tts');
    expect(scene().silence_seconds).toBeUndefined();
  });

  it('motion: presets only — static removes the block, others carry bounded intensity', () => {
    cmp.patch({ motion: { type: 'zoom_in', intensity: 0.5 } });
    expect(scene().motion).toEqual({ type: 'zoom_in', intensity: 0.5 });
    cmp.setMotionIntensity(0.8);
    expect(scene().motion!.intensity).toBe(0.8);
    cmp.patch({ motion: undefined });
    expect(scene().motion).toBeUndefined();
  });

  it('look: grain and white balance write the preset fields', () => {
    cmp.setGrain(0.3);
    expect(scene().look).toEqual({ grain: 0.3, white_balance: 'neutral' });
    cmp.setWhiteBalance('warm');
    expect(scene().look!.white_balance).toBe('warm');
  });

  it('prompt/speed/variants patches land on the right fields', async () => {
    cmp.patch({ prompt: 'nueva', speed: 0.9, variants: 3 });
    expect(scene().prompt).toBe('nueva');
    expect(scene().speed).toBe(0.9);
    expect(scene().variants).toBe(3);
  });

  // --- animation -------------------------------------------------------------------

  const el = () => fixture.nativeElement as HTMLElement;
  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }
  const yamlScene = () =>
    (load(toYaml(store.config()!)) as { scenes: Record<string, unknown>[] }).scenes[0];
  /** The «Animar esta escena» checkbox, the way the user uses it. */
  async function setAnimate(on: boolean): Promise<void> {
    const box = el().querySelector('[data-testid=scene-animate-toggle] input') as HTMLInputElement;
    if (box.checked !== on) {
      box.click();
      await settle();
    }
  }

  it('turning animation on writes animate: true and shows the motion prompt field', async () => {
    expect(el().querySelector('[data-testid=scene-motion-prompt]')).toBeNull();
    (el().querySelector('[data-testid=scene-animate-toggle] input') as HTMLInputElement).click();
    await settle();
    expect(scene().animate).toBe(true);
    expect(el().querySelector('[data-testid=scene-motion-prompt]')).not.toBeNull();

    cmp.setMotionPrompt('she turns the page');
    expect(scene().motion_prompt).toBe('she turns the page');
    expect(yamlScene()['animate']).toBe(true);
    expect(yamlScene()['motion_prompt']).toBe('she turns the page');
  });

  it('turning animation off leaves no animate key in the saved YAML', async () => {
    await setAnimate(true);
    cmp.setMotionPrompt('mist drifts');
    await setAnimate(false);
    await settle();
    expect('animate' in yamlScene()).toBe(false);
    // the typed prompt is kept in the model (like other hidden values) and still written
    expect(scene().motion_prompt).toBe('mist drifts');
    expect(el().querySelector('[data-testid=scene-motion-prompt]')).toBeNull();
  });

  it('an empty motion prompt is not written', async () => {
    await setAnimate(true);
    cmp.setMotionPrompt('');
    expect('motion_prompt' in yamlScene()).toBe(false);
  });

  it('says that camera motion is ignored when the scene animates and has a motion', async () => {
    await setAnimate(true);
    await settle();
    expect(el().querySelector('[data-testid=animate-motion-note]')).toBeNull(); // static: nothing to warn

    cmp.patch({ motion: { type: 'zoom_in', intensity: 0.5 } });
    await settle();
    expect(el().querySelector('[data-testid=animate-motion-note]')?.textContent).toContain('se ignora');

    await setAnimate(false);
    await settle();
    expect(el().querySelector('[data-testid=animate-motion-note]')).toBeNull();
  });

  it('shows the scene-level error when it animates without defaults.animate', async () => {
    await setAnimate(true);
    await settle();
    expect(el().textContent).toContain('defaults.animate no está configurado');
  });

  it('in images mode an animated scene shows that animation is not used and hides the animation section', async () => {
    await setAnimate(true);
    store.updateOutput({ mode: 'images' });
    await settle();
    expect(el().querySelector('[data-testid=animate-images-note]')?.textContent).toContain('modo imágenes');
    expect(el().querySelector('[data-testid=scene-animate-toggle]')).toBeNull();
    expect(scene().animate).toBe(true); // the hidden value is kept, never discarded
  });

  // --- prompt assistant -------------------------------------------------------------

  const q = (sel: string) => el().querySelector(sel) as HTMLElement | null;
  const click = async (sel: string) => {
    (q(sel) as HTMLButtonElement).click();
    await settle();
  };
  const ask = (field: 'prompt' | 'motion_prompt') => `[data-testid=assist-${field}] [data-testid=assist-ask]`;

  it('improving a prompt shows a proposal and leaves the prompt alone until it is used', async () => {
    cmp.patch({ prompt: 'Una mujer lee un libro' });
    await settle();
    await click(ask('prompt'));
    const req = http.expectOne({ method: 'POST', url: '/api/assist' });
    expect(req.request.body).toEqual({ task: 'image', text: 'Una mujer lee un libro' });
    req.flush({ text: 'A woman reads a book in a sunlit cafe.' });
    await settle();
    expect(q('[data-testid=assist-proposal-prompt]')?.textContent).toContain('A woman reads a book in a sunlit cafe.');
    expect(scene().prompt).toBe('Una mujer lee un libro'); // untouched

    store.dirty.set(false);
    await click('[data-testid=assist-proposal-prompt] [data-testid=assist-use]');
    expect(scene().prompt).toBe('A woman reads a book in a sunlit cafe.');
    expect(store.dirty()).toBe(true);
    expect(q('[data-testid=assist-proposal-prompt]')).toBeNull();
  });

  it('discarding a proposal keeps the previous prompt', async () => {
    cmp.patch({ prompt: 'ciudad al amanecer' });
    await settle();
    await click(ask('prompt'));
    http.expectOne('/api/assist').flush({ text: 'A city at dawn.' });
    await settle();
    await click('[data-testid=assist-proposal-prompt] [data-testid=assist-discard]');
    expect(scene().prompt).toBe('ciudad al amanecer');
    expect(q('[data-testid=assist-proposal-prompt]')).toBeNull();
  });

  it('suggests motion from the scene prompt, only for scenes that animate, and offers it for motion_prompt', async () => {
    expect(q('[data-testid=assist-motion_prompt]')).toBeNull(); // not animated: no motion action
    cmp.patch({ prompt: 'A woman reads in a cafe' });
    await setAnimate(true);
    await settle();
    await click(ask('motion_prompt'));
    const req = http.expectOne('/api/assist');
    expect(req.request.body).toEqual({ task: 'motion', text: 'A woman reads in a cafe' });
    req.flush({ text: 'Slow camera drift.' });
    await settle();
    expect(q('[data-testid=assist-proposal-motion_prompt]')?.textContent).toContain('Slow camera drift.');
    await click('[data-testid=assist-proposal-motion_prompt] [data-testid=assist-use]');
    expect(scene().motion_prompt).toBe('Slow camera drift.');
    expect(scene().prompt).toBe('A woman reads in a cafe'); // the prompt is not touched
  });

  it('shows no motion action in images mode', async () => {
    await setAnimate(true);
    store.updateOutput({ mode: 'images' });
    await settle();
    expect(q('[data-testid=assist-motion_prompt]')).toBeNull();
    expect(q('[data-testid=assist-prompt]')).not.toBeNull(); // improving the prompt still makes sense
  });

  it('disables the action with its reason when the prompt is empty or too long', async () => {
    cmp.patch({ prompt: '' });
    await settle();
    const btn = () => q(ask('prompt')) as HTMLButtonElement;
    expect(btn().disabled).toBe(true);
    expect(q('[data-testid=assist-prompt] [data-testid=assist-reason]')?.textContent).toContain('Escribe algo');

    cmp.patch({ prompt: 'x'.repeat(2001) });
    await settle();
    expect(btn().disabled).toBe(true);
    expect(q('[data-testid=assist-prompt] [data-testid=assist-reason]')?.textContent).toContain('2000');

    cmp.patch({ prompt: 'ok' });
    await settle();
    expect(btn().disabled).toBe(false);
    expect(q('[data-testid=assist-prompt] [data-testid=assist-reason]')).toBeNull();
  });

  it('shows progress with the elapsed seconds, blocks the other action and can be cancelled', async () => {
    cmp.patch({ prompt: 'una escena' });
    await setAnimate(true);
    await settle();
    await click(ask('prompt'));
    const req = http.expectOne('/api/assist');
    expect(q('[data-testid=assist-prompt] [data-testid=assist-wait]')).not.toBeNull();
    expect(q('[data-testid=assist-prompt] [data-testid=assist-elapsed]')?.textContent).toContain(' s');
    expect((q(ask('motion_prompt')) as HTMLButtonElement).disabled).toBe(true); // one at a time

    await click('[data-testid=assist-prompt] [data-testid=assist-cancel]');
    expect(req.cancelled).toBe(true);
    expect(q('[data-testid=assist-wait]')).toBeNull();
    expect(q('[data-testid=assist-error]')).toBeNull();
    expect(q('[data-testid=assist-proposal-prompt]')).toBeNull();
    expect((q(ask('prompt')) as HTMLButtonElement).disabled).toBe(false);
  });

  it('explains a 409 under the field, in plain words', async () => {
    cmp.patch({ prompt: 'una escena' });
    await settle();
    await click(ask('prompt'));
    http
      .expectOne('/api/assist')
      .flush({ error: { code: 'conflict', message: 'run run-1 is queued or active' } }, { status: 409, statusText: 'Conflict' });
    await settle();
    const msg = q('[data-testid=assist-prompt] ~ [data-testid=assist-error], [data-testid=assist-error]')?.textContent ?? '';
    expect(msg).toContain('ejecución en marcha');
    expect(msg).toContain('espera');
  });

  it('shows a 503 exactly as the server wrote it and clears it when asking again', async () => {
    const server = 'model "qwen3:8b" is not installed in Ollama; install it with: ollama pull qwen3:8b';
    cmp.patch({ prompt: 'una escena' });
    await settle();
    await click(ask('prompt'));
    http.expectOne('/api/assist').flush({ error: { code: 'unavailable', message: server } }, { status: 503, statusText: 'Service Unavailable' });
    await settle();
    expect(q('[data-testid=assist-error]')?.textContent).toContain(server);

    await click(ask('prompt')); // asking again clears the message while the new request runs
    expect(q('[data-testid=assist-error]')).toBeNull();
    http.expectOne('/api/assist').flush({ text: 'ok.' });
  });

  it('a refusal by the model shows its message with the selector, no proposal, and leaves the prompt as it was', async () => {
    const msg = 'qwen3:8b refused to write this text. The refusal comes from the model: choose another installed model';
    cmp.patch({ prompt: 'una escena' });
    await settle();
    await click(ask('prompt'));
    http.expectOne('/api/assist').flush({ error: { code: 'assist_refused', message: msg } }, { status: 422, statusText: 'Unprocessable Entity' });
    await settle();
    const err = q('[data-testid=assist-error]');
    expect(err?.textContent).toContain('«qwen3:8b» se ha negado a escribirlo. ¿Estás pensando en porno?');
    expect(err?.getAttribute('data-refused')).toBe('true');
    expect(q('[data-testid=assist-proposal-prompt]')).toBeNull();
    expect(q('[data-testid=assist-prompt] [data-testid=assist-model-select]')).not.toBeNull(); // the way out
    expect(store.config()!.scenes[0].prompt).toBe('una escena');
  });

  it('a failure can be dismissed', async () => {
    cmp.patch({ prompt: 'una escena' });
    await settle();
    await click(ask('prompt'));
    http.expectOne('/api/assist').flush({ error: { code: 'invalid_request', message: 'boom' } }, { status: 400, statusText: 'Bad Request' });
    await settle();
    expect(q('[data-testid=assist-error]')?.textContent).toContain('boom');
    (q('[data-testid=assist-error] button') as HTMLButtonElement).click();
    await settle();
    expect(q('[data-testid=assist-error]')).toBeNull();
  });

  it('selecting another scene cancels a request in flight and never shows its result there', async () => {
    store.addScene(); // second scene
    store.selected.set(0);
    await settle();
    cmp.patch({ prompt: 'primera escena' });
    await settle();
    await click(ask('prompt'));
    const req = http.expectOne('/api/assist');

    store.selected.set(1);
    await settle();
    expect(req.cancelled).toBe(true);
    expect(q('[data-testid=assist-wait]')).toBeNull();
    expect(q('[data-testid=assist-proposal-prompt]')).toBeNull();
  });
});

describe('SceneFormComponent: the scene\'s own picture', () => {
  let store: EditorStore;
  let http: HttpTestingController;
  let fixture: ComponentFixture<SceneFormComponent>;
  let cmp: FormApi;
  const q = (sel: string) => (fixture.nativeElement as HTMLElement).querySelector(sel);

  async function open(image?: string) {
    TestBed.configureTestingModule({
      imports: [SceneFormComponent],
      providers: [EditorStore, provideHttpClient(), provideHttpClientTesting(), ...SCENE_FORM_TEST_PROVIDERS],
    });
    store = TestBed.inject(EditorStore);
    TestBed.inject(AvailabilityStore).data.set(ALL_AVAILABLE);
    http = TestBed.inject(HttpTestingController);
    const cfg = structuredClone(CONFIG);
    if (image !== undefined) cfg.scenes[0].image = image;
    const loading = store.load('demo');
    http.expectOne('/api/projects/demo/config').flush({ yaml: '', parsed: cfg, valid: true });
    await loading;
    fixture = TestBed.createComponent(SceneFormComponent);
    fixture.detectChanges();
    cmp = fixture.componentInstance as unknown as FormApi;
  }

  const sources = [
    { name: 'photo.jpg', kind: 'image', size: 1, modified: '' },
    { name: 'song.mp3', kind: 'audio', size: 1, modified: '' },
  ];

  afterEach(() => {
    http.match((r) => r.url.endsWith('/manifest.json')); // an images project looks for its pictures
    // a scene that starts from a picture reads the catalog to offer editing it
    http.match('/api/assets/catalog').forEach((r) => r.flush({ entries: [] }));
    http.verify();
  });

  it('generating is the default: prompt shown, no picture picker', async () => {
    await open();
    expect(q('[data-testid=picture-mode]')).toBeTruthy();
    expect(q('[data-testid=picture-select]')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('negative_prompt');
  });

  it('switching to my image hides the prompt, negative prompt and lora, and asks for a picture before saving', async () => {
    await open();
    cmp.setPictureMode('own');
    fixture.detectChanges();
    http.expectOne('/api/projects/demo/sources').flush({ sources });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(q('[data-testid=picture-select]')).toBeTruthy();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('negative_prompt');
    expect(text).not.toContain('lora');
    expect(store.config()!.scenes[0].image).toBe('');
    expect(store.canSave()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Elige o sube una imagen');
  });

  it('a chosen picture is written to the file and previewed; going back removes it', async () => {
    await open('photo.jpg');
    http.expectOne('/api/projects/demo/sources').flush({ sources });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(q('[data-testid=picture-preview]')?.getAttribute('src')).toContain('sources/photo.jpg');
    const doc = load(toYaml(store.config()!)) as { scenes: Record<string, unknown>[] };
    expect(doc.scenes[0]['image']).toBe('photo.jpg');
    cmp.setPictureMode('ai');
    expect(store.config()!.scenes[0].image).toBeUndefined();
    expect(load(toYaml(store.config()!)) as { scenes: Record<string, unknown>[] }).not.toHaveProperty('scenes.0.image');
  });

  it('only pictures are offered, not the audio sources', async () => {
    await open('');
    http.expectOne('/api/projects/demo/sources').flush({ sources });
    await fixture.whenStable();
    fixture.detectChanges();
    (q('[data-testid=picture-select] .mat-mdc-select-trigger') as HTMLElement).click();
    fixture.detectChanges();
    const options = Array.from(document.querySelectorAll('mat-option')).map((o) => o.textContent?.trim());
    expect(options).toEqual(['photo.jpg']);
  });

  it('uploading a picture selects it', async () => {
    await open('');
    http.expectOne('/api/projects/demo/sources').flush({ sources: [] });
    await fixture.whenStable();
    fixture.detectChanges();
    const input = q('input[type=file]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'my photo.jpg')] });
    input.dispatchEvent(new Event('change'));
    await Promise.resolve();
    http.expectOne({ method: 'PUT', url: '/api/projects/demo/sources/my-photo.jpg' }).flush({ name: 'my-photo.jpg' }, { status: 201, statusText: 'Created' });
    await Promise.resolve();
    await Promise.resolve();
    http.expectOne('/api/projects/demo/sources').flush({ sources: [{ name: 'my-photo.jpg', kind: 'image', size: 1, modified: '' }] });
    await fixture.whenStable();
    expect(store.config()!.scenes[0].image).toBe('my-photo.jpg');
  });

  it('the picture mode is not offered in images mode', async () => {
    await open();
    store.updateOutput({ mode: 'images' });
    fixture.detectChanges();
    expect(q('[data-testid=picture-mode]')).toBeNull();
  });

  it('offers the rotation presets', async () => {
    await open();
    const types = (fixture.componentInstance as unknown as { motionTypes: string[] }).motionTypes;
    expect(types).toEqual(expect.arrayContaining(['rotate_cw', 'rotate_ccw']));
  });
});

describe('SceneFormComponent: starting from a picture (img2img)', () => {
  let store: EditorStore;
  let http: HttpTestingController;
  let fixture: ComponentFixture<SceneFormComponent>;
  const q = (sel: string) => (fixture.nativeElement as HTMLElement).querySelector(sel);

  async function open(patch: Record<string, unknown> = {}, mode = 'video') {
    TestBed.configureTestingModule({
      imports: [SceneFormComponent],
      providers: [EditorStore, provideHttpClient(), provideHttpClientTesting(), ...SCENE_FORM_TEST_PROVIDERS],
    });
    store = TestBed.inject(EditorStore);
    TestBed.inject(AvailabilityStore).data.set(ALL_AVAILABLE);
    http = TestBed.inject(HttpTestingController);
    const cfg = structuredClone(CONFIG);
    cfg.output.mode = mode;
    Object.assign(cfg.scenes[0], patch);
    const loading = store.load('demo');
    http.expectOne('/api/projects/demo/config').flush({ yaml: '', parsed: cfg, valid: true });
    await loading;
    fixture = TestBed.createComponent(SceneFormComponent);
    fixture.detectChanges();
  }
  const cmp = () => fixture.componentInstance as unknown as FormApi;
  const init = () => fixture.debugElement.query(By.directive(SceneInitComponent)).componentInstance as unknown as { setInit(on: boolean): void };
  const flushSources = async () => {
    http.expectOne('/api/projects/demo/sources').flush({ sources: [{ name: 'photo.jpg', kind: 'image', size: 1, modified: '' }] });
    await fixture.whenStable();
    fixture.detectChanges();
  };

  afterEach(() => {
    http.match((r) => r.url.endsWith('/manifest.json')); // an images project looks for its pictures
    // a scene that starts from a picture reads the catalog to offer editing it
    http.match('/api/assets/catalog').forEach((r) => r.flush({ entries: [] }));
    http.verify();
  });

  it('offers a starting picture in images mode and in video mode on «Generar con IA»', async () => {
    await open({}, 'images');
    expect(q('[data-testid=init-enable]')).toBeTruthy();
    TestBed.resetTestingModule();
    await open({}, 'video');
    expect(q('[data-testid=init-enable]')).toBeTruthy();
  });

  it('enabling it asks for a picture before saving, and shows the strength', async () => {
    await open({}, 'images');
    init().setInit(true);
    fixture.detectChanges();
    await flushSources();
    expect(store.config()!.scenes[0].init_image).toBe('');
    expect(store.canSave()).toBe(false);
    expect(q('[data-testid=init-select]')).toBeTruthy();
    expect(q('[data-testid=init-strength]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Elige o sube la imagen de partida');
  });

  it('a chosen picture and strength are written to the file', async () => {
    await open({ init_image: 'photo.jpg', strength: 0.4 }, 'images');
    await flushSources();
    expect(q('[data-testid=init-preview]')?.getAttribute('src')).toContain('sources/photo.jpg');
    const doc = load(toYaml(store.config()!)) as { scenes: Record<string, unknown>[] };
    expect(doc.scenes[0]).toMatchObject({ init_image: 'photo.jpg', strength: 0.4 });
  });

  it('removing it takes the picture and the strength out of the file', async () => {
    await open({ init_image: 'photo.jpg', strength: 0.4 }, 'images');
    await flushSources();
    init().setInit(false);
    const doc = load(toYaml(store.config()!)) as { scenes: Record<string, unknown>[] };
    expect(doc.scenes[0]).not.toHaveProperty('init_image');
    expect(doc.scenes[0]).not.toHaveProperty('strength');
  });

  it('«Mi imagen» and a starting picture are never set together', async () => {
    await open({ init_image: 'photo.jpg', strength: 0.4 }, 'video');
    await flushSources();
    cmp().setPictureMode('own');
    const s = store.config()!.scenes[0];
    expect(s.image).toBe('');
    expect(s.init_image).toBeUndefined();
    expect(s.strength).toBeUndefined();
    fixture.detectChanges();
    expect(q('[data-testid=scene-init]')).toBeNull();
  });
});

describe('SceneFormComponent: the scene\'s own quality', () => {
  let store: EditorStore;
  let http: HttpTestingController;
  let fixture: ComponentFixture<SceneFormComponent>;
  const q = (sel: string) => (fixture.nativeElement as HTMLElement).querySelector(sel) as HTMLElement | null;
  const click = async (sel: string) => {
    q(sel)!.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const scene = () => store.config()!.scenes[0];

  const CATALOG = {
    entries: [
      {
        id: 'krea', kind: 'model', name: 'Krea', description: '', size_bytes: 1, installed: true,
        preset: { steps: 8, cfg_scale: 1, resolution: '1024x576' },
        files: [{ name: 'k.gguf', role: 'model', url: '' }],
      },
    ],
  };

  async function open(patch: Record<string, unknown> = {}, mode = 'video', model = 'models/k.gguf') {
    TestBed.configureTestingModule({
      imports: [SceneFormComponent],
      providers: [EditorStore, provideHttpClient(), provideHttpClientTesting(), ...SCENE_FORM_TEST_PROVIDERS],
    });
    store = TestBed.inject(EditorStore);
    TestBed.inject(AvailabilityStore).data.set(ALL_AVAILABLE);
    http = TestBed.inject(HttpTestingController);
    const cfg = structuredClone(CONFIG);
    cfg.output.mode = mode;
    cfg.defaults.model = model;
    cfg.defaults.resolution = '1024x576';
    cfg.defaults.steps = 8;
    cfg.scenes.push({ id: 'otra', prompt: 'p', negative_prompt: '', tts_text: 'x', speed: 1, lora: '' });
    Object.assign(cfg.scenes[0], patch);
    const loading = store.load('demo');
    http.expectOne('/api/projects/demo/config').flush({ yaml: '', parsed: cfg, valid: true });
    await loading;
    fixture = TestBed.createComponent(SceneFormComponent);
    fixture.detectChanges();
    void store.loadCatalog();
    http.expectOne('/api/assets/catalog').flush(CATALOG);
    await fixture.whenStable();
    fixture.detectChanges();
  }
  afterEach(() => {
    http.match((r) => r.url.endsWith('/manifest.json')); // an images project looks for its pictures
    // a scene that starts from a picture reads the catalog to offer editing it
    http.match('/api/assets/catalog').forEach((r) => r.flush({ entries: [] }));
    http.verify();
  });

  it('says it follows the project until the scene sets something, and that the video keeps the project\'s size', async () => {
    await open();
    expect(q('[data-testid=scene-quality-summary]')!.textContent).toContain('como el proyecto');
    expect((q('[data-testid=scene-quality-clear]') as HTMLButtonElement).disabled).toBe(true);
    expect(q('[data-testid=scene-quality]')!.textContent).toContain('mantiene la resolución del proyecto');
  });

  it('shows what each level would write for this scene', async () => {
    await open();
    expect(q('[data-testid=scene-tier-high]')!.getAttribute('aria-label')).toContain('1280x704');
    expect(q('[data-testid=scene-tier-high]')!.getAttribute('aria-label')).toContain('12 pasos');
    expect(q('[data-testid=scene-tier-low]')!.getAttribute('aria-label')).toContain('768x448');
  });

  it('a level changes this scene only, marks the project as changed and lists what it wrote', async () => {
    await open();
    store.dirty.set(false);
    await click('[data-testid=scene-tier-high]');
    expect(scene().render).toEqual({ resolution: '1280x704', steps: 12 });
    expect(store.config()!.scenes[1].render).toBeUndefined();
    expect(store.config()!.defaults.resolution).toBe('1024x576');
    expect(store.dirty()).toBe(true);
    expect(q('[data-testid=scene-quality-applied]')!.textContent).toContain('1280x704');
    expect(q('[data-testid=scene-quality-summary]')!.textContent).toContain('1280x704');
  });

  it('«Deshacer» restores what the scene had', async () => {
    await open({ render: { steps: 3 } });
    await click('[data-testid=scene-tier-low]');
    expect(scene().render).toEqual({ resolution: '768x448', steps: 4 });
    await click('[data-testid=scene-quality-undo]');
    expect(scene().render).toEqual({ steps: 3 });
    expect(q('[data-testid=scene-quality-applied]')).toBeNull();
  });

  it('«Como el proyecto» removes its own settings from the saved file', async () => {
    await open({ render: { steps: 3 }, animation: { frames: 49 } });
    expect((q('[data-testid=scene-quality-clear]') as HTMLButtonElement).disabled).toBe(false);
    await click('[data-testid=scene-quality-clear]');
    const doc = load(toYaml(store.config()!)) as { scenes: Record<string, unknown>[] };
    expect(doc.scenes[0]).not.toHaveProperty('render');
    expect(doc.scenes[0]).not.toHaveProperty('animation');
  });

  it('the fields write the scene\'s values, and an emptied field goes back to the project\'s', async () => {
    await open();
    const set = async (sel: string, value: string) => {
      const input = q(sel) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await set('[data-testid=scene-render-resolution]', '1280x704');
    await set('[data-testid=scene-render-steps]', '12');
    await set('[data-testid=scene-render-cfg]', '0');
    expect(scene().render).toEqual({ resolution: '1280x704', steps: 12, cfg_scale: 0 });
    await set('[data-testid=scene-render-steps]', '');
    expect(scene().render).toEqual({ resolution: '1280x704', cfg_scale: 0 });
    await set('[data-testid=scene-render-resolution]', '');
    await set('[data-testid=scene-render-cfg]', '');
    expect(scene().render).toBeUndefined(); // an emptied block is not kept
    const doc = load(toYaml(store.config()!)) as { scenes: Record<string, unknown>[] };
    expect(doc.scenes[0]).not.toHaveProperty('render');
  });

  it('shows the Wan fields only when the scene animates, and keeps their values when it stops', async () => {
    await open({ animate: true, animation: { frames: 49 } });
    expect(q('[data-testid=scene-anim-frames]')).not.toBeNull();
    expect((q('[data-testid=scene-anim-frames]') as HTMLInputElement).value).toBe('49');
    store.updateScene(0, { animate: false });
    fixture.detectChanges();
    expect(q('[data-testid=scene-anim-frames]')).toBeNull();
    expect(scene().animation).toEqual({ frames: 49 }); // never discarded
  });

  it('a level gives an animated scene its Wan settings', async () => {
    await open({ animate: true });
    await click('[data-testid=scene-tier-high]');
    expect(scene().animation).toMatchObject({ frames: 49 });
  });

  describe('with AnimateDiff', () => {
    const useAnimateDiff = () => {
      store.config.update((c) => ({
        ...c!,
        defaults: { ...c!.defaults, animate: { engine: 'animatediff', checkpoint: 'models/sd.safetensors', motion_module: 'models/video/mm.safetensors' } },
      }));
      fixture.detectChanges();
    };

    it('shows the engine\'s defaults as placeholders and a level gives the scene AnimateDiff values', async () => {
      await open({ animate: true });
      useAnimateDiff();
      expect((q('[data-testid=scene-anim-frames]') as HTMLInputElement).placeholder).toBe('16');
      expect((q('[data-testid=scene-anim-resolution]') as HTMLInputElement).placeholder).toBe('512x512');
      await click('[data-testid=scene-tier-high]');
      expect(scene().animation).toEqual({ resolution: '640x640', frames: 24, steps: 38 });
    });

    it('accepts 16 frames and flags 40 with the AnimateDiff range', async () => {
      await open({ animate: true, animation: { frames: 16 } });
      useAnimateDiff();
      expect(store.validation()!.valid).toBe(true);
      store.updateScene(0, { animation: { frames: 40 } });
      fixture.detectChanges();
      expect(store.validation()!.valid).toBe(false);
      expect(q('[data-testid=scene-quality-error]')!.textContent).toContain('entre 8 y 32');
    });
  });

  it('images mode has no Wan fields and the level sets the variants', async () => {
    await open({}, 'images');
    expect(q('[data-testid=scene-anim-frames]')).toBeNull();
    await click('[data-testid=scene-tier-high]');
    expect(scene().variants).toBe(4);
  });

  it('a wrong value blocks saving and says which one', async () => {
    await open({ animate: true, animation: { frames: 30 } });
    expect(store.validation()!.valid).toBe(false);
    expect(q('[data-testid=scene-quality-error]')!.textContent).toContain('4n+1');
  });
});

describe('SceneFormComponent: generation settings of an imported starting picture', () => {
  let fixture: ComponentFixture<SceneFormComponent>;
  let store: EditorStore;
  let http: HttpTestingController;
  let dialogOpen: ReturnType<typeof vi.spyOn>;
  type MetaApi = {
    onMetadata(f: { name: string; metadata: Record<string, unknown> }): Promise<void>;
    undoMetadata(): void;
  };

  async function open(patch: Record<string, unknown> = {}, answer: unknown = null) {
    TestBed.configureTestingModule({
      imports: [SceneFormComponent],
      providers: [EditorStore, provideHttpClient(), provideHttpClientTesting(), ...SCENE_FORM_TEST_PROVIDERS],
    });
    store = TestBed.inject(EditorStore);
    TestBed.inject(AvailabilityStore).data.set(ALL_AVAILABLE);
    http = TestBed.inject(HttpTestingController);
    const cfg = structuredClone(CONFIG);
    Object.assign(cfg.scenes[0], patch);
    const loading = store.load('demo');
    http.expectOne('/api/projects/demo/config').flush({ yaml: '', parsed: cfg, valid: true });
    await loading;
    dialogOpen = vi.spyOn(TestBed.inject(MatDialog), 'open').mockReturnValue({ afterClosed: () => of(answer) } as never);
    fixture = TestBed.createComponent(SceneFormComponent);
    fixture.detectChanges();
  }
  const api = () => fixture.debugElement.query(By.directive(SceneInitComponent)).componentInstance as unknown as MetaApi;
  const scene = () => store.config()!.scenes[0];
  const dialogData = () => (dialogOpen.mock.calls[0][1] as { data: Record<string, unknown> }).data;
  const FOUND = { prompt: 'a red apple', negative_prompt: 'blurry', seed: 42, steps: 25, cfg_scale: 7, model: 'sd15.safetensors' };

  afterEach(() => {
    http.match((r) => r.url.endsWith('/manifest.json')); // an images project looks for its pictures
    // a scene that starts from a picture reads the catalog to offer editing it
    http.match('/api/assets/catalog').forEach((r) => r.flush({ entries: [] }));
    http.verify();
  });

  it('applies what the user checked in one edit and offers «Deshacer»', async () => {
    await open({ prompt: '', render: { resolution: '640x352' } }, { prompt: 'a red apple', negative_prompt: 'blurry', seed: 42, steps: 25 });
    await api().onMetadata({ name: 'p.png', metadata: FOUND });
    fixture.detectChanges();
    expect(scene()).toMatchObject({ prompt: 'a red apple', negative_prompt: 'blurry', seed: 42, render: { resolution: '640x352', steps: 25 } });
    expect(scene().render?.cfg_scale).toBeUndefined(); // cfg was not checked
    api().undoMetadata();
    expect(scene()).toMatchObject({ prompt: '', negative_prompt: '', render: { resolution: '640x352' } });
    expect(scene().seed).toBeUndefined();
    expect(scene().render?.steps).toBeUndefined();
  });

  it('declining keeps the scene as it was', async () => {
    await open({}, null);
    const before = structuredClone(scene());
    await api().onMetadata({ name: 'p.png', metadata: FOUND });
    expect(scene()).toEqual(before);
    expect(store.dirty()).toBe(false);
  });

  it('tells the dialog when the scene already has a prompt, and whether the model is installed', async () => {
    await open({ prompt: 'ciudad' }, null);
    await api().onMetadata({ name: 'p.png', metadata: FOUND });
    expect(dialogData()).toMatchObject({ hasPrompt: true, modelInstalled: false });
  });

  it('a scene without a model in the found settings passes no model state', async () => {
    await open({ prompt: '' }, null);
    await api().onMetadata({ name: 'p.png', metadata: { prompt: 'x' } });
    expect(dialogData()).toMatchObject({ hasPrompt: false, modelInstalled: null });
  });

  it('the starting-picture picker asks for metadata; the own-picture one does not', async () => {
    await open({ init_image: '' });
    http.expectOne('/api/projects/demo/sources').flush({ sources: [] });
    await fixture.whenStable();
    fixture.detectChanges();
    const input = (fixture.nativeElement as HTMLElement).querySelector('[data-testid=scene-init] input[type=file]') as HTMLInputElement;
    expect(input.accept).toContain('.gif');
    expect(input.accept).toContain('.mp4');
    TestBed.resetTestingModule();
    await open({ image: '' });
    http.expectOne('/api/projects/demo/sources').flush({ sources: [] });
    await fixture.whenStable();
    fixture.detectChanges();
    const own = (fixture.nativeElement as HTMLElement).querySelector('input[type=file]') as HTMLInputElement;
    expect(own.accept).not.toContain('.gif');
  });
});

describe('SceneFormComponent narration voice', () => {
  type VoiceApi = {
    effectiveVoice(): string;
    effectiveSpeaker(): number;
    voiceSpeakers(): { id: number; name: string }[];
    patch(p: Record<string, unknown>): void;
  };
  let store: EditorStore;
  let cmp: VoiceApi;
  let fixture: ComponentFixture<SceneFormComponent>;
  let http: HttpTestingController;
  let played: string[];

  beforeEach(async () => {
    played = [];
    vi.stubGlobal(
      'Audio',
      class {
        onended?: () => void;
        constructor(public src: string) {}
        play() {
          played.push(this.src);
          return Promise.resolve();
        }
        pause() {}
      },
    );
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:wav', revokeObjectURL: () => {} }));
    await TestBed.configureTestingModule({
      imports: [SceneFormComponent],
      providers: [EditorStore, provideHttpClient(), provideHttpClientTesting(), ...SCENE_FORM_TEST_PROVIDERS],
    }).compileComponents();
    store = TestBed.inject(EditorStore);
    TestBed.inject(AvailabilityStore).data.set(ALL_AVAILABLE);
    http = TestBed.inject(HttpTestingController);
    const loading = store.load('demo');
    const parsed = structuredClone(CONFIG);
    parsed.defaults.voice = 'voices/a.onnx';
    http.expectOne('/api/projects/demo/config').flush({ yaml: '', parsed, valid: true, warnings: [] });
    await loading;
    fixture = TestBed.createComponent(SceneFormComponent);
    fixture.detectChanges();
    cmp = fixture.componentInstance as unknown as VoiceApi;
  });
  afterEach(() => vi.unstubAllGlobals());

  it('narrates with the project voice until the scene picks its own', () => {
    expect(cmp.effectiveVoice()).toBe('voices/a.onnx');
    cmp.patch({ voice: 'voices/b.onnx' });
    expect(cmp.effectiveVoice()).toBe('voices/b.onnx');
    cmp.patch({ voice: undefined });
    expect(cmp.effectiveVoice()).toBe('voices/a.onnx');
  });

  it('a voice with several speakers offers them and listen asks for the chosen one', () => {
    TestBed.inject(EnvironmentStore).report.set({
      voices: [{ name: 'a.onnx', size: 1, speakers: [{ id: 0, name: 'M' }, { id: 1, name: 'F' }] }],
    } as never);
    expect(cmp.voiceSpeakers().map((s) => s.name)).toEqual(['M', 'F']);
    expect(cmp.effectiveSpeaker()).toBe(0);
    cmp.patch({ speaker: 1 });
    expect(cmp.effectiveSpeaker()).toBe(1);
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid=scene-listen]')!.click();
    expect(http.expectOne('/api/tts/preview').request.body).toEqual({ text: 'hola', voice: 'voices/a.onnx', speed: 1, speaker: 1 });
  });
});

describe('SceneFormComponent: the pictures a scene generated (images mode)', () => {
  let fixture: ComponentFixture<SceneFormComponent>;
  let store: EditorStore;
  let http: HttpTestingController;

  async function open(mode: string) {
    TestBed.configureTestingModule({
      imports: [SceneFormComponent],
      providers: [EditorStore, provideHttpClient(), provideHttpClientTesting(), ...SCENE_FORM_TEST_PROVIDERS],
    });
    store = TestBed.inject(EditorStore);
    TestBed.inject(AvailabilityStore).data.set(ALL_AVAILABLE);
    http = TestBed.inject(HttpTestingController);
    const cfg = structuredClone(CONFIG);
    cfg.output.mode = mode;
    const loading = store.load('demo');
    http.expectOne('/api/projects/demo/config').flush({ yaml: '', parsed: cfg, valid: true });
    await loading;
    fixture = TestBed.createComponent(SceneFormComponent);
    fixture.detectChanges();
  }
  const q = (sel: string) => (fixture.nativeElement as HTMLElement).querySelector(sel);
  const image = (scene: string, variant: number) => ({
    scene_id: scene, variant, effective_seed: 1, prompt: 'p', negative_prompt: '', model: 'm', resolution: [1, 1], sampler: 'euler', steps: 4,
    file: `out/demo/${scene}_v${variant + 1}.png`,
  });
  afterEach(() => http.verify());

  it('shows one thumbnail per variant of the scene, in order, from the export manifest', async () => {
    await open('images');
    const sceneId = store.config()!.scenes[0].id;
    http.expectOne('/api/projects/demo/artifacts/out/demo/manifest.json').flush({
      project: 'demo', mode: 'images', generated_at: '', images: [image(sceneId, 2), image('other', 0), image(sceneId, 0), image(sceneId, 1), image(sceneId, 3)],
    });
    await fixture.whenStable();
    fixture.detectChanges();
    const thumbs = (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid^=scene-picture-]');
    expect(thumbs.length).toBe(4);
    expect(Array.from(thumbs).map((t) => t.getAttribute('data-testid'))).toEqual([
      'scene-picture-0', 'scene-picture-1', 'scene-picture-2', 'scene-picture-3',
    ]);
    expect(q('[data-testid=pictures-none]')).toBeNull();
  });

  it('says that nothing is generated yet and offers to check again', async () => {
    await open('images');
    http.expectOne('/api/projects/demo/artifacts/out/demo/manifest.json').flush('', { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(q('[data-testid=pictures-none]')).not.toBeNull();
  });

  it('a video project keeps the clip preview and asks for no manifest', async () => {
    await open('video');
    expect(q('[data-testid=scene-preview]')).not.toBeNull();
    expect(q('[data-testid=scene-pictures]')).toBeNull();
    http.expectNone('/api/projects/demo/artifacts/out/demo/manifest.json');
  });
});
