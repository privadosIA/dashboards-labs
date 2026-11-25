import { TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { provideLabForms } from '@lab/forms-kit';

import { MODEL_LIBRARY_OPTIONS } from '../../core/options';
import { InMemoryModelLibrary } from '../../memory.adapter';
import { type Generation, MODEL_LIBRARY_PORT } from '../../port';
import { MakingStore } from '../making.store';
import { GenerateModel } from './generate-model';

describe('GenerateModel', () => {
  let store: MakingStore;
  let dialog: MatDialog;
  let ref: MatDialogRef<GenerateModel, Generation | undefined>;
  let result: Promise<Generation | undefined>;
  const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const form = () => ref.componentInstance as unknown as { model: { set(v: Record<string, unknown>): void; (): Record<string, unknown> }; source: { set(v: string): void } };

  async function settle(ms = 0): Promise<void> {
    await new Promise((done) => setTimeout(done, ms));
    TestBed.tick();
    await new Promise((done) => setTimeout(done, 0));
  }

  async function open(service: 'default' | 'running', lang: 'es' | 'en' = 'en'): Promise<void> {
    TestBed.configureTestingModule({
      providers: [provideLabForms({ lang }), { provide: MODEL_LIBRARY_OPTIONS, useValue: { lang, pollMs: 3 } }, { provide: MODEL_LIBRARY_PORT, useValue: new InMemoryModelLibrary({ service }) }, MakingStore],
    });
    store = TestBed.inject(MakingStore);
    await store.load();
    dialog = TestBed.inject(MatDialog);
    ref = dialog.open(GenerateModel, { data: store });
    result = new Promise((ok) => ref.afterClosed().subscribe(ok));
    await settle(5);
  }

  afterEach(() => dialog.closeAll());

  it('will not send the choice of an engine that cannot be used: it says why, in words', async () => {
    await open('running');
    form().model.set({ prompt: 'a cup', engine: 'sf3d', detail: 'normal', name: '', adult: false });
    await settle(5);
    expect(q('generate-engine-blocked')?.textContent).toContain('Hugging Face key');
    expect((q('generate-send') as HTMLButtonElement).disabled).toBe(true);
    form().model.set({ prompt: 'a cup', engine: 'triposr', detail: 'normal', name: '', adult: false });
    await settle(5);
    expect(q('generate-engine-blocked')).toBeNull();
  });

  it('sends the text with the engine, the detail and the name, and closes with the generation', async () => {
    await open('running');
    form().model.set({ prompt: '  a golden trophy  ', engine: 'triposr', detail: 'high', name: 'copa', adult: false });
    await settle(5);
    (q('generate-send') as HTMLButtonElement).click();
    const made = await result;
    expect(made?.name).toBe('copa');
    expect(made?.prompt).toBe('a golden trophy');
    expect(made?.detail).toBe('high');
  });

  it('keeps what was typed and shows the server’s words when it refuses (an adult model on a server that does not keep them)', async () => {
    await open('running');
    form().model.set({ prompt: 'a cup', engine: 'triposr', detail: 'normal', name: '', adult: true });
    await settle(5);
    (q('generate-send') as HTMLButtonElement).click();
    await settle(10);
    expect(q('generate-problem')?.textContent).toContain('adult content is not kept');
    expect(form().model()['prompt']).toBe('a cup');
    expect(q('generate-send')).not.toBeNull();
  });

  it('refuses a name that is not plain', async () => {
    await open('running');
    const host = q('generate-name') as HTMLElement;
    const el = (host.matches('input') ? host : host.querySelector('input')) as HTMLInputElement;
    el.value = 'Not Plain';
    el.dispatchEvent(new Event('input'));
    el.dispatchEvent(new Event('blur'));
    await settle(5);
    expect(document.body.textContent).toContain('Lower case letters, digits, dots');
  });

  it('is in Spanish too', async () => {
    await open('running', 'es');
    expect(document.body.textContent).toContain('Hacer un modelo 3D');
    expect(document.body.textContent).toContain('Qué objeto es');
  });
});
