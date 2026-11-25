import { ComponentFixture, TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';

import { MODEL_LIBRARY_OPTIONS } from '../../core/options';
import { InMemoryModelLibrary } from '../../memory.adapter';
import { LibraryFailed, type LibraryModel, MODEL_LIBRARY_PORT, type ModelLibraryPort } from '../../port';
import { ModelViewer } from '../../viewer/open-viewer';
import { CatalogStore } from '../catalog.store';
import { ModelCatalog } from './model-catalog';

const installAll = async (library: InMemoryModelLibrary, ...ids: string[]): Promise<void> => {
  for (const id of ids) {
    await new Promise<void>((ok) => library.install(id).subscribe(() => ok()));
    for (let i = 0; i < 6; i++) await new Promise<void>((ok) => library.pack(id).subscribe(() => ok()));
  }
};

describe('ModelCatalog', () => {
  let fixture: ComponentFixture<ModelCatalog>;
  let library: InMemoryModelLibrary;
  const root = () => fixture.nativeElement as HTMLElement;
  const q = (id: string) => root().querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const names = () => [...root().querySelectorAll('lab-model-card .name')].map((e) => e.textContent?.trim());

  async function settle(ms = 0): Promise<void> {
    await fixture.whenStable();
    await new Promise((done) => setTimeout(done, ms));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function open(port: ModelLibraryPort = library, inputs: Record<string, unknown> = {}, lang: 'es' | 'en' = 'en', pageSize = 12): Promise<void> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: MODEL_LIBRARY_OPTIONS, useValue: { lang, pageSize } }, { provide: MODEL_LIBRARY_PORT, useValue: port }] });
    fixture = TestBed.createComponent(ModelCatalog);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
    await settle();
    await settle();
  }

  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:thumb'), revokeObjectURL: vi.fn() }));
    library = new InMemoryModelLibrary();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('says no pack is installed, pointing to the packs', async () => {
    await open();
    expect(q('catalog-no-packs')?.textContent).toContain('install one');
  });

  it('opens the viewer on a model from its card, and the button names the model for a screen reader', async () => {
    await installAll(library, 'kenney-food-kit');
    await open();
    const opened = vi.spyOn(ModelViewer.prototype, 'open').mockReturnValue(undefined as never);
    const button = q('model-view-kenney-food-kit/pizza') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('View pizza in 3D');
    button.click();
    expect(opened).toHaveBeenCalledWith(expect.objectContaining({ pack: 'kenney-food-kit', name: 'pizza', model: expect.objectContaining({ id: 'kenney-food-kit/pizza' }) }));
    opened.mockRestore();
  });

  it('lists the models of the installed packs with their picture, clips, triangles, licence and author', async () => {
    await installAll(library, 'kenney-mini-characters', 'kenney-food-kit');
    await open();
    expect(names().length).toBe(6);
    const first = q('model-kenney-mini-characters/character-female-a') as HTMLElement;
    expect(first.querySelector('img')?.getAttribute('src')).toBe('blob:thumb');
    expect(first.textContent).toContain('4 animations');
    expect(first.textContent).toContain('940 triangles');
    expect(first.textContent).toContain('Licence: CC0');
    expect(first.textContent).toContain('by Kenney');
    expect(first.querySelector('[data-testid="model-attribution"]')).toBeNull();
  });

  it('marks a model whose licence asks for the author to be named', async () => {
    await new Promise<void>((ok) => library.importPack({ id: 'mine', licence: 'CC-BY 4.0', author: 'Someone', file: new Blob(['PK']) }).subscribe(() => ok()));
    await open();
    const card = q('model-mine/hero') as HTMLElement;
    expect(card.querySelector('[data-testid="model-attribution"]')?.textContent).toContain('named');
    expect(card.textContent).toContain('Licence: CC-BY 4.0');
  });

  it('filters by pack, by animations and by what is typed', async () => {
    await installAll(library, 'kenney-mini-characters', 'kenney-food-kit');
    await open();
    const pack = q('catalog-pack') as HTMLSelectElement;
    pack.value = 'kenney-food-kit';
    pack.dispatchEvent(new Event('change'));
    await settle();
    expect(names()).toEqual(['pizza', 'burger', 'cheese']);
    pack.value = '';
    pack.dispatchEvent(new Event('change'));
    (q('catalog-clips')?.querySelector('input') as HTMLInputElement).click();
    await settle();
    expect(names().length).toBe(3);
    const search = q('catalog-search') as HTMLInputElement;
    search.value = 'robot';
    search.dispatchEvent(new Event('input'));
    await settle(300);
    expect(names()).toEqual(['character-robot']);
  });

  it('pages with the shared paginator, keeping the total, and offers the page sizes every list offers', async () => {
    await installAll(library, 'kenney-mini-characters', 'kenney-food-kit', 'kenney-furniture-kit');
    await open(library, {}, 'en', 3);
    const range = () => root().querySelector('.mat-mdc-paginator-range-label')?.textContent?.trim();
    const click = (selector: string) => (root().querySelector(selector) as HTMLButtonElement).click();
    expect(range()).toBe('1 – 3 of 8');
    expect(names().length).toBe(3);
    click('.mat-mdc-paginator-navigation-next');
    await settle();
    expect(range()).toBe('4 – 6 of 8');
    click('.mat-mdc-paginator-navigation-previous');
    await settle();
    expect(range()).toBe('1 – 3 of 8');
    expect(root().querySelector('.mat-mdc-paginator-navigation-previous')?.getAttribute('aria-disabled')).toBe('true');
  });

  it('has the page sizes 10, 20, 50 and 100 like the other lists, and remembers the one chosen', async () => {
    await installAll(library, 'kenney-mini-characters', 'kenney-food-kit', 'kenney-furniture-kit');
    await open(library, {}, 'en', 10);
    // 8 models fit in the smallest page: no paginator is needed
    expect(root().querySelector('mat-paginator')).toBeNull();
    const store = fixture.debugElement.injector.get(CatalogStore);
    expect(store.sizeOptions).toEqual([10, 20, 50, 100]);
    await store.go({ pageIndex: 0, pageSize: 20 });
    expect(store.size()).toBe(20);
    expect(store.query().limit).toBe(20);
    expect(JSON.parse(sessionStorage.getItem('mo-paged-list-sizes') ?? '{}')['models3d-catalog']).toBe(20);
  });

  it('shows a placeholder when the server cannot draw a picture, and keeps the rest of the card', async () => {
    await installAll(library, 'kenney-food-kit');
    const noPicture = Object.create(library, { thumbnail: { value: () => throwError(() => new LibraryFailed(503, 'no Blender')) } }) as ModelLibraryPort;
    await open(noPicture);
    await settle();
    const card = q('model-kenney-food-kit/pizza') as HTMLElement;
    expect(card.querySelector('[data-testid="model-no-preview"]')).not.toBeNull();
    expect(card.textContent).toContain('pizza');
    expect(card.textContent).toContain('Licence: CC0');
  });

  it('offers to pick a model only when it is asked to, and says which one', async () => {
    await installAll(library, 'kenney-food-kit');
    await open();
    expect(q('model-use')).toBeNull();
    await open(library, { pickable: true });
    const picked: LibraryModel[] = [];
    fixture.componentInstance.picked.subscribe((m) => picked.push(m));
    (q('model-use') as HTMLButtonElement).click();
    expect(picked.map((m) => m.id)).toEqual(['kenney-food-kit/pizza']);
  });

  it('reads the catalog again when the packs change (refresh)', async () => {
    await open();
    expect(q('catalog-no-packs')).not.toBeNull();
    await installAll(library, 'kenney-furniture-kit');
    fixture.componentRef.setInput('refresh', 1);
    await settle();
    await settle();
    expect(names()).toEqual(['table', 'chair']);
  });

  const makeModels = async (...prompts: string[]): Promise<void> => {
    const made = new InMemoryModelLibrary({ service: 'running' });
    library = made;
    for (const prompt of prompts) await new Promise<void>((ok) => made.generate({ prompt }).subscribe(() => ok()));
    for (let i = 0; i < 6; i++) await new Promise<void>((ok) => made.generations().subscribe(() => ok()));
  };
  const select = (id: string, value: string): void => {
    const el = q(id) as HTMLSelectElement;
    el.value = value;
    el.dispatchEvent(new Event('change'));
  };

  it('shows where a generated model comes from: its text, its engine and version, its licence, and the pack generated in the filter', async () => {
    await makeModels('a retro roller skate, glossy pink');
    await open();
    const card = q('model-generated/a-retro-roller-skate-glossy-pink') as HTMLElement;
    expect(card.querySelector('[data-testid="model-prompt"]')?.textContent).toContain('a retro roller skate, glossy pink');
    expect(card.querySelector('[data-testid="model-engine"]')?.textContent).toContain('Made with triposr (triposr@3f1c9a2)');
    expect(card.querySelector('[data-testid="model-licence"]')?.textContent).toContain('Licence: MIT');
    expect(card.querySelector('[data-testid="model-attribution"]')).toBeNull();
    expect([...(q('catalog-pack') as HTMLSelectElement).options].map((o) => o.value)).toContain('generated');
  });

  it('filters by source and then by engine, which is offered only for the generated ones', async () => {
    await installAll(library, 'kenney-food-kit');
    await makeModels('first', 'second');
    await installAll(library, 'kenney-food-kit');
    await open();
    expect(q('catalog-engine')).toBeNull();
    select('catalog-source', 'generated');
    await settle(5);
    expect(names().sort()).toEqual(['first', 'second']);
    expect(q('catalog-engine')).not.toBeNull();
    select('catalog-engine', 'sf3d');
    await settle(5);
    expect(names()).toEqual([]);
    select('catalog-engine', '');
    select('catalog-source', 'catalog');
    await settle(5);
    expect(q('catalog-engine')).toBeNull();
    expect(names().length).toBe(3);
  });

  it('finds a generated model by the words of its text', async () => {
    await makeModels('a golden trophy cup', 'a wooden chair');
    await open();
    const input = q('catalog-search') as HTMLInputElement;
    input.value = 'trophy';
    input.dispatchEvent(new Event('input'));
    await settle(300);
    expect(names()).toEqual(['a-golden-trophy-cup']);
  });

  it('goes to a model when the host says which one (find): the generated models with that name', async () => {
    await makeModels('a golden trophy cup', 'a wooden chair');
    await open(library, { find: 'generated/a-wooden-chair' });
    await settle(5);
    expect(names()).toEqual(['a-wooden-chair']);
    expect((q('catalog-source') as HTMLSelectElement).value).toBe('generated');
  });

  it('speaks Spanish', async () => {
    await installAll(library, 'kenney-mini-characters');
    await open(library, {}, 'es');
    expect((q('model-kenney-mini-characters/character-robot') as HTMLElement).textContent).toContain('4 animaciones');
    expect(root().textContent).toContain('Solo con animaciones');
  });
});
