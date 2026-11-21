import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { load } from 'js-yaml';

import { ProjectConfig } from '../../core/api.models';
import { EditorStore } from '../editor.store';
import { toYaml } from '../../shared/project-yaml';
import { SceneFormComponent } from './scene-form.component';
import { SCENE_FORM_TEST_PROVIDERS } from './dynamic/testing/scene-form-providers';

const CONFIG: ProjectConfig = {
  project: 'demo',
  output: { mode: 'video', file: 'out/demo.mp4', contact_sheet: false },
  defaults: { model: '', voice: '', resolution: '1280x720', sampler: 'euler', steps: 30, fps: 30, subject_prompt: '', negative_prompt: '', lora_model_dir: '' },
  scenes: [
    { id: 'a', prompt: 'x', negative_prompt: '', tts_text: 'hola', speed: 1, lora: '' },
    { id: 'b', prompt: 'y', negative_prompt: '', tts_text: 'adios', speed: 1, lora: '' },
  ],
};

describe('crossfade between scenes in the editor', () => {
  async function open() {
    TestBed.configureTestingModule({ imports: [SceneFormComponent], providers: [EditorStore, provideHttpClient(), provideHttpClientTesting(), ...SCENE_FORM_TEST_PROVIDERS] });
    const store = TestBed.inject(EditorStore);
    const http = TestBed.inject(HttpTestingController);
    const loading = store.load('demo');
    http.expectOne('/api/projects/demo/config').flush({ yaml: '', parsed: structuredClone(CONFIG), valid: true });
    await loading;
    const fixture = TestBed.createComponent(SceneFormComponent);
    fixture.detectChanges();
    return { store, fixture };
  }
  const yaml = (store: EditorStore) => load(toYaml(store.config()!)) as { defaults: Record<string, unknown>; scenes: Record<string, unknown>[] };

  it('a scene sets its own fade, 0 is kept as a cut and empty goes back to the project\'s', async () => {
    const { store, fixture } = await open();
    const input = fixture.nativeElement.querySelector('[data-testid=scene-transition-input]') as HTMLInputElement;
    const type = async (value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    await type('0');
    expect(yaml(store).scenes[0]['transition_seconds']).toBe(0);
    await type('1.2');
    expect(yaml(store).scenes[0]['transition_seconds']).toBe(1.2);
    await type('');
    expect(yaml(store).scenes[0]).not.toHaveProperty('transition_seconds');
  });

  it('the project fade is written and an out of range one blocks saving', async () => {
    const { store, fixture } = await open();
    store.updateDefaults({ transition_seconds: 0.4 });
    expect(yaml(store).defaults['transition_seconds']).toBe(0.4);
    expect(store.validation()!.valid).toBe(true);
    store.updateDefaults({ transition_seconds: 3 });
    expect(store.validation()!.valid).toBe(false);
    expect(store.validation()!.defaults.transition).toContain('0 a 2');
    store.updateScene(0, { transition_seconds: 5 });
    await fixture.whenStable();
    fixture.detectChanges();
    for (let i = 0; i < 3; i++) {
      fixture.detectChanges(); // the error state of a field is known after a pass, and shown on the next
      await fixture.whenStable();
    }
    expect(fixture.nativeElement.textContent).toContain('El fundido va de 0 a 2 segundos');
  });

  it('images projects do not write fades', async () => {
    const { store } = await open();
    store.updateDefaults({ transition_seconds: 0.4 });
    store.updateScene(0, { transition_seconds: 1 });
    store.config.update((c) => ({ ...c!, output: { ...c!.output, mode: 'images' } }));
    const doc = yaml(store);
    expect(doc.defaults).not.toHaveProperty('transition_seconds');
    expect(doc.scenes[0]).not.toHaveProperty('transition_seconds');
  });
});
