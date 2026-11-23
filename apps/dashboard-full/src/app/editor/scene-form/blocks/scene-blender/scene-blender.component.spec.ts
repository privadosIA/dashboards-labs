import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BlenderDescription, ProjectConfig } from '../../../../core/api.models';
import { provideAppDynamicForms } from '../../../../shared/dynamic/dynamic-forms.providers';
import { EditorStore } from '../../../editor.store';
import { SceneBlenderComponent } from './scene-blender.component';

const CONFIG: ProjectConfig = {
  project: 'demo',
  output: { mode: 'video', file: 'out/demo.mp4', contact_sheet: false },
  defaults: { model: '', voice: '', resolution: '1280x720', sampler: 'euler', steps: 30, fps: 30, subject_prompt: '', negative_prompt: '', lora_model_dir: '' },
  scenes: [{ id: 'titulo', prompt: '', negative_prompt: '', tts_text: '', speed: 1, lora: '', silence_seconds: 5, blender: { build: 'titulo.scene.json' } }],
};

const BASE = '/api/projects/demo/blender/descriptions';
const FILE = `${BASE}/titulo.scene.json`;
const DESCRIPTION = { version: 1, camera: { lens: 50 } };
const STORED: BlenderDescription = { name: 'titulo.scene.json', description: DESCRIPTION, resolved: DESCRIPTION };
const WRITTEN = { ...STORED, provider: 'mock', model: 'gemma:26b', attempts: 2 };
const PNG = () => new Blob(['png'], { type: 'image/png' });
const refuse = (status: number, message: string) => ({ body: { error: { code: 'x', message } }, init: { status, statusText: 'x' } });

describe('SceneBlenderComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<SceneBlenderComponent>;
  const root = () => fixture.nativeElement as HTMLElement;
  const q = (id: string) => root().querySelector(`[data-testid=${id}]`) as HTMLElement | null;
  const button = (id: string) => q(id) as HTMLButtonElement;
  const inner = (id: string, tag: string) => (q(id)?.matches(tag) ? q(id) : q(id)?.querySelector(tag)) as HTMLInputElement;

  /** Lets the section's async work finish (an answer is read after several awaits) and draws what it set. */
  async function settle(): Promise<void> {
    await fixture.whenStable();
    await new Promise((done) => setTimeout(done, 0));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function type(id: string, tag: string, value: string): Promise<void> {
    const el = inner(id, tag);
    el.value = value;
    el.dispatchEvent(new Event('input'));
    await settle();
  }

  /** Opens the section for the scene `titulo` and answers the read of its file (`null`: never written). */
  async function open(found: BlenderDescription | null, seconds: number | undefined = 5): Promise<void> {
    TestBed.configureTestingModule({ imports: [SceneBlenderComponent], providers: [EditorStore, provideHttpClient(), provideHttpClientTesting(), provideAppDynamicForms()] });
    http = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(EditorStore);
    const loading = store.load('demo');
    http.expectOne('/api/projects/demo/config').flush({ yaml: '', parsed: CONFIG, valid: true });
    await loading;
    fixture = TestBed.createComponent(SceneBlenderComponent);
    fixture.componentRef.setInput('sceneId', 'titulo');
    fixture.componentRef.setInput('build', 'titulo.scene.json');
    fixture.componentRef.setInput('sceneSeconds', seconds);
    fixture.detectChanges();
    const read = http.expectOne((r) => r.method === 'GET' && r.url === FILE);
    if (found === null) read.flush({ error: { message: 'no' } }, { status: 404, statusText: 'Not Found' });
    else {
      read.flush(found);
      await settle();
      http.expectOne((r) => r.method === 'POST' && r.url === `${FILE}/preview`).flush(PNG());
    }
    await settle();
  }

  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:frame'), revokeObjectURL: vi.fn() }));
  });
  afterEach(() => http.verify());

  describe('a scene whose file was never written', () => {
    it('says the file does not exist and offers only to write', async () => {
      await open(null);
      expect(q('blender-needs-file')).toBeTruthy();
      expect(q('blender-source')).toBeNull();
      expect(q('blender-change')).toBeNull();
      expect(button('blender-write').disabled).toBe(true); // no idea yet
    });

    it('takes the length from the scene when it has one, and 5 s when it has none', async () => {
      await open(null, 8);
      expect(inner('blender-seconds', 'input').value).toBe('8');
      TestBed.resetTestingModule();
      await open(null, undefined);
      expect(inner('blender-seconds', 'input').value).toBe('5');
    });

    it('writes from the idea: request, wait, description, who wrote it and a frame', async () => {
      await open(null);
      await type('blender-idea', 'textarea', 'a title on a studio floor');
      expect(button('blender-write').disabled).toBe(false);
      button('blender-write').click();
      await settle();
      expect(q('blender-wait')).toBeTruthy();
      const req = http.expectOne(BASE);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ name: 'titulo.scene.json', idea: 'a title on a studio floor', seconds: 5, revise: false });
      req.flush(WRITTEN);
      await settle();
      http.expectOne(`${FILE}/preview`).flush(PNG());
      await settle();
      expect(q('blender-wait')).toBeNull();
      expect(inner('blender-source', 'textarea').value).toContain('"lens": 50');
      expect(q('blender-written')?.textContent).toContain('gemma:26b');
      expect(q('blender-frame')?.getAttribute('src')).toBe('blob:frame');
      expect(q('blender-needs-file')).toBeNull();
      expect(inner('blender-idea', 'textarea').value).toBe('');
    });
  });

  describe('a scene with a description', () => {
    it('opens with its text and a frame, and offers to change it', async () => {
      await open(STORED);
      expect(inner('blender-source', 'textarea').value).toBe(JSON.stringify(DESCRIPTION, null, 2));
      expect(q('blender-frame')).toBeTruthy();
      expect(button('blender-change')).toBeTruthy();
      expect(q('blender-undo')).toBeNull(); // nothing to put back yet
    });

    it('changing it sends revise and offers to put the old text back, which saves it', async () => {
      await open(STORED);
      await type('blender-idea', 'textarea', 'the camera further away');
      button('blender-change').click();
      await settle();
      const req = http.expectOne(BASE);
      expect(req.request.body).toEqual({ name: 'titulo.scene.json', idea: 'the camera further away', seconds: 5, revise: true });
      req.flush({ ...WRITTEN, description: { version: 1, camera: { lens: 40 } } });
      await settle();
      http.expectOne(`${FILE}/preview`).flush(PNG());
      await settle();
      expect(inner('blender-source', 'textarea').value).toContain('"lens": 40');

      button('blender-undo').click();
      await settle();
      const put = http.expectOne((r) => r.method === 'PUT' && r.url === FILE);
      expect(put.request.body).toEqual({ description: DESCRIPTION, seconds: 5 });
      put.flush(STORED);
      await settle();
      http.expectOne(`${FILE}/preview`).flush(PNG());
      await settle();
      expect(inner('blender-source', 'textarea').value).toContain('"lens": 50');
      expect(q('blender-undo')).toBeNull();
    });

    it('saves the edited text with the length of the scene', async () => {
      await open(STORED);
      await type('blender-source', 'textarea', '{"version": 1, "camera": {"lens": 35}}');
      expect(q('blender-unsaved')).toBeTruthy();
      button('blender-save').click();
      await settle();
      const put = http.expectOne((r) => r.method === 'PUT' && r.url === FILE);
      expect(put.request.body).toEqual({ description: { version: 1, camera: { lens: 35 } }, seconds: 5 });
      put.flush({ ...STORED, description: { version: 1, camera: { lens: 35 } } });
      await settle();
      http.expectOne(`${FILE}/preview`).flush(PNG());
      await settle();
      expect(q('blender-unsaved')).toBeNull();
    });

    it('does not send text that is not JSON and says where it breaks', async () => {
      await open(STORED);
      await type('blender-source', 'textarea', '{\n "version": 1,\n "camera" {"lens": 35}\n}');
      button('blender-save').click();
      await settle();
      http.expectNone((r) => r.method === 'PUT');
      expect(q('blender-save-error')?.textContent).toContain('línea 3');
      expect(inner('blender-source', 'textarea').value).toContain('"camera" {');
    });

    it('shows the faults of a refused save by place, under the editor, and keeps the typed text', async () => {
      await open(STORED);
      await type('blender-source', 'textarea', '{"version": 1, "objects": []}');
      button('blender-save').click();
      await settle();
      const r = refuse(400, 'objects[3].keys[2].t: 7 is outside the scene (0 to 5 s)');
      http.expectOne((x) => x.method === 'PUT').flush(r.body, r.init);
      await settle();
      expect(q('blender-save-error')?.textContent).toContain('objects[3].keys[2].t: 7 is outside the scene');
      expect(inner('blender-source', 'textarea').value).toBe('{"version": 1, "objects": []}');
    });
  });

  describe('the preview', () => {
    it('draws the second the slider is on when asked to refresh', async () => {
      await open(STORED);
      const slider = q('blender-time') as HTMLInputElement;
      slider.value = '2.5';
      slider.dispatchEvent(new Event('input'));
      slider.dispatchEvent(new Event('change'));
      await settle();
      button('blender-refresh').click();
      await settle();
      const req = http.expectOne(`${FILE}/preview`);
      expect(req.request.body).toEqual({ t: 2.5, seconds: 5 });
      req.flush(PNG());
      await settle();
    });

    it('says how to install Blender when it is missing, and the rest keeps working', async () => {
      await open(STORED);
      button('blender-refresh').click();
      await settle();
      http.expectOne(`${FILE}/preview`).error(new ProgressEvent('error'), { status: 503, statusText: 'x' });
      await settle();
      expect(q('blender-preview-error')).toBeTruthy();
      expect(q('blender-frame')).toBeNull();
      expect(button('blender-write').disabled).toBe(true); // no idea typed, not blocked by the preview
      expect(inner('blender-source', 'textarea')).toBeTruthy();
    });

    it('reads the JSON error of a failed preview that arrives as an image request', async () => {
      await open(STORED);
      button('blender-refresh').click();
      await settle();
      const body = new Blob([JSON.stringify({ error: { code: 'unavailable', message: 'Blender is not installed: install Blender 4.2 or newer' } })], { type: 'application/json' });
      http.expectOne(`${FILE}/preview`).flush(body, { status: 503, statusText: 'Unavailable' });
      await settle();
      expect(q('blender-preview-error')?.textContent).toContain('install Blender');
    });
  });

  describe('what a refused write says', () => {
    async function ask(revise = false): Promise<void> {
      await open(revise ? STORED : null);
      await type('blender-idea', 'textarea', 'a cube');
      button(revise ? 'blender-change' : 'blender-write').click();
      await settle();
    }
    const flush = async (status: number, message: string) => {
      const r = refuse(status, message);
      http.expectOne((x) => x.method === 'POST' && x.url === BASE).flush(r.body, r.init);
      await settle();
    };

    it('409 and 503: the words of the server', async () => {
      await ask();
      await flush(409, 'a run is in progress and the model loads on this machine');
      expect(q('blender-write-error')?.textContent).toContain('a run is in progress');
      button('blender-write').click();
      await settle();
      await flush(503, 'no model');
      expect(q('blender-write-error')?.textContent).toContain('no model');
    });

    it('422: the last problem and to try again, with the previous description untouched', async () => {
      await ask(true);
      await flush(422, 'objects[0].id: repeated');
      const text = q('blender-write-error')?.textContent ?? '';
      expect(text).toContain('objects[0].id: repeated');
      expect(text).toContain('Inténtalo de nuevo');
      expect(inner('blender-source', 'textarea').value).toContain('"lens": 50');
      expect(q('blender-undo')).toBeNull();
    });

    it('404 on a change: write the scene first', async () => {
      await ask(true);
      await flush(404, 'no');
      expect(q('blender-write-error')?.textContent).toContain('escribe primero la escena');
    });

    it('400: the message next to the field', async () => {
      await ask();
      await flush(400, 'idea: at most 2000 characters');
      expect(q('blender-write-error')?.textContent).toContain('at most 2000 characters');
    });
  });
});
