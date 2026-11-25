import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideLabForms } from '@lab/forms-kit';

import { MODEL_LIBRARY_OPTIONS } from '../../core/options';
import { InMemoryModelLibrary } from '../../memory.adapter';
import { MODEL_LIBRARY_PORT, type ModelLibraryPort } from '../../port';
import { ModelPacks } from './model-packs';

describe('ModelPacks', () => {
  let fixture: ComponentFixture<ModelPacks>;
  let library: InMemoryModelLibrary;
  let changed: number;
  const root = () => fixture.nativeElement as HTMLElement;
  const q = (id: string) => root().querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const card = (id: string) => q(`pack-${id}`) as HTMLElement;
  const inCard = (id: string, what: string) => card(id).querySelector(`[data-testid="${what}"]`) as HTMLButtonElement | null;

  async function settle(ms = 0): Promise<void> {
    await fixture.whenStable();
    await new Promise((done) => setTimeout(done, ms));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function open(port: ModelLibraryPort = library, lang: 'es' | 'en' = 'en'): Promise<void> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideLabForms({ lang }), { provide: MODEL_LIBRARY_OPTIONS, useValue: { lang, pollMs: 3 } }, { provide: MODEL_LIBRARY_PORT, useValue: port }] });
    fixture = TestBed.createComponent(ModelPacks);
    changed = 0;
    fixture.componentInstance.changed.subscribe(() => changed++);
    fixture.detectChanges();
    await settle();
  }

  beforeEach(() => {
    library = new InMemoryModelLibrary();
  });
  afterEach(() => TestBed.inject(MatDialog).closeAll());

  it('draws a card for each pack with its state, licence, author and size', async () => {
    await open();
    expect(root().querySelectorAll('lab-pack-card').length).toBe(3);
    expect(card('kenney-food-kit').textContent).toContain('Available');
    expect(card('kenney-food-kit').textContent).toContain('Licence: CC0');
    expect(card('kenney-food-kit').textContent).toContain('by Kenney');
    expect(card('kenney-food-kit').textContent).toContain('4.8 MB');
  });

  it('puts the same words in Spanish', async () => {
    await open(library, 'es');
    expect(card('kenney-food-kit').textContent).toContain('Disponible');
    expect(card('kenney-food-kit').textContent).toContain('Licencia: CC0');
    expect(q('packs-import')?.textContent).toContain('Importar un zip');
  });

  it('links Kenney’s packs to the donations page', async () => {
    await open();
    const link = card('kenney-food-kit').querySelector('[data-testid="pack-donate"] a') as HTMLAnchorElement;
    expect(link.href).toBe('https://kenney.nl/support');
    expect(link.rel).toContain('noopener');
  });

  it('installs a pack: it shows the progress while it installs and ends installed with its models, telling the host', async () => {
    await open();
    inCard('kenney-food-kit', 'pack-install')?.click();
    await settle();
    expect(card('kenney-food-kit').getAttribute('data-state')).toBe('installing');
    expect(inCard('kenney-food-kit', 'pack-progress')).not.toBeNull();
    expect(inCard('kenney-food-kit', 'pack-cancel')).not.toBeNull();
    expect(changed).toBe(0); // nothing of the catalog changes while it installs
    for (let i = 0; i < 20 && card('kenney-food-kit').getAttribute('data-state') !== 'installed'; i++) await settle(5);
    expect(card('kenney-food-kit').getAttribute('data-state')).toBe('installed');
    expect(inCard('kenney-food-kit', 'pack-models')?.textContent).toContain('3 models');
    expect(changed).toBe(1);
  });

  it('shows why an install failed, and tries again', async () => {
    library = new InMemoryModelLibrary({ failing: 'kenney-food-kit' });
    await open();
    inCard('kenney-food-kit', 'pack-install')?.click();
    for (let i = 0; i < 20 && card('kenney-food-kit').getAttribute('data-state') !== 'failed'; i++) await settle(5);
    expect(inCard('kenney-food-kit', 'pack-error')?.textContent).toContain('changed');
    expect(inCard('kenney-food-kit', 'pack-retry')).not.toBeNull();
  });

  it('cancels an install', async () => {
    await open();
    inCard('kenney-furniture-kit', 'pack-install')?.click();
    await settle();
    inCard('kenney-furniture-kit', 'pack-cancel')?.click();
    await settle();
    expect(card('kenney-furniture-kit').getAttribute('data-state')).toBe('available');
  });

  it('asks before removing a pack, and leaves it available again', async () => {
    await open();
    inCard('kenney-food-kit', 'pack-install')?.click();
    for (let i = 0; i < 20 && card('kenney-food-kit').getAttribute('data-state') !== 'installed'; i++) await settle(5);
    inCard('kenney-food-kit', 'pack-remove')?.click();
    await settle();
    expect(inCard('kenney-food-kit', 'pack-remove-ask')?.textContent).toContain('already copied');
    inCard('kenney-food-kit', 'pack-remove-no')?.click();
    await settle();
    expect(card('kenney-food-kit').getAttribute('data-state')).toBe('installed');
    inCard('kenney-food-kit', 'pack-remove')?.click();
    await settle();
    inCard('kenney-food-kit', 'pack-remove-yes')?.click();
    await settle(5);
    expect(card('kenney-food-kit').getAttribute('data-state')).toBe('available');
  });

  it('says so when the server has no library', async () => {
    await open({ packs: () => library.pack('nope') } as unknown as ModelLibraryPort);
    expect(q('packs-unavailable')?.textContent).toContain('does not have the 3D library');
  });

  it('opens the import form, which wants the licence before it sends anything', async () => {
    await open();
    q('packs-import')?.click();
    await settle();
    const send = document.querySelector('[data-testid="import-send"]') as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(document.querySelector('[data-testid="import-no-zip"]')).not.toBeNull();
    expect(document.body.textContent).toContain('Licence');
  });
});
