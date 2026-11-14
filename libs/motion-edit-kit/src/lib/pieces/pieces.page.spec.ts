import { TestBed } from '@angular/core/testing';
import { MOTION_EDIT_OPTIONS } from '../core/options';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import type { Piece } from '@lab/animation-core';
import { ANIMATION, IN_MEMORY_ANIMATION, InMemoryAnimation } from '@lab/music-motion';

import { PiecesPage } from './pieces.page';

function stubStorage(lang = 'en'): void {
  const data = new Map<string, string>([['motion-edit.lang', lang]]);
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) });
}

const piece = (id: string, createdAt: number, extra: Partial<Piece> = {}): Piece => ({
  id,
  title: `Song ${id}`,
  state: 'done',
  progress: 100,
  source: { project: 'p', trackId: 't', variant: 1 },
  style: 'typographic',
  level: 'medium',
  fps: 30,
  width: 1280,
  height: 720,
  createdAt,
  estimate: { seconds: 10, frames: 300 },
  sizeBytes: 0,
  ...extra,
});

function setup(list: readonly Piece[] | 'memory', lang = 'en') {
  stubStorage(lang);
  const memory = list === 'memory' ? new InMemoryAnimation({ stepMs: 100, pollMs: 10 }) : null;
  TestBed.configureTestingModule({
    providers: [
      { provide: MOTION_EDIT_OPTIONS, useValue: { lang } },
      provideRouter([]),
      { provide: ANIMATION, useValue: memory ?? { pieces: () => of(list) } },
      { provide: IN_MEMORY_ANIMATION, useValue: memory },
    ],
  });
  const fixture = TestBed.createComponent(PiecesPage);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, memory };
}

describe('PiecesPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists the pieces newest first, with title, song, state and format', () => {
    const { el } = setup([piece('old', 1), piece('new', 5, { state: 'failed' }), piece('mid', 3)]);
    const titles = Array.from(el.querySelectorAll('app-piece-row h2')).map((h) => h.textContent);
    expect(titles).toEqual(['Song new', 'Song mid', 'Song old']);
    const first = el.querySelector('app-piece-row')!;
    expect(first.textContent).toContain('p · t · v1');
    expect(first.textContent).toContain('1280×720 · 30 fps');
    expect(first.querySelector('[data-testid="state"]')!.textContent).toBe('Failed');
  });

  it('shows the progress of a piece that is being drawn', () => {
    const { el } = setup([piece('a', 1, { state: 'running', progress: 42 })]);
    expect(el.querySelector('[data-testid="state"]')!.textContent).toBe('Drawing 42%');
    expect(el.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('42');
  });

  it('opens a piece in the editor', async () => {
    const { el, fixture } = setup([piece('abc', 1)]);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    (el.querySelector('.open') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(navigate).toHaveBeenCalledWith(['/pieces', 'abc']);
  });

  it('pages a long list', () => {
    const many = Array.from({ length: 30 }, (_, i) => piece(`p${i}`, i));
    const { el } = setup(many);
    expect(el.querySelectorAll('app-piece-row').length).toBeLessThan(30);
    expect(el.querySelector('.mat-mdc-paginator, mat-paginator')).not.toBeNull();
  });

  it('says there are no pieces', () => {
    const { el } = setup([]);
    expect(el.querySelector('[data-testid="empty"]')!.textContent).toContain('The server has no pieces.');
    expect(el.querySelector('[data-testid="load-example"]')).toBeNull();
  });

  it('shows Load example only in memory mode, and loading it fills the list', async () => {
    const { el, fixture, memory } = setup('memory');
    expect(el.querySelector('[data-testid="empty"]')).not.toBeNull();
    (el.querySelector('[data-testid="load-example"]') as HTMLButtonElement).click();
    await firstValueFrom(memory!.pieces());
    fixture.detectChanges();
    expect(el.querySelectorAll('app-piece-row').length).toBeGreaterThan(0);
    expect(el.querySelector('.done')!.textContent).toContain('Example loaded.');
  });

  it('shows the date of a piece in Spanish too, which Angular\'s date pipe has no data for', () => {
    const { el } = setup([piece('a', Date.UTC(2026, 10, 9, 12, 30))], 'es');
    expect(el.querySelector('app-piece-row')!.textContent).toContain('Creada:');
    expect(el.querySelector('app-piece-row')!.textContent).toMatch(/9\/11\/26|09\/11\/2026/);
  });

  it('says its words in Spanish', () => {
    const { el } = setup([], 'es');
    expect(el.querySelector('h1')!.textContent).toBe('Piezas');
    expect(el.textContent).toContain('El servidor no tiene piezas.');
  });

  it('opens and closes the import panel from a button', () => {
    const { fixture, el } = setup([piece('a', 1)]);
    expect(el.querySelector('app-import-dataset')).toBeNull();
    (el.querySelector('[data-testid="import-toggle"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('app-import-dataset')).not.toBeNull();
    (el.querySelector('[data-testid="import-toggle"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('app-import-dataset')).toBeNull();
  });
});
