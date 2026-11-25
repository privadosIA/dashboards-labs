import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';

import { MODEL_LIBRARY_OPTIONS } from '../core/options';
import { InMemoryModelLibrary, InMemoryModelPlace } from '../memory.adapter';
import { MODEL_LIBRARY_PORT, MODEL_PLACE_PORT, type ModelCopy } from '../port';
import { ModelPicker } from './model-picker';

describe('ModelPicker', () => {
  let library: InMemoryModelLibrary;
  let place: InMemoryModelPlace;
  const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  async function settle(ms = 0): Promise<void> {
    await new Promise((done) => setTimeout(done, ms));
    TestBed.tick();
    await new Promise((done) => setTimeout(done, 0));
  }

  beforeEach(async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:thumb'), revokeObjectURL: vi.fn() }));
    library = new InMemoryModelLibrary();
    for (const id of ['kenney-mini-characters', 'kenney-food-kit']) {
      await new Promise<void>((ok) => library.install(id).subscribe(() => ok()));
      for (let i = 0; i < 6; i++) await new Promise<void>((ok) => library.pack(id).subscribe(() => ok()));
    }
    place = new InMemoryModelPlace(library);
    TestBed.configureTestingModule({
      providers: [{ provide: MODEL_LIBRARY_OPTIONS, useValue: { lang: 'en' } }, { provide: MODEL_LIBRARY_PORT, useValue: library }, { provide: MODEL_PLACE_PORT, useValue: place }],
    });
  });
  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    vi.unstubAllGlobals();
  });

  it('copies the picked model into the place with its pictures and says so, staying open for more', async () => {
    const answer = TestBed.inject(ModelPicker).open('the project');
    await settle(5);
    expect(document.body.textContent).toContain('Add a model to the project');
    (q('model-kenney-mini-characters/character-robot')?.querySelector('[data-testid="model-use"]') as HTMLButtonElement).click();
    await settle(5);
    expect(q('picker-said')?.textContent).toContain('“character-robot.glb” added with 1 picture');
    expect(q('picker-close')).not.toBeNull();
    (q('picker-close') as HTMLButtonElement).click();
    const added: ModelCopy[] = await answer;
    expect(added.map((c) => c.name)).toEqual(['character-robot.glb']);
    const files = await new Promise<{ name: string }[]>((ok) => place.list().subscribe(ok));
    expect(files.map((f) => f.name)).toEqual(['character-robot.glb', 'kenney-mini-characters--colormap.png']);
  });

  it('says a model was already there (200) and asks for another name when the name is taken (409)', async () => {
    const answer = TestBed.inject(ModelPicker).open('the piece');
    await settle(5);
    const use = (id: string) => (q(id)?.querySelector('[data-testid="model-use"]') as HTMLButtonElement).click();
    use('model-kenney-food-kit/pizza');
    await settle(5);
    use('model-kenney-food-kit/pizza');
    await settle(5);
    expect(q('picker-said')?.textContent).toContain('was already there');
    const name = q('picker-name') as HTMLInputElement;
    name.value = 'pizza.glb';
    name.dispatchEvent(new Event('input'));
    use('model-kenney-food-kit/burger');
    await settle(5);
    expect(q('picker-said')?.textContent).toContain('is already there and is another file');
    (q('picker-close') as HTMLButtonElement).click();
    expect((await answer).length).toBe(1);
  });
});
