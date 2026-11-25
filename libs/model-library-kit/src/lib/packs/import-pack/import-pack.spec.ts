import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideLabForms } from '@lab/forms-kit';

import { MODEL_LIBRARY_OPTIONS } from '../../core/options';
import { InMemoryModelLibrary } from '../../memory.adapter';
import { MODEL_LIBRARY_PORT, type ModelPack } from '../../port';
import { PacksStore } from '../packs.store';
import { ImportPack } from './import-pack';

describe('ImportPack', () => {
  let store: PacksStore;
  let dialog: MatDialog;
  let result: Promise<ModelPack | undefined>;
  const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const field = (id: string) => (q(id)?.matches('input') ? q(id) : q(id)?.querySelector('input')) as HTMLInputElement;

  async function settle(ms = 0): Promise<void> {
    await new Promise((done) => setTimeout(done, ms));
    TestBed.tick();
    await new Promise((done) => setTimeout(done, 0));
  }
  async function type(id: string, value: string): Promise<void> {
    const el = field(id);
    el.value = value;
    el.dispatchEvent(new Event('input'));
    el.dispatchEvent(new Event('blur'));
    await settle();
  }
  async function zip(file: File | null): Promise<void> {
    const input = q('import-zip') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: file ? { item: () => file, length: 1 } : { item: () => null, length: 0 }, configurable: true });
    input.dispatchEvent(new Event('change'));
    await settle();
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideLabForms({ lang: 'en' }), { provide: MODEL_LIBRARY_OPTIONS, useValue: { lang: 'en' } }, { provide: MODEL_LIBRARY_PORT, useValue: new InMemoryModelLibrary() }, PacksStore] });
    store = TestBed.inject(PacksStore);
    dialog = TestBed.inject(MatDialog);
    result = new Promise((ok) => dialog.open(ImportPack, { data: store }).afterClosed().subscribe(ok));
    await settle(5);
  });
  afterEach(() => dialog.closeAll());

  it('will not send without the licence, and says it is required', async () => {
    await type('import-id', 'mine');
    await zip(new File(['PK'], 'pack.zip'));
    expect((q('import-send') as HTMLButtonElement).disabled).toBe(true);
    await type('import-licence', '');
    expect(document.body.textContent).toContain('The licence is required');
    await type('import-licence', 'CC-BY 4.0');
    expect((q('import-send') as HTMLButtonElement).disabled).toBe(false);
  });

  it('will not send without the zip', async () => {
    await type('import-id', 'mine');
    await type('import-licence', 'CC0');
    expect((q('import-send') as HTMLButtonElement).disabled).toBe(true);
    expect(q('import-no-zip')?.textContent).toContain('Choose the zip');
  });

  it('refuses an id that is not lower case, digits and hyphens', async () => {
    await type('import-id', 'My Pack!');
    expect(document.body.textContent).toContain('Lower case letters, digits and hyphens');
  });

  it('imports the zip and closes with the pack', async () => {
    await type('import-id', 'mine');
    await type('import-licence', 'CC-BY 4.0');
    await type('import-author', 'Someone');
    await zip(new File(['PK'], 'pack.zip'));
    (q('import-send') as HTMLButtonElement).click();
    const pack = await result;
    expect(pack).toMatchObject({ id: 'mine', licence: 'CC-BY 4.0', author: 'Someone', attribution: true, state: 'installed' });
    expect(store.packs().map((p) => p.id)).toContain('mine');
  });

  it('keeps the form and shows the server’s words when it refuses (422 with no models, 409 for an id in use)', async () => {
    await type('import-id', 'none-here');
    await type('import-licence', 'CC0');
    await zip(new File(['PK'], 'pack.zip'));
    (q('import-send') as HTMLButtonElement).click();
    await settle(5);
    expect(q('import-problem')?.textContent).toContain('no .glb');
    expect(field('import-licence').value).toBe('CC0');
    await type('import-id', 'kenney-food-kit');
    await store.load();
    (q('import-send') as HTMLButtonElement).click();
    await settle(5);
    expect(q('import-problem')?.textContent).toContain('already in use');
  });
});
