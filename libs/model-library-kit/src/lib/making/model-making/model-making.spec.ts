import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideLabForms } from '@lab/forms-kit';
import { map, of } from 'rxjs';

import { MODEL_LIBRARY_OPTIONS } from '../../core/options';
import { GENERATION_RELABEL, type GenerationRelabel } from '../generation-relabel';
import { InMemoryModelLibrary, type ServiceKind } from '../../memory.adapter';
import { MODEL_LIBRARY_PORT } from '../../port';
import { ModelViewer } from '../../viewer/open-viewer';
import { ModelMaking } from './model-making';

describe('ModelMaking', () => {
  let fixture: ComponentFixture<ModelMaking>;
  let library: InMemoryModelLibrary;
  let made: number;
  let shown: string[];
  const root = () => fixture.nativeElement as HTMLElement;
  const q = (id: string) => (root().querySelector(`[data-testid="${id}"]`) ?? document.querySelector(`[data-testid="${id}"]`)) as HTMLElement | null;
  const button = (id: string) => q(id) as HTMLButtonElement;
  const inRowOf = (engine: string, backend: string, id: string) => root().querySelector(`[data-testid="engine-${engine}"] [data-testid="backend-${backend}"] [data-testid="${id}"]`) as HTMLButtonElement | null;
  const inEngine = (engine: string, id: string) => root().querySelector(`[data-testid="engine-${engine}"] [data-testid="${id}"]`) as HTMLButtonElement | null;

  async function settle(ms = 0): Promise<void> {
    await new Promise((done) => setTimeout(done, ms));
    TestBed.tick();
    fixture.detectChanges();
    await new Promise((done) => setTimeout(done, 0));
  }

  async function open(service: ServiceKind = 'default', lang: 'es' | 'en' = 'en', extra: { docker?: boolean; external?: boolean; relabel?: GenerationRelabel } = {}): Promise<void> {
    TestBed.resetTestingModule();
    const { relabel, ...options } = extra;
    library = new InMemoryModelLibrary({ service, ...options });
    TestBed.configureTestingModule({
      providers: [
        provideLabForms({ lang }),
        { provide: MODEL_LIBRARY_OPTIONS, useValue: { lang, pollMs: 3 } },
        { provide: MODEL_LIBRARY_PORT, useValue: library },
        ...(relabel ? [{ provide: GENERATION_RELABEL, useValue: relabel }] : []),
      ],
    });
    fixture = TestBed.createComponent(ModelMaking);
    made = 0;
    shown = [];
    fixture.componentInstance.made.subscribe(() => made++);
    fixture.componentInstance.showModel.subscribe((id) => shown.push(id));
    fixture.detectChanges();
    await settle(5);
  }

  async function type(id: string, value: string): Promise<void> {
    const host = q(id) as HTMLElement;
    const el = (host.matches('input,textarea') ? host : host.querySelector('input,textarea')) as HTMLInputElement;
    el.value = value;
    el.dispatchEvent(new Event('input'));
    el.dispatchEvent(new Event('blur'));
    await settle();
  }

  afterEach(() => TestBed.inject(MatDialog).closeAll());

  it('shows nothing, and no error, on a server with no 3D service', async () => {
    await open('none');
    expect(q('model-making')).toBeNull();
    expect(q('making-error')).toBeNull();
    expect(root().textContent?.trim()).toBe('');
  });

  it('shows the engines with the reason in words: the service stopped for triposr and no key for sf3d', async () => {
    await open();
    expect(q('model-making')).not.toBeNull();
    expect(root().querySelector('[data-testid="engine-triposr"] [data-testid="engine-reason"]')?.textContent).toContain('service is stopped');
    expect(root().querySelector('[data-testid="engine-sf3d"] [data-testid="engine-reason"]')?.textContent).toContain('Hugging Face key');
    expect(inEngine('triposr', 'engine-start')).not.toBeNull();
    expect(inEngine('sf3d', 'engine-start')).toBeNull();
    expect(inRowOf('sf3d', 'docker', 'backend-install')).toBeNull();
    expect(inEngine('triposr', 'engine-install')).toBeNull();
  });

  it('puts the same words in Spanish', async () => {
    await open('default', 'es');
    expect(q('making-open')?.textContent).toContain('Hacer un modelo');
    expect(root().querySelector('[data-testid="engine-triposr"] [data-testid="engine-reason"]')?.textContent).toContain('servicio del motor está parado');
  });

  it('starts the container, shows it starting, and ends with the engine ready and a stop button', async () => {
    await open();
    inEngine('triposr', 'engine-start')?.click();
    await settle();
    expect(root().querySelector('[data-testid="engine-triposr"] [data-testid="engine-container"]')?.textContent).toContain('starting');
    for (let i = 0; i < 40 && !q('engine-ready'); i++) await settle(5);
    expect(q('engine-ready')).not.toBeNull();
    expect(inEngine('triposr', 'engine-stop')).not.toBeNull();
    expect(inEngine('triposr', 'engine-start')).toBeNull();
  });

  it('shows the plan before any download, with its licence and size, and downloads only when confirmed', async () => {
    await open('bare');
    inRowOf('triposr', 'dotnet', 'backend-install')?.click();
    await settle(5);
    expect(q('install-plan')?.textContent).toContain('MIT');
    expect(q('plan-size')?.textContent).toContain('About');
    expect(q('plan-gated')).toBeNull();
    expect(library.calls.filter((c) => c.startsWith('install'))).toEqual([]);
    button('plan-confirm').click();
    await settle(5);
    expect(library.calls).toContain('install triposr dotnet weights');
    for (let i = 0; i < 40 && TestBed.inject(MatDialog).openDialogs.length; i++) await settle(5);
    expect(TestBed.inject(MatDialog).openDialogs.length).toBe(0);
    for (let i = 0; i < 40 && !root().querySelector('[data-testid="engine-job"][data-state="done"]'); i++) await settle(5);
    expect(root().querySelector('[data-testid="engine-job"][data-state="done"]')).not.toBeNull();
    expect(q('engine-log')?.textContent).toContain('weights: done');
  });

  describe('backends', () => {
    const rowOf = (engine: string, backend: string) => root().querySelector(`[data-testid="engine-${engine}"] [data-testid="backend-${backend}"]`) as HTMLElement | null;
    const inRow = (engine: string, backend: string, id: string) => rowOf(engine, backend)?.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement | null;

    it('lists both ways each engine can run: the one in use (the same for both), what each lacks in words, and no install for sf3d while its key is missing', async () => {
      await open('noservice');
      expect(rowOf('triposr', 'dotnet')?.dataset['inUse']).toBe('true');
      expect(rowOf('triposr', 'dotnet')?.textContent).toContain('Default');
      expect(rowOf('triposr', 'dotnet')?.querySelector('[data-testid="backend-state"]')?.textContent).toContain('Missing: the service, the weights');
      expect(rowOf('triposr', 'docker')?.dataset['inUse']).toBe('false');
      expect(rowOf('triposr', 'docker')?.querySelector('[data-testid="backend-state"]')?.textContent).toContain('the weights');
      expect(rowOf('sf3d', 'dotnet')?.dataset['inUse']).toBe('true');
      expect(rowOf('sf3d', 'docker')?.dataset['inUse']).toBe('false');
      expect(inRow('sf3d', 'docker', 'backend-use')).not.toBeNull();
      expect(inRow('sf3d', 'dotnet', 'backend-install')).toBeNull();
    });

    it('says the same in Spanish', async () => {
      await open('noservice', 'es');
      expect(rowOf('triposr', 'dotnet')?.textContent).toContain('Servicio .NET');
      expect(rowOf('triposr', 'dotnet')?.querySelector('[data-testid="backend-state"]')?.textContent).toContain('Falta: el servicio, los pesos');
      expect(rowOf('triposr', 'docker')?.textContent).toContain('Contenedor Docker');
    });

    it('switches to docker and back to the default, and shows which is in use', async () => {
      await open('noservice');
      inRow('triposr', 'docker', 'backend-use')?.click();
      await settle(5);
      expect(library.calls).toContain('backend docker');
      expect(rowOf('triposr', 'docker')?.dataset['inUse']).toBe('true');
      expect(rowOf('triposr', 'docker')?.textContent).toContain('Chosen by you');
      expect(q('engine-triposr')?.querySelector('[data-testid="engine-reason"]')?.textContent).toContain('weights');
      button('backend-default').click();
      await settle(5);
      expect(rowOf('triposr', 'dotnet')?.dataset['inUse']).toBe('true');
      expect(q('backend-default')).toBeNull();
    });

    it('shows the refusal in words when docker does not answer, and nothing changes', async () => {
      await open('default', 'en', { docker: false });
      inRow('triposr', 'docker', 'backend-use')?.click();
      await settle(5);
      expect(q('backend-problem')?.textContent).toContain('Docker does not answer');
      expect(rowOf('triposr', 'dotnet')?.dataset['inUse']).toBe('true');
    });

    it('offers neither the choice nor the install for an external service, and says it is managed elsewhere', async () => {
      await open('default', 'en', { external: true });
      expect(q('engine-backends')).toBeNull();
      expect(q('backend-use')).toBeNull();
      expect(q('engine-external')).not.toBeNull();
    });

    it('shows an engine as before when the server sends no backends: no rows, and the one install button', async () => {
      TestBed.resetTestingModule();
      library = new InMemoryModelLibrary({ service: 'bare' });
      const old = Object.assign(Object.create(library), { engines: () => library.engines().pipe(map((e) => Object.fromEntries(Object.entries(e ?? {}).map(([k, v]) => [k, { ...v, backends: undefined }])))), modelBackend: () => of(null) });
      TestBed.configureTestingModule({ providers: [provideLabForms({ lang: 'en' }), { provide: MODEL_LIBRARY_OPTIONS, useValue: { lang: 'en', pollMs: 3 } }, { provide: MODEL_LIBRARY_PORT, useValue: old }] });
      fixture = TestBed.createComponent(ModelMaking);
      fixture.detectChanges();
      await settle(5);
      expect(q('engine-backends')).toBeNull();
      expect(inEngine('triposr', 'engine-install')).not.toBeNull();
    });

    it('plans the install of the container before it is chosen: the plan is the docker one and nothing is chosen', async () => {
      await open('noservice');
      inRow('triposr', 'docker', 'backend-install')?.click();
      await settle(5);
      expect(q('plan-backend')?.textContent).toContain('Docker container');
      expect(q('plan-part-weights')).not.toBeNull();
      expect(q('plan-part-service')).toBeNull();
      button('plan-confirm').click();
      await settle(5);
      expect(library.calls).toContain('install triposr docker weights');
      expect(rowOf('triposr', 'dotnet')?.dataset['inUse']).toBe('true');
    });

    it('lets a part be unticked: the plan is asked again and only the rest is sent; with none ticked it cannot be confirmed', async () => {
      await open('noservice');
      inRowOf('triposr', 'dotnet', 'backend-install')?.click();
      await settle(5);
      expect(q('plan-part-service')).not.toBeNull();
      expect(q('plan-part-weights')).not.toBeNull();
      (q('plan-part-weights')?.querySelector('input') as HTMLInputElement).click();
      await settle(5);
      expect(q('plan-files-missing')).toBeNull();
      (q('plan-part-service')?.querySelector('input') as HTMLInputElement).click();
      await settle(5);
      expect(q('plan-no-parts')).not.toBeNull();
      expect(button('plan-confirm').disabled).toBe(true);
      (q('plan-part-service')?.querySelector('input') as HTMLInputElement).click();
      await settle(5);
      button('plan-confirm').click();
      await settle(5);
      expect(library.calls).toContain('install triposr dotnet service');
    });

    it('names the part that runs while the job goes', async () => {
      await open('noservice');
      inRowOf('triposr', 'dotnet', 'backend-install')?.click();
      await settle(5);
      button('plan-confirm').click();
      await settle(1);
      expect(q('engine-job-part')?.textContent).toContain('The .NET service');
      for (let i = 0; i < 40 && !root().querySelector('[data-testid="engine-job"][data-state="done"]'); i++) await settle(5);
      expect(q('engine-log')?.textContent).toContain('service: done');
    });
  });

  it('can leave the plan without downloading anything', async () => {
    await open('bare');
    inRowOf('triposr', 'dotnet', 'backend-install')?.click();
    await settle(5);
    button('plan-cancel').click();
    await settle(5);
    expect(library.calls.filter((c) => c.startsWith('install'))).toEqual([]);
  });

  it('opens the form: nothing is sent while no engine can be used, and the form says why', async () => {
    await open();
    button('making-open').click();
    await settle(5);
    expect(q('generate-none-usable')?.textContent).toContain('No engine can be used');
    expect(button('generate-send').disabled).toBe(true);
  });

  it('makes a model from a text: it appears in the list, follows its steps, ends done and tells the host', async () => {
    await open('running');
    button('making-open').click();
    await settle(5);
    await type('generate-prompt', 'a retro roller skate, glossy pink');
    expect(button('generate-send').disabled).toBe(false);
    button('generate-send').click();
    for (let i = 0; i < 40 && TestBed.inject(MatDialog).openDialogs.length; i++) await settle(5);
    expect(TestBed.inject(MatDialog).openDialogs.length).toBe(0);
    for (let i = 0; i < 60 && !root().querySelector('[data-testid^="generation-"][data-state="done"]'); i++) await settle(5);
    const row = root().querySelector('[data-testid^="generation-"][data-state="done"]') as HTMLElement;
    expect(row.textContent).toContain('a retro roller skate');
    expect(made).toBe(1);
    (row.querySelector('[data-testid="generation-show"]') as HTMLButtonElement).click();
    expect(shown).toEqual(['generated/a-retro-roller-skate-glossy-pink']);
    const opened = vi.spyOn(ModelViewer.prototype, 'open').mockReturnValue(undefined as never);
    (row.querySelector('[data-testid="generation-view"]') as HTMLButtonElement).click();
    expect(opened).toHaveBeenCalledWith({ pack: 'generated', name: 'a-retro-roller-skate-glossy-pink' });
    opened.mockRestore();
  });

  it('will not send a text and a picture together, nor neither', async () => {
    await open('running');
    button('making-open').click();
    await settle(5);
    expect(button('generate-send').disabled).toBe(true);
    (q('generate-source-picture') as HTMLElement).querySelector('button')?.click();
    await settle(5);
    expect(q('generate-prompt')).toBeNull();
    expect(q('generate-no-picture')?.textContent).toContain('Choose the picture');
    expect(button('generate-send').disabled).toBe(true);
  });

  it('refuses a picture over 20 MB before sending it', async () => {
    await open('running');
    button('making-open').click();
    await settle(5);
    (q('generate-source-picture') as HTMLElement).querySelector('button')?.click();
    await settle(5);
    const input = q('generate-picture') as HTMLInputElement;
    const huge = new File(['x'], 'big.png');
    Object.defineProperty(huge, 'size', { value: 21 * 1024 * 1024 });
    Object.defineProperty(input, 'files', { value: { item: () => huge, length: 1 }, configurable: true });
    input.dispatchEvent(new Event('change'));
    await settle(5);
    expect(q('generate-too-big')?.textContent).toContain('20 MB');
    expect(button('generate-send').disabled).toBe(true);
  });

  it('cancels a generation that is running and takes a finished one off the list', async () => {
    await open('running');
    await library.generate({ prompt: 'one' }).toPromise();
    await library.generate({ prompt: 'two' }).toPromise();
    await fixture.componentRef.injector.get(MatDialog).closeAll();
    fixture.destroy();
    fixture = TestBed.createComponent(ModelMaking);
    fixture.detectChanges();
    await settle(5);
    const live = root().querySelector('[data-testid="generation-cancel"]') as HTMLButtonElement;
    expect(live).not.toBeNull();
    live.click();
    await settle(5);
    expect(root().querySelector('[data-state="cancelled"]')).not.toBeNull();
    (root().querySelector('[data-testid="generation-remove"]') as HTMLButtonElement).click();
    await settle();
    expect(root().querySelector('[data-testid="generation-remove-yes"]')?.textContent).toContain('Remove from the list');
    expect(root().textContent).toContain('The model stays in the library');
  });
  describe('client labels', () => {
    async function withGeneration(relabel?: GenerationRelabel, lang: 'es' | 'en' = 'en'): Promise<void> {
      await open('running', lang, { relabel });
      await library.generate({ prompt: 'a chair' }).toPromise();
      await fixture.componentRef.injector.get(MatDialog).closeAll();
      fixture.destroy();
      fixture = TestBed.createComponent(ModelMaking);
      fixture.detectChanges();
      await settle(5);
      // wait for the generation to finish: a running one cannot be relabelled
      for (let i = 0; i < 80 && !root().querySelector('[data-testid="model-generations"] [data-state="done"]'); i++) await settle(5);
    }

    it('shows no label and no action when the host keeps none', async () => {
      await withGeneration();
      expect(root().querySelector('[data-testid="model-generations"] [data-state]')).not.toBeNull();
      expect(q('generation-client')).toBeNull();
      expect(q('generation-relabel')).toBeNull();
    });

    it('shows the label of each generation with the colour of the host, and an action to change it once it is not running', async () => {
      const host: GenerationRelabel = { relabel: vi.fn(() => Promise.resolve(false)), colorOf: (c) => (c === 'unknown' ? '#d9822b' : '#336699') };
      await withGeneration(host);
      const label = q('generation-client') as HTMLElement;
      expect(label.textContent?.trim()).toBe('unknown');
      expect(label.style.getPropertyValue('--chip-color')).toBe('#d9822b');
      expect(q('generation-relabel')?.textContent).toContain('Label');
    });

    it('asks the host to change the label and reads the generation again only when it changed', async () => {
      const relabel = vi.fn(() => Promise.resolve(false));
      await withGeneration({ relabel, colorOf: () => '#336699' });
      const read = vi.spyOn(library, 'generation');
      button('generation-relabel').click();
      await settle(5);
      expect(relabel).toHaveBeenCalledWith(expect.objectContaining({ client: 'unknown' }));
      expect(read).not.toHaveBeenCalled();
      relabel.mockResolvedValueOnce(true);
      button('generation-relabel').click();
      await settle(5);
      expect(read).toHaveBeenCalledTimes(1);
    });

    it('puts the action in Spanish', async () => {
      await withGeneration({ relabel: () => Promise.resolve(false), colorOf: () => '#336699' }, 'es');
      expect(q('generation-relabel')?.textContent).toContain('Etiqueta');
    });
  });
});
