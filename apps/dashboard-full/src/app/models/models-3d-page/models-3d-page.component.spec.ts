import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideLabForms } from '@lab/forms-kit';
import { InMemoryModelLibrary, MODEL_LIBRARY_OPTIONS, MODEL_LIBRARY_PORT, type ServiceKind } from '@lab/model-library-kit';

import { Models3dPageComponent } from './models-3d-page.component';

describe('Models3dPageComponent', () => {
  let fixture: ComponentFixture<Models3dPageComponent>;
  let library: InMemoryModelLibrary;
  const root = () => fixture.nativeElement as HTMLElement;
  const q = (id: string) => root().querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  async function settle(ms = 0): Promise<void> {
    await fixture.whenStable();
    await new Promise((done) => setTimeout(done, ms));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function open(service: ServiceKind = 'default'): Promise<void> {
    TestBed.resetTestingModule();
    library = new InMemoryModelLibrary({ service });
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideLabForms({ lang: 'en' }), { provide: MODEL_LIBRARY_OPTIONS, useValue: { lang: 'en', pollMs: 3 } }, { provide: MODEL_LIBRARY_PORT, useValue: library }],
    });
    fixture = TestBed.createComponent(Models3dPageComponent);
    fixture.detectChanges();
    await settle();
  }

  beforeEach(async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:thumb'), revokeObjectURL: vi.fn() }));
    await open();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('has the packs and the catalog, which says no pack is installed yet', () => {
    expect(q('model-packs')).not.toBeNull();
    expect(root().querySelectorAll('lab-pack-card').length).toBe(3);
    expect(q('catalog-no-packs')).not.toBeNull();
    expect(q('models3d-back')?.getAttribute('href')).toBe('/models');
  });

  it('shows the models of a pack as soon as it is installed', async () => {
    (q('pack-kenney-furniture-kit')?.querySelector('[data-testid="pack-install"]') as HTMLButtonElement).click();
    const names = () => [...root().querySelectorAll('lab-model-card .name')].map((e) => e.textContent?.trim());
    for (let i = 0; i < 40 && names().length === 0; i++) await settle(20);
    expect(names()).toEqual(['table', 'chair']);
  });

  it('shows the engines and the form to make a model where the server has the 3D service', () => {
    expect(q('model-making')).not.toBeNull();
    expect(q('making-open')).not.toBeNull();
    expect(q('engine-triposr')).not.toBeNull();
  });

  it('shows none of it, and no error, on a server with no 3D service: the screen is as before', async () => {
    await open('none');
    expect(q('model-making')).toBeNull();
    expect(q('making-error')).toBeNull();
    expect(q('model-packs')).not.toBeNull();
  });

  it('takes the person from a finished generation to its model in the catalog', async () => {
    await open('running');
    // a generation that is already done when the screen opens
    await new Promise<void>((ok) => library.generate({ prompt: 'a golden trophy cup', name: 'copa' }).subscribe(() => ok()));
    for (let i = 0; i < 6; i++) await new Promise<void>((ok) => library.generations().subscribe(() => ok()));
    fixture.destroy();
    fixture = TestBed.createComponent(Models3dPageComponent);
    fixture.detectChanges();
    await settle(10);
    (q('generation-show') as HTMLButtonElement).click();
    for (let i = 0; i < 20 && root().querySelectorAll('lab-model-card').length === 0; i++) await settle(10);
    expect([...root().querySelectorAll('lab-model-card .name')].map((e) => e.textContent?.trim())).toEqual(['copa']);
  });

  it('shows the pack generated among the packs once a generation has ended', async () => {
    await open('running');
    expect(q('pack-generated')).toBeNull();
    await new Promise<void>((ok) => library.generate({ prompt: 'a golden trophy cup', name: 'copa' }).subscribe(() => ok()));
    // the section follows the generation by asking for the list; the packs are read again when it ends
    for (let i = 0; i < 60 && !q('pack-generated'); i++) {
      await new Promise<void>((ok) => library.generations().subscribe(() => ok()));
      await settle(10);
    }
    expect(q('pack-generated')?.querySelector('[data-testid="pack-generated"]')).not.toBeNull();
  });
});
