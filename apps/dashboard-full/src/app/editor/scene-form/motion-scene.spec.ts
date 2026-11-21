import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { load } from 'js-yaml';

import { ProjectConfig } from '../../core/api.models';
import { ALL_AVAILABLE, missing } from '../../core/availability.fake';
import { AvailabilityStore } from '../../core/availability.store';
import { EditorStore } from '../editor.store';
import { toYaml } from '../../shared/project-yaml';
import { SceneFormComponent } from './scene-form.component';
import { SCENE_FORM_TEST_PROVIDERS } from './dynamic/testing/scene-form-providers';

const CONFIG: ProjectConfig = {
  project: 'demo',
  output: { mode: 'video', file: 'out/demo.mp4', contact_sheet: false },
  defaults: { model: '', voice: '', resolution: '1280x720', sampler: 'euler', steps: 30, fps: 30, subject_prompt: '', negative_prompt: '', lora_model_dir: '' },
  scenes: [{ id: 'intro', prompt: 'ciudad', negative_prompt: '', tts_text: '', speed: 1, lora: '', silence_seconds: 4 }],
};

type FormApi = { setPictureMode(m: string): void; setOverlay(on: boolean): void; patch(c: Record<string, unknown>): void };

const REPORT = { binaries: [{ name: 'chrome', required: false, present: true, version: '126.0.1' }], models: [], voices: [], loras: [], music: [], music_adapters: [], gpus: [] };

describe('SceneFormComponent: motion graphics and overlays', () => {
  let store: EditorStore;
  let http: HttpTestingController;
  let fixture: ComponentFixture<SceneFormComponent>;
  let cmp: FormApi;
  const q = (sel: string) => (fixture.nativeElement as HTMLElement).querySelector(sel);

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** The page child asks for the environment, the availability and its stored page; answer them. */
  function answerPages(): void {
    http.match((r) => r.url.startsWith('/api/environment')).forEach((r) => r.flush(REPORT));
    http.match((r) => r.url === '/api/models/availability').forEach((r) => r.flush(ALL_AVAILABLE));
    http.match((r) => r.url.startsWith('/api/projects/demo/scenes/')).forEach((r) =>
      r.flush({ scene: 'intro', overlay: r.request.url.includes('overlay=1'), exists: false, html: '', duration: 4 }),
    );
    http.match((r) => r.url.startsWith('/api/clips')).forEach((r) => r.flush({ clips: [] }));
    http.match((r) => r.url === '/api/projects/demo/sources').forEach((r) => r.flush({ sources: [] }));
  }

  async function open(patch: Partial<ProjectConfig['scenes'][0]> = {}, avail: typeof ALL_AVAILABLE = ALL_AVAILABLE): Promise<void> {
    TestBed.configureTestingModule({ imports: [SceneFormComponent], providers: [EditorStore, provideHttpClient(), provideHttpClientTesting(), ...SCENE_FORM_TEST_PROVIDERS, provideRouter([])] });
    TestBed.inject(AvailabilityStore).data.set(avail);
    store = TestBed.inject(EditorStore);
    http = TestBed.inject(HttpTestingController);
    const cfg = structuredClone(CONFIG);
    Object.assign(cfg.scenes[0], patch);
    const loading = store.load('demo');
    http.expectOne('/api/projects/demo/config').flush({ yaml: '', parsed: cfg, valid: true });
    await loading;
    fixture = TestBed.createComponent(SceneFormComponent);
    fixture.detectChanges();
    cmp = fixture.componentInstance as unknown as FormApi;
  }

  afterEach(() => http.verify());

  it('choosing Motion graphic drops the picture, the clip, the animation and the prompt-only fields, and asks for a description before saving', async () => {
    await open({ animate: true, motion_prompt: 'se mueve' });
    cmp.setPictureMode('motion');
    expect(store.config()!.scenes[0].motion_prompt).toBeUndefined();
    fixture.detectChanges();
    answerPages();
    await settle();
    const s = store.config()!.scenes[0];
    expect(s.motion_graphic).toBe('');
    expect(s.animate).toBeUndefined();
    expect(s.clip).toBeUndefined();
    expect(q('[data-testid=motion-graphic]')).toBeTruthy();
    expect(q('[data-testid=motion-page]')).toBeTruthy();
    expect(q('[data-testid=scene-quality]')).toBeNull(); // no render or animation settings for a page
    expect(q('[data-testid=scene-animate]')).toBeNull();
    expect(store.canSave()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Describe qué muestra el gráfico');
  });

  it('the description is written to the file and going back removes it', async () => {
    await open({ motion_graphic: 'tres ideas' });
    answerPages();
    await settle();
    const doc = load(toYaml(store.config()!)) as { scenes: Record<string, unknown>[] };
    expect(doc.scenes[0]['motion_graphic']).toBe('tres ideas');
    cmp.setPictureMode('ai');
    expect(store.config()!.scenes[0].motion_graphic).toBeUndefined();
  });

  it('adds an overlay to a normal scene, edits it, and removes it', async () => {
    await open();
    answerPages();
    expect(q('[data-testid=overlay-add]')).toBeTruthy();
    cmp.setOverlay(true);
    fixture.detectChanges();
    answerPages();
    await settle();
    expect(store.config()!.scenes[0].overlay).toEqual({ text: '' });
    expect(q('[data-testid=overlay-page]')).toBeTruthy();
    expect(store.canSave()).toBe(false); // the text is required
    const type = async (testId: string, value: string) => {
      const field = q(`[data-testid=${testId}]`) as HTMLInputElement;
      field.value = value;
      field.dispatchEvent(new Event('input'));
      await settle();
    };
    await type('overlay-text', 'Capítulo 1');
    await type('overlay-start', '1');
    await type('overlay-end', '3');
    cmp.patch({ overlay: { ...store.config()!.scenes[0].overlay!, position: 'top' } });
    fixture.detectChanges();
    answerPages();
    const doc = load(toYaml(store.config()!)) as { scenes: { overlay?: Record<string, unknown> }[] };
    expect(doc.scenes[0].overlay).toEqual({ text: 'Capítulo 1', position: 'top', start: 1, end: 3 });
    expect(store.canSave()).toBe(true);
    cmp.setOverlay(false);
    expect(store.config()!.scenes[0].overlay).toBeUndefined();
  });

  describe('without the model that writes the pages', () => {
    const none = () => missing('motion_graphics', 'no_models');

    it('hides the Animated graphic option and the overlay, and says what is missing', async () => {
      await open({}, none());
      answerPages();
      await settle();
      expect(q('[data-testid=picture-mode-motion]')).toBeNull();
      expect(q('[data-testid=overlay-add]')).toBeNull();
      expect(q('[data-testid=model-notice]')?.textContent).toContain('ollama pull gemma4:26b');
    });

    it('hides the whole overlay section when nothing answers (no notice either)', async () => {
      await open({}, missing('motion_graphics', 'unreachable'));
      answerPages();
      await settle();
      expect(q('[data-testid=scene-overlay]')).toBeNull();
      expect(q('[data-testid=picture-mode-motion]')).toBeNull();
    });

    it('keeps what a scene already has: its graphic and its overlay stay editable', async () => {
      await open({ motion_graphic: 'un título', silence_seconds: 3, overlay: { text: 'Hola' } }, none());
      answerPages();
      await settle();
      expect(q('[data-testid=picture-mode-motion]')).toBeTruthy();
      expect(q('[data-testid=motion-graphic]')).toBeTruthy();
      expect(q('[data-testid=overlay-text]')).toBeTruthy();
    });
  });

  it('an overlay that ends after the silent scene is flagged', async () => {
    await open({ overlay: { text: 'x', end: 9 } });
    answerPages();
    await settle();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('empieza después del final');
    expect(store.canSave()).toBe(false);
  });
});
