import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';

import { MODEL_LIBRARY_OPTIONS } from '../core/options';
import { InMemoryModelLibrary } from '../memory.adapter';
import { LibraryFailed, MODEL_LIBRARY_PORT, type ModelLibraryPort, type ModelPack } from '../port';
import { PacksStore } from './packs.store';

const until = async (ok: () => boolean, ms = 2000): Promise<void> => {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 2));
  }
};

function setup(port: ModelLibraryPort = new InMemoryModelLibrary()): { store: PacksStore; port: ModelLibraryPort } {
  TestBed.configureTestingModule({
    providers: [PacksStore, { provide: MODEL_LIBRARY_PORT, useValue: port }, { provide: MODEL_LIBRARY_OPTIONS, useValue: { lang: 'en', pollMs: 2 } }],
  });
  return { store: TestBed.inject(PacksStore), port };
}
const pack = (store: PacksStore, id: string): ModelPack => store.packs().find((p) => p.id === id) as ModelPack;

describe('PacksStore', () => {
  it('lists the packs of the server, all available at first', async () => {
    const { store } = setup();
    await store.load();
    expect(store.status()).toBe('ready');
    expect(store.packs().map((p) => p.state)).toEqual(['available', 'available', 'available']);
  });

  it('says the server has no library when its routes are not there', async () => {
    const { store } = setup({ packs: () => throwError(() => new LibraryFailed(404, 'no such endpoint')) } as unknown as ModelLibraryPort);
    await store.load();
    expect(store.status()).toBe('unavailable');
  });

  it('keeps asking an install for its progress until it is installed, then stops', async () => {
    const lib = new InMemoryModelLibrary();
    const { store } = setup(lib);
    await store.load();
    await store.install('kenney-food-kit');
    expect(pack(store, 'kenney-food-kit').state).toBe('installing');
    expect(pack(store, 'kenney-food-kit').progress?.total).toBeGreaterThan(0);
    await until(() => pack(store, 'kenney-food-kit').state === 'installed');
    expect(pack(store, 'kenney-food-kit').models).toBe(3);
    const calls = vi.spyOn(lib, 'pack');
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).not.toHaveBeenCalled();
  });

  it('shows the reason of an install that failed and lets it be tried again', async () => {
    const { store } = setup(new InMemoryModelLibrary({ failing: 'kenney-food-kit' }));
    await store.load();
    await store.install('kenney-food-kit');
    await until(() => pack(store, 'kenney-food-kit').state === 'failed');
    expect(pack(store, 'kenney-food-kit').error).toMatch(/changed/);
    await store.install('kenney-food-kit');
    expect(pack(store, 'kenney-food-kit').state).toBe('installing');
  });

  it('shows the real state of a pack when the server says it is already installed or installing (409)', async () => {
    const lib = new InMemoryModelLibrary();
    const { store } = setup(lib);
    await store.load();
    await store.install('kenney-food-kit');
    await store.install('kenney-food-kit');
    expect(store.problems()['kenney-food-kit']).toBeUndefined();
    expect(pack(store, 'kenney-food-kit').state).not.toBe('available');
  });

  it('cancels an install and stops following it', async () => {
    const lib = new InMemoryModelLibrary();
    const { store } = setup(lib);
    await store.load();
    await store.install('kenney-furniture-kit');
    await store.cancel('kenney-furniture-kit');
    expect(pack(store, 'kenney-furniture-kit').state).toBe('available');
    await new Promise((r) => setTimeout(r, 20));
    expect(pack(store, 'kenney-furniture-kit').state).toBe('available');
  });

  it('removes a pack of the list (it is available again) and an imported one (it is gone)', async () => {
    const lib = new InMemoryModelLibrary();
    const { store } = setup(lib);
    await store.load();
    await store.install('kenney-food-kit');
    await until(() => pack(store, 'kenney-food-kit').state === 'installed');
    await store.remove('kenney-food-kit');
    expect(pack(store, 'kenney-food-kit').state).toBe('available');
    await store.importPack({ id: 'mine', licence: 'CC-BY 4.0', file: new Blob(['PK']) });
    expect(pack(store, 'mine').attribution).toBe(true);
    await store.remove('mine');
    expect(store.packs().some((p) => p.id === 'mine')).toBe(false);
  });

  it('keeps the refusal of an import in the server’s words', async () => {
    const { store } = setup();
    await store.load();
    expect(await store.importPack({ id: 'none-here', licence: 'CC0', file: new Blob(['PK']) })).toBeNull();
    expect(store.importProblem()).toMatch(/no \.glb/);
    expect(await store.importPack({ id: 'kenney-food-kit', licence: 'CC0', file: new Blob(['PK']) })).toBeNull();
    expect(store.importProblem()).toMatch(/already in use/);
  });

  it('stops following installs when its screen is gone', async () => {
    const lib = new InMemoryModelLibrary();
    const { store } = setup(lib);
    await store.load();
    await store.install('kenney-food-kit');
    const spy = vi.spyOn(lib, 'pack');
    TestBed.resetTestingModule();
    await new Promise((r) => setTimeout(r, 20));
    expect(spy).not.toHaveBeenCalled();
    expect(store).toBeTruthy();
  });

  it('reads a pack that is installing when the screen opens, so an install begun elsewhere is followed', async () => {
    const lib = new InMemoryModelLibrary();
    await new Promise<void>((ok) => lib.install('kenney-food-kit').subscribe(() => ok()));
    const { store } = setup(lib);
    await store.load();
    await until(() => pack(store, 'kenney-food-kit').state === 'installed');
  });
});

