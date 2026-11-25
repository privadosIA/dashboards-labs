import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { load } from 'js-yaml';

import { DefaultsPanelComponent } from '../defaults-panel/defaults-panel.component';

import { EnvironmentReport, ProjectConfig } from '../../core/api.models';
import { ProjectHistoryDialogComponent } from '../../projects/project-history-dialog/project-history-dialog.component';
import { EditorStore } from '../editor.store';
import { EditorPageComponent } from './editor-page.component';
import { SCENE_FORM_TEST_PROVIDERS } from '../scene-form/dynamic/testing/scene-form-providers';

const CONFIG: ProjectConfig = {
  project: 'demo',
  output: { mode: 'video', file: 'out/demo.mp4', contact_sheet: false },
  defaults: {
    model: 'models/m.safetensors',
    voice: 'voices/desaparecida.onnx',
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
      negative_prompt: '',
      tts_text: 'bienvenidos',
      speed: 1,
      lora: '',
    },
  ],
};

const ENV: EnvironmentReport = {
  binaries: [],
  models: [{ name: 'm.safetensors', size: 1 }],
  voices: [{ name: 'v.onnx', size: 1 }],
  loras: [],
  gpus: [],
};

describe('EditorPageComponent', () => {
  let fixture: ComponentFixture<EditorPageComponent>;
  let http: HttpTestingController;
  let store: EditorStore;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditorPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), ...SCENE_FORM_TEST_PROVIDERS, provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(EditorPageComponent);
    fixture.componentRef.setInput('id', 'demo');
    fixture.detectChanges();
    http
      .expectOne('/api/projects/demo/config')
      .flush({ yaml: '', parsed: structuredClone(CONFIG), valid: true, warnings: [] });
    http.expectOne('/api/environment').flush(ENV);
    await fixture.whenStable();
    fixture.detectChanges();
    store = fixture.debugElement.injector.get(EditorStore);
  });

  afterEach(() => {
    // the defaults panel reads the catalog once for the recommended settings
    http.match('/api/assets/catalog').forEach((r) => r.flush({ entries: [] }));
    http.match((r) => r.url.endsWith('/manifest.json')); // the scene form of an images project looks for its pictures
    http.verify();
  });

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  describe('the history of the project', () => {
    let open: ReturnType<typeof vi.spyOn>;
    const history = () => (fixture.nativeElement as HTMLElement).querySelector('[data-testid="editor-history"]') as HTMLButtonElement;
    const dialogData = () => (open.mock.calls.at(-1)![1] as { data: { projectId: string; unsaved: boolean; onRestored: (v: number) => void } }).data;

    beforeEach(() => {
      open = vi.spyOn(TestBed.inject(MatDialog), 'open').mockReturnValue({ afterClosed: () => of(undefined) } as never);
    });

    it('is a button of the header that opens the history of this project, with no unsaved edits to warn about', async () => {
      history().click();
      expect(open).toHaveBeenCalledWith(ProjectHistoryDialogComponent, expect.objectContaining({ data: expect.objectContaining({ projectId: 'demo', unsaved: false }) }));
    });

    it('tells the dialog when the editor has edits that were not saved', async () => {
      store.updateScene(0, { prompt: 'ciudad al anochecer' });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(store.dirty()).toBe(true);
      history().click();
      expect(dialogData().unsaved).toBe(true);
    });

    it('closing it without restoring touches nothing: no request, and the edits stay', async () => {
      store.updateScene(0, { prompt: 'ciudad al anochecer' });
      history().click();
      expect(store.dirty()).toBe(true);
      http.expectNone('/api/projects/demo/config');
    });

    it('after a restore the editor reads the project again and has no unsaved edits', async () => {
      store.updateScene(0, { prompt: 'ciudad al anochecer' });
      history().click();
      dialogData().onRestored(3);
      const restored = structuredClone(CONFIG);
      restored.scenes[0].prompt = 'the restored prompt';
      http.expectOne('/api/projects/demo/config').flush({ yaml: '', parsed: restored, valid: true, warnings: [] });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(store.dirty()).toBe(false);
      expect(store.config()!.scenes[0].prompt).toBe('the restored prompt');
    });

    it('cannot be opened while the editor is saving', async () => {
      (store.saving as unknown as { set: (v: boolean) => void }).set(true);
      fixture.detectChanges();
      expect(history().disabled).toBe(true);
    });
  });

  it('renders the scene with its fields and flags the missing voice', async () => {
    const el = fixture.nativeElement as HTMLElement;
    const inputs = Array.from(el.querySelectorAll('input')) as HTMLInputElement[];
    expect(inputs.some((i) => i.value === 'intro')).toBe(true);
    const promptArea = el.querySelector('textarea') as HTMLTextAreaElement;
    expect(promptArea.value).toBe('ciudad');

    // The configured voice is absent from the inventory: it stays selected
    // in the options, flagged as missing, never silently replaced.
    const panel = fixture.debugElement.query(By.directive(DefaultsPanelComponent))
      .componentInstance as Record<string, () => { value: string; missing: boolean }[]>;
    const voiceOptions = panel['voiceOptions']();
    expect(voiceOptions[0]).toEqual({ value: 'voices/desaparecida.onnx', missing: true });
    expect(voiceOptions.some((o) => o.value === 'voices/v.onnx' && !o.missing)).toBe(true);
  });

  it('writes edits into the model and gates save on validation', async () => {
    store.updateScene(0, { prompt: '' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text()).toContain('El prompt no puede estar vacío');
    expect(store.canSave()).toBe(false);

    store.updateScene(0, { prompt: 'ciudad al anochecer' });
    await fixture.whenStable();
    expect(store.canSave()).toBe(true);
  });

  it('flags the tts/silence conflict before any save is attempted', async () => {
    store.updateScene(0, { silence_seconds: 2 });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text()).toContain('excluyentes');
    http.expectNone({ method: 'PUT', url: '/api/projects/demo/config' });
  });

  it('images mode hides narration/motion/look, shows variants, and never discards values', async () => {
    // Video mode: narration visible.
    expect(text()).toContain('Narración');

    store.updateOutput({ mode: 'images' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text()).not.toContain('Narración');
    expect(text()).not.toContain('Movimiento de cámara');
    expect(text()).toContain('variants');
    expect(text()).toContain('hoja de contactos');
    // The hidden narration value is preserved in the model…
    expect(store.config()!.scenes[0].tts_text).toBe('bienvenidos');

    // …and switching back restores the field with its value.
    store.updateOutput({ mode: 'video' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text()).toContain('Narración');
    const areas = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('textarea'),
    ) as HTMLTextAreaElement[];
    expect(areas.some((a) => a.value === 'bienvenidos')).toBe(true);
  });

  it('shows the server message next to the offending scene after a rejected save', async () => {
    store.updateScene(0, { prompt: 'editada' });
    const saving = store.save();
    http
      .expectOne({ method: 'PUT', url: '/api/projects/demo/config' })
      .flush(
        { error: { code: 'validation_failed', message: 'config: scene "intro" has an empty tts_text' } },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    await saving;
    fixture.detectChanges();
    expect(text()).toContain('empty tts_text');
  });

  it('sends a project of 3D models to its own page: it declares models, not scenes', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const other = TestBed.createComponent(EditorPageComponent);
    other.componentRef.setInput('id', 'objetos');
    other.detectChanges();
    http.expectOne('/api/projects/objetos/config').flush({ yaml: '', parsed: { ...structuredClone(CONFIG), project: 'objetos', output: { mode: 'models3d', file: '', contact_sheet: false }, scenes: [], models: [{ id: 'a', prompt: 'x' }] }, valid: true, warnings: [] });
    http.match('/api/environment').forEach((r) => r.flush(ENV));
    await other.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    expect(navigate).toHaveBeenCalledWith(['/projects', 'objetos', 'models3d'], { replaceUrl: true });
  });

  describe('switching the project to music', () => {
    const el = () => fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const pickMode = async (mode: string) => {
      el().querySelector<HTMLButtonElement>(`[data-testid="output-mode"] mat-button-toggle[value="${mode}"] button`)!.click();
      await settle();
    };

    it('offers music as a third mode', () => {
      const modes = Array.from(el().querySelectorAll('[data-testid="output-mode"] mat-button-toggle')).map((t) => t.getAttribute('value'));
      expect(modes).toEqual(['video', 'images', 'music']);
    });

    it('warns that the scenes will not be used and leave the file on save, and loses nothing yet', async () => {
      await pickMode('music');
      const notice = el().querySelector('[data-testid="to-music-notice"]')!;
      expect(notice.textContent).toContain('1 escenas dejarán de usarse');
      expect(notice.textContent).toContain('no se pierde nada');
      expect(el().querySelector('app-scene-form')).toBeNull();
      expect(store.config()?.scenes.length).toBe(1); // still in the model
      expect(store.dirty()).toBe(true);
      expect(store.canSave()).toBe(true);
    });

    it('writes tracks instead of scenes on save and opens the music studio', async () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      await pickMode('music');
      el().querySelector<HTMLButtonElement>('button[mat-flat-button]')!.click();
      await settle();
      const req = http.expectOne('/api/projects/demo/config');
      const doc = load(req.request.body.yaml) as Record<string, unknown>;
      expect(doc['output']).toEqual({ mode: 'music' });
      expect((doc['tracks'] as { id: string }[]).map((t) => t.id)).toEqual(['pista_1']);
      expect('scenes' in doc).toBe(false);
      req.flush({ saved: true });
      await settle();
      expect(navigate).toHaveBeenCalledWith(['/projects', 'demo', 'music']);
    });

    it('stays where it is when the server refuses the switch', async () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      await pickMode('music');
      el().querySelector<HTMLButtonElement>('button[mat-flat-button]')!.click();
      await settle();
      http.expectOne('/api/projects/demo/config').flush(
        { error: { code: 'validation_failed', message: 'config: music synthesis model "x.gguf" not found in models/music' } },
        { status: 422, statusText: 'Unprocessable' },
      );
      await settle();
      expect(navigate).not.toHaveBeenCalled();
      expect(text()).toContain('not found in models/music');
      expect(store.dirty()).toBe(true);
    });

    it('choosing another mode again brings the scenes back and saves a normal scene project', async () => {
      await pickMode('music');
      await pickMode('video');
      expect(el().querySelector('[data-testid="to-music-notice"]')).toBeNull();
      expect(el().querySelector('app-scene-form')).not.toBeNull();
      const yaml = (() => {
        void store.save();
        return http.expectOne('/api/projects/demo/config');
      })();
      const doc = load(yaml.request.body.yaml) as Record<string, unknown>;
      expect((doc['scenes'] as unknown[]).length).toBe(1);
      expect('tracks' in doc).toBe(false);
      yaml.flush({ saved: true });
    });

    it('discarding the changes undoes the switch', async () => {
      await pickMode('music');
      el().querySelector<HTMLButtonElement>('[data-testid="editor-discard"]')!.click();
      await settle();
      http.expectOne('/api/projects/demo/config').flush({ yaml: '', parsed: structuredClone(CONFIG), valid: true });
      await settle();
      expect(el().querySelector('[data-testid="to-music-notice"]')).toBeNull();
      expect(store.config()?.output.mode).toBe('video');
    });
  });
});
