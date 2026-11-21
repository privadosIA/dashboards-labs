import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Part } from '@lab/motion-parts';
import { load } from 'js-yaml';

import { ProjectConfig } from '../../core/api.models';
import { ALL_AVAILABLE, missing } from '../../core/availability.fake';
import { AvailabilityStore } from '../../core/availability.store';
import { FakeMotionCatalogStore } from '../../core/motion-catalog.fake';
import { MotionCatalogStore } from '../../core/motion-catalog.store';
import { toYaml } from '../../shared/project-yaml';
import { EditorStore } from '../editor.store';
import { SCENE_FORM_TEST_PROVIDERS } from './dynamic/testing/scene-form-providers';
import { SceneFormComponent } from './scene-form.component';

const CONFIG: ProjectConfig = {
  project: 'demo',
  output: { mode: 'video', file: 'out/demo.mp4', contact_sheet: false },
  defaults: { model: '', voice: '', resolution: '1280x720', sampler: 'euler', steps: 30, fps: 30, subject_prompt: '', negative_prompt: '', lora_model_dir: '' },
  scenes: [{ id: 'intro', prompt: 'ciudad', negative_prompt: '', tts_text: '', speed: 1, lora: '', silence_seconds: 4 }],
};

const COUNTER: Part = {
  name: 'counter',
  description: 'A number that counts up',
  levels: ['simple', 'medium', 'advanced'],
  costMs: 55,
  manual: false,
  params: [
    { name: 'to', type: 'int', default: '100', min: 1, max: 999 },
    { name: 'on', type: 'bool', default: 'true' },
  ],
};
const BLANK: Part = { name: 'blank', description: 'Draws nothing', levels: ['simple', 'medium', 'advanced'], costMs: 40, manual: true, params: [] };

type FormApi = { setPictureMode(m: string): void };

describe('SceneFormComponent: a scene drawn by a part of the catalog', () => {
  let store: EditorStore;
  let http: HttpTestingController;
  let fixture: ComponentFixture<SceneFormComponent>;
  let cmp: FormApi;
  const el = () => fixture.nativeElement as HTMLElement;
  const q = (sel: string) => el().querySelector(sel);

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** The children of the form ask for the environment, the availability and the project's sources; answer them. */
  let choice: object | null = null;

  function answer(): void {
    http.match((r) => r.url.startsWith('/api/environment')).forEach((r) => r.flush({ binaries: [], models: [], voices: [], loras: [], music: [], music_adapters: [], gpus: [] }));
    http.match((r) => r.url === '/api/models/availability').forEach((r) => r.flush(ALL_AVAILABLE));
    http.match((r) => r.url.startsWith('/api/clips')).forEach((r) => r.flush({ clips: [] }));
    http.match((r) => r.url === '/api/projects/demo/sources').forEach((r) => r.flush({ sources: [] }));
    http.match((r) => r.url === '/api/assets/catalog').forEach((r) => r.flush({ entries: [] }));
    // A scene made with `auto` looks for the record of what the model chose: there is none until a run makes it.
    http.match((r) => r.url.endsWith('.choice.json')).forEach((r) => (choice ? r.flush(choice) : r.flush({}, { status: 404, statusText: 'Not Found' })));
  }

  async function open(patch: Partial<ProjectConfig['scenes'][0]> = {}, options: { parts?: Part[]; avail?: typeof ALL_AVAILABLE; choice?: object } = {}): Promise<void> {
    choice = options.choice ?? null;
    TestBed.configureTestingModule({ imports: [SceneFormComponent], providers: [EditorStore, provideHttpClient(), provideHttpClientTesting(), ...SCENE_FORM_TEST_PROVIDERS, provideRouter([])] });
    TestBed.inject(AvailabilityStore).data.set(options.avail ?? ALL_AVAILABLE);
    (TestBed.inject(MotionCatalogStore) as unknown as FakeMotionCatalogStore).parts.set(options.parts ?? [COUNTER, BLANK]);
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
    answer();
    await settle();
  }

  const scene = () => store.config()!.scenes[0];

  async function choose(option: string): Promise<void> {
    q('[data-testid=part-select] .mat-mdc-select-trigger')!.dispatchEvent(new Event('click'));
    (q('[data-testid=part-select]') as HTMLElement).click();
    await settle();
    const found = [...document.querySelectorAll<HTMLElement>('mat-option')].find((o) => o.textContent?.trim() === option);
    if (!found) throw new Error(`no option "${option}": ${[...document.querySelectorAll('mat-option')].map((o) => o.textContent?.trim()).join(', ')}`);
    found.click();
    await settle();
  }

  async function type(selector: string, value: string): Promise<void> {
    const input = q(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  afterEach(() => {
    answer(); // a record of the model's choice that was asked for after the last answer
    http.verify();
    document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = ''));
  });

  describe('the way is offered', () => {
    it('with the catalog, beside the other ways', async () => {
      await open();
      expect(q('[data-testid=picture-mode-part]')).toBeTruthy();
    });

    it('not when the server has no catalog, and the other ways are there as before', async () => {
      await open({}, { parts: [] });
      expect(q('[data-testid=picture-mode-part]')).toBeNull();
      expect(q('[data-testid=picture-mode-motion]')).toBeTruthy();
    });

    it('for a scene that is already drawn by a part, even without the catalog', async () => {
      await open({ prompt: '', motion_part: 'counter' }, { parts: [] });
      expect(q('[data-testid=picture-mode-part]')).toBeTruthy();
    });
  });

  describe('choosing the way', () => {
    it('drops what a part cannot be combined with and asks for a part before saving', async () => {
      await open({ animate: true, motion_prompt: 'se mueve', init_image: 'a.png' });
      cmp.setPictureMode('part');
      await settle();
      answer();
      const s = scene();
      expect(s.motion_part).toBe('');
      expect(s.animate).toBeUndefined();
      expect(s.motion_prompt).toBeUndefined();
      expect(s.init_image).toBeUndefined();
      expect(q('[data-testid=scene-motion-part]')).toBeTruthy();
      expect(q('[data-testid=part-error]')!.textContent).toContain('Elige una parte');
      expect(q('[data-testid=scene-quality]')).toBeNull();
      expect(store.canSave()).toBe(false);
    });

    it('does not ask for a prompt, and going back to a generated scene removes every field of the part', async () => {
      await open({ prompt: '', motion_part: 'counter', motion_params: { to: 5 }, motion_text: 'hola', motion_bpm: 100 });
      expect(store.validation()!.scenes[0].prompt).toBeUndefined();
      cmp.setPictureMode('ai');
      await settle();
      answer();
      for (const k of ['motion_part', 'motion_params', 'motion_text', 'motion_bpm'] as const) expect(scene()[k], k).toBeUndefined();
    });
  });

  describe('the part', () => {
    it('picked from the catalog starts with its defaults, drawn by the shared form, and is written to the file', async () => {
      await open({ prompt: '', motion_part: '' });
      await choose('counter');
      expect(scene().motion_part).toBe('counter');
      expect(scene().motion_params).toEqual({ to: 100, on: true });
      expect(scene().motion_graphic).toBeUndefined();
      expect(q('lab-part-params')).toBeTruthy();
      expect((q('lab-part-params input[id*="_input_to_"]') as HTMLInputElement).value).toBe('100');
      expect(store.canSave()).toBe(true);
      const doc = load(toYaml(store.config()!)) as { scenes: Record<string, unknown>[] };
      expect(doc.scenes[0]['motion_part']).toBe('counter');
      expect(doc.scenes[0]['motion_params']).toEqual({ to: 100, on: true });
    });

    it('takes the parameters as the person edits them, typed', async () => {
      await open({ prompt: '', motion_part: 'counter', motion_params: { to: 100, on: true } });
      await type('lab-part-params input[id*="_input_to_"]', '42');
      expect(scene().motion_params).toEqual({ to: 42, on: true });
    });

    it('a part with no parameters says so, and has none written', async () => {
      await open({ prompt: '', motion_part: '' });
      await choose('blank');
      expect(scene().motion_part).toBe('blank');
      expect(q('[data-testid=no-params]')).toBeTruthy();
    });

    it('is refused in the scene when a parameter is out of its limits, and the scene cannot be saved', async () => {
      await open({ prompt: '', motion_part: 'counter', motion_params: { to: 5000, on: true } });
      expect(q('[data-testid=part-params-error]')!.textContent).toContain('entre 1 y 999');
      expect(store.canSave()).toBe(false);
    });

    it('is refused when the catalog does not have it', async () => {
      await open({ prompt: '', motion_part: 'ghost' });
      expect(q('[data-testid=part-error]')!.textContent).toContain('«ghost»');
    });
  });

  describe('auto', () => {
    it('lets the model choose: the description is asked for and the scene cannot be saved without it', async () => {
      await open({ prompt: '', motion_part: '' });
      await choose('El modelo elige');
      expect(scene().motion_part).toBe('auto');
      expect(scene().motion_graphic).toBe('');
      expect(scene().motion_params).toBeUndefined();
      expect(q('[data-testid=motion-graphic]')).toBeTruthy();
      expect(q('lab-part-params')).toBeNull();
      expect(store.canSave()).toBe(false);
      expect(el().textContent).toContain('elija la parte');
      await type('[data-testid=motion-graphic] textarea, textarea[data-testid=motion-graphic]', 'tres ideas');
      expect(scene().motion_graphic).toBe('tres ideas');
      expect(store.canSave()).toBe(true);
    });

    it('is not offered when the model that writes graphics cannot run, unless the scene already says it', async () => {
      await open({ prompt: '', motion_part: '' }, { avail: missing('motion_graphics', 'no_models') });
      q('[data-testid=part-select]')!.dispatchEvent(new Event('click'));
      (q('[data-testid=part-select]') as HTMLElement).click();
      await settle();
      expect(document.querySelector('[data-testid=part-auto]')).toBeNull();
      expect([...document.querySelectorAll('mat-option')].map((o) => o.textContent?.trim())).toEqual(['counter', 'blank']);
    });

    it('picking a named part after auto removes the description', async () => {
      await open({ prompt: '', motion_part: 'auto', motion_graphic: 'tres ideas' });
      await choose('counter');
      expect(scene().motion_graphic).toBeUndefined();
      expect(scene().motion_params).toEqual({ to: 100, on: true });
    });
  });

  describe('what the model chose', () => {
    it('is shown for an `auto` scene once a run has made the record, and not before', async () => {
      await open({ prompt: '', motion_part: 'auto', motion_graphic: 'tres ideas' });
      expect(q('[data-testid=part-chosen]')).toBeNull();
      TestBed.resetTestingModule();
      await open({ prompt: '', motion_part: 'auto', motion_graphic: 'tres ideas' }, { choice: { part: 'counter', params: { to: 5, on: true } } });
      expect(q('[data-testid=part-chosen]')!.textContent).toContain('counter');
      expect(q('[data-testid=part-chosen]')!.textContent).toContain('to: 5');
    });

    it('is not asked for a scene with a named part', async () => {
      await open({ prompt: '', motion_part: 'counter', motion_params: { to: 5, on: true } });
      expect(q('[data-testid=part-chosen]')).toBeNull();
    });
  });

  describe('the text and the tempo', () => {
    it('are written as typed and removed when emptied', async () => {
      await open({ prompt: '', motion_part: 'counter', motion_params: { to: 5, on: true } });
      await type('[data-testid=part-text]', 'hola');
      await type('[data-testid=part-bpm]', '96');
      expect(scene().motion_text).toBe('hola');
      expect(scene().motion_bpm).toBe(96);
      await type('[data-testid=part-text]', '');
      await type('[data-testid=part-bpm]', '');
      expect(scene().motion_text).toBeUndefined();
      expect(scene().motion_bpm).toBeUndefined();
    });

    it('a tempo outside 40 to 240 is refused in the scene', async () => {
      await open({ prompt: '', motion_part: 'counter', motion_params: { to: 5, on: true }, motion_bpm: 300 });
      expect(q('[data-testid=part-bpm-error]')!.textContent).toContain('240');
      expect(store.canSave()).toBe(false);
    });

    it('a text of more than 120 characters is refused in the scene', async () => {
      await open({ prompt: '', motion_part: 'counter', motion_params: { to: 5, on: true }, motion_text: 'a'.repeat(121) });
      expect(q('[data-testid=part-text-error]')!.textContent).toContain('120');
    });
  });
});
