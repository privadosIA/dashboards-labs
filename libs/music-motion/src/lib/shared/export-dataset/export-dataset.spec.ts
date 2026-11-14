import { TestBed } from '@angular/core/testing';
import { firstValueFrom, throwError } from 'rxjs';

import { AnimationFailure, type AnimationPort } from '@lab/animation-core';
import { InMemoryAnimation } from '../../animation/in-memory.adapter';
import { ANIMATION } from '../../animation/tokens';
import { MUSIC_MOTION_OPTIONS } from '../../core/options';
import { stubStorage } from '../../../testing/memory-storage';
import { ExportDataset } from './export-dataset';

/** What the browser was given to save: `saveText` makes a Blob, a link to it with the file's name, and clicks the link. */
const saved: { name: string; text: Promise<string> }[] = [];
function watchSaving(): void {
  saved.length = 0;
  let blob: Blob | undefined;
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => ((blob = b as Blob), 'blob:test'));
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.push({ name: this.download, text: blob!.text() });
  });
}

async function create(lang: 'es' | 'en' = 'en', port?: AnimationPort) {
  stubStorage();
  watchSaving();
  const memory = new InMemoryAnimation({ stepMs: 100, pollMs: 10, writeMs: 100 });
  await firstValueFrom(memory.loadSample());
  const piece = (await firstValueFrom(memory.pieces()))[0];
  TestBed.configureTestingModule({ providers: [{ provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'video-anim' } }, { provide: ANIMATION, useValue: port ?? memory }] });
  const fixture = TestBed.createComponent(ExportDataset);
  fixture.componentRef.setInput('piece', { id: piece.id, title: piece.title });
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const press = async () => {
    el.querySelector<HTMLButtonElement>('[data-testid="export-dataset"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { fixture, el, piece, press };
}

describe('ExportDataset', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('saves the dataset of that animation alone, named after its title, and says so', async () => {
    const { el, piece, press } = await create();
    expect(el.querySelector('button')!.textContent).toContain('Export dataset');
    await press();
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toMatch(/\.motion\.json$/);
    const file = JSON.parse(await saved[0].text);
    expect(file).toMatchObject({ format: 'music-motion-dataset', version: 2, animation: { title: piece.title } });
    expect(el.querySelector('[data-testid="export-saved"]')!.textContent).toContain(saved[0].name);
  });

  it('says it in Spanish when the dashboard is in Spanish', async () => {
    const { el, press } = await create('es');
    expect(el.querySelector('button')!.textContent).toContain('Exportar dataset');
    await press();
    expect(el.querySelector('[data-testid="export-saved"]')!.textContent).toContain('Dataset de la animación guardado en');
  });

  it('says why when the animation cannot be read and saves nothing', async () => {
    const broken = { piece: () => throwError(() => new AnimationFailure('missing', 'piece "x" not found')) } as unknown as AnimationPort;
    const { el, press } = await create('en', broken);
    await press();
    expect(saved).toEqual([]);
    expect(el.querySelector('[data-testid="export-refused"]')!.textContent).toContain('Could not export the dataset:');
    expect(el.querySelector('[data-testid="export-saved"]')).toBeNull();
  });
});
