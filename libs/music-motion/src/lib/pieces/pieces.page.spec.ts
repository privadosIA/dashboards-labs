import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router, provideRouter } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { MUSIC_MOTION_OPTIONS } from '../core/options';
import { MUSIC_MOTION_LINKS } from '../core/external-links';
import { AnimationFailure, type AnimationPort, type Piece } from '@lab/animation-core';
import { InMemoryAnimation } from '../animation/in-memory.adapter';
import { ANIMATION, IN_MEMORY_ANIMATION } from '../animation/tokens';
import { stubStorage } from '../../testing/memory-storage';
import { PiecesPage } from './pieces.page';

const piece = (id: string, extra: Partial<Piece> = {}): Piece => ({
  id,
  title: `Song ${id}`,
  state: 'draft',
  progress: 0,
  source: { project: 'demo', trackId: 't', variant: 0 },
  style: 'typographic',
  level: 'simple',
  fps: 30,
  width: 1280,
  height: 720,
  createdAt: 1,
  estimate: { seconds: 150, frames: 1000 },
  sizeBytes: 0,
  ...extra,
});

function create(initial: readonly Piece[], remove: (id: string) => unknown = () => of(undefined), lang: 'es' | 'en' = 'en') {
  stubStorage();
  const list = new BehaviorSubject<readonly Piece[]>(initial);
  const removeCall = vi.fn(remove);
  const port = { pieces: () => list.asObservable(), remove: removeCall } as unknown as AnimationPort;
  TestBed.configureTestingModule({ providers: [ { provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'video-anim' } },provideRouter([]), { provide: ANIMATION, useValue: port }] });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(PiecesPage);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, list, removeCall, navigate, text: () => el.textContent ?? '' };
}

const confirm = (testid: 'confirm' | 'cancel') => document.querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`)!;

/** Presses Delete on the first card and waits for the confirmation to be on screen. */
async function askToRemove(fixture: ComponentFixture<unknown>): Promise<void> {
  (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="remove"]')!.click();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

/** Presses a button of the confirmation and waits for what follows. */
async function answer(fixture: ComponentFixture<unknown>, testid: 'confirm' | 'cancel'): Promise<void> {
  confirm(testid).click();
  // The dialog tells the page it closed when its exit animation ends.
  await new Promise((r) => setTimeout(r, 300));
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('PiecesPage', () => {
  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    vi.unstubAllGlobals();
  });

  it('says there are no pieces and points to the songs', () => {
    const { el, text } = create([]);
    expect(el.querySelector('[data-testid="empty"]')).not.toBeNull();
    expect(text()).toContain('There are no pieces yet.');
    expect(el.querySelector('a[href="/songs"]')).not.toBeNull();
  });

  it('lists a card per piece with its state, what it was made with and, when done, its size', () => {
    const { el } = create([piece('a', { state: 'done', progress: 100, sizeBytes: 8_400_000 }), piece('b', { style: 'illustrated', level: 'advanced', fps: 60 })]);
    const cards = el.querySelectorAll('app-piece-card');
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector('[data-testid="state"]')!.textContent).toBe('Done');
    expect(cards[0].querySelector('[data-testid="size"]')!.textContent).toContain('8.4 MB');
    expect(cards[0].textContent).toContain('Typographic · Simple · 30 fps · 1280×720');
    expect(cards[1].textContent).toContain('Illustrated · Advanced · 60 fps');
    expect(cards[1].querySelector('[data-testid="state"]')!.textContent).toBe('Draft');
  });

  it('shows the progress and the forecast of a piece that is being drawn, and moves it without being asked', () => {
    const { fixture, el, list } = create([piece('a', { state: 'running', progress: 30 })]);
    const bar = () => el.querySelector('[data-testid="progress"]')!;
    expect(bar().getAttribute('aria-valuenow')).toBe('30');
    expect(el.textContent).toContain('30%');
    expect(el.textContent).toContain('Forecast: 3 min');
    list.next([piece('a', { state: 'running', progress: 65 })]);
    fixture.detectChanges();
    expect(bar().getAttribute('aria-valuenow')).toBe('65');
    list.next([piece('a', { state: 'done', progress: 100, sizeBytes: 1_000_000 })]);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="progress"]')).toBeNull();
  });

  it('shows the error of a piece that failed', () => {
    const { el } = create([piece('a', { state: 'failed', error: 'Chrome closed while drawing' })]);
    expect(el.querySelector('[data-testid="error"]')!.textContent).toContain('Chrome closed while drawing');
    expect(el.querySelector('[data-testid="state"]')!.textContent).toBe('Failed');
  });

  it('offers Export dataset on every card, also on a piece that is being drawn', () => {
    const { el } = create([piece('a', { state: 'done', progress: 100 }), piece('b', { state: 'running', progress: 30 })]);
    const buttons = el.querySelectorAll<HTMLButtonElement>('app-piece-card [data-testid="export-dataset"]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toContain('Export dataset');
    expect(buttons[1].disabled).toBe(false);
  });

  it('opens a piece', () => {
    const { el, navigate } = create([piece('a')]);
    el.querySelector<HTMLButtonElement>('[data-testid="open"]')!.click();
    expect(navigate).toHaveBeenCalledWith(['/pieces/a']);
  });

  it('asks before deleting, and does nothing when the person says no', async () => {
    const { fixture, removeCall } = create([piece('a')]);
    await askToRemove(fixture);
    expect(document.body.textContent).toContain('Delete the piece');
    expect(document.body.textContent).toContain('Song a');
    await answer(fixture, 'cancel');
    expect(removeCall).not.toHaveBeenCalled();
  });

  it('deletes after the confirmation', async () => {
    const { fixture, removeCall } = create([piece('a')]);
    await askToRemove(fixture);
    await answer(fixture, 'confirm');
    expect(removeCall).toHaveBeenCalledWith('a');
  });

  it('keeps the piece and shows the server\'s reason when it is being drawn', async () => {
    const { fixture, el } = create([piece('a', { state: 'running' })], () => throwError(() => new AnimationFailure('busy', 'piece "a" is being drawn: wait for it to end')));
    await askToRemove(fixture);
    await answer(fixture, 'confirm');
    expect(el.querySelector('[data-testid="refused"]')!.textContent).toContain('The piece is being drawn: piece "a" is being drawn: wait for it to end');
    expect(el.querySelectorAll('app-piece-card')).toHaveLength(1);
  });

  it('speaks Spanish when the language is Spanish', () => {
    const { text } = create([piece('a', { state: 'queued' })], undefined, 'es');
    expect(text()).toContain('En cola');
    expect(text()).toContain('Borrar');
  });

  it('pages the pieces ten at a time, and the card to delete is still the one pressed on a later page', async () => {
    sessionStorage.clear();
    const { fixture, el } = create(Array.from({ length: 30 }, (_, i) => piece(`p${i}`)));
    fixture.detectChanges();
    expect(el.querySelectorAll('app-piece-card')).toHaveLength(10);
    el.querySelector<HTMLButtonElement>('button.mat-mdc-paginator-navigation-next')!.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('app-piece-card')).toHaveLength(10);
    await askToRemove(fixture);
    expect(document.querySelector('[data-testid="confirm"]')).not.toBeNull();
    await answer(fixture, 'cancel');
  });

  describe('the example', () => {
    it('is offered in memory mode: pressing it loads the dataset and says so, and the pieces appear on two pages', async () => {
      stubStorage();
      const memory = new InMemoryAnimation({ pollMs: 10 });
      TestBed.configureTestingModule({ providers: [{ provide: MUSIC_MOTION_OPTIONS, useValue: { lang: 'en', client: 'video-anim', memory: true } }, provideRouter([]), { provide: ANIMATION, useValue: memory }, { provide: IN_MEMORY_ANIMATION, useValue: memory }] });
      const fixture = TestBed.createComponent(PiecesPage);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelectorAll('app-piece-card')).toHaveLength(0);
      el.querySelector<HTMLButtonElement>('[data-testid="load-example"]')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="example-loaded"]')).not.toBeNull();
      expect(el.querySelectorAll('app-piece-card')).toHaveLength(10); // the first of two pages
      expect(el.querySelector('mat-paginator')).not.toBeNull();
      expect(el.textContent).toContain('Done');
    });

    describe('importing a file', () => {
      async function memoryPage(lang: 'es' | 'en' = 'en') {
        stubStorage();
        const memory = new InMemoryAnimation({ pollMs: 10 });
        TestBed.configureTestingModule({ providers: [{ provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'video-anim', memory: true } }, provideRouter([]), { provide: ANIMATION, useValue: memory }, { provide: IN_MEMORY_ANIMATION, useValue: memory }] });
        const fixture = TestBed.createComponent(PiecesPage);
        fixture.detectChanges();
        const el = fixture.nativeElement as HTMLElement;
        const choose = async (content: string, name = 'dataset.json') => {
          const input = el.querySelector<HTMLInputElement>('[data-testid="import-file"]')!;
          Object.defineProperty(input, 'files', { value: [new File([content], name, { type: 'application/json' })], configurable: true });
          input.dispatchEvent(new Event('change'));
          for (let i = 0; i < 5; i++) {
            await fixture.whenStable();
            fixture.detectChanges();
          }
        };
        return { fixture, el, memory, choose };
      }
      const dataset = (extra: object = {}) => ({
        songs: [{ project: 'mine', trackId: 't', variant: 0, title: 'Mine', seconds: 20, bpm: 100, instrumental: true, lyrics: '' }],
        pieces: [{ id: 'p1', song: { project: 'mine', trackId: 't', variant: 0 }, level: 'simple', style: 'typographic', fps: 30, resolution: '1280x720', state: 'draft' }],
        ...extra,
      });

      it('a valid file is loaded: its pieces appear and the person is told', async () => {
        const { el, choose } = await memoryPage();
        await choose(JSON.stringify(dataset()));
        expect(el.querySelector('[data-testid="import-done"]')).not.toBeNull();
        expect(el.querySelectorAll('app-piece-card')).toHaveLength(1);
        expect(el.textContent).toContain('Mine');
      });

      it('a file with a piece whose song is not in it changes nothing and says which piece and which song', async () => {
        const { el, choose } = await memoryPage();
        await choose(JSON.stringify(dataset({ songs: [] })));
        expect(el.querySelector('[data-testid="import-problems"]')!.textContent).toContain('pieces[0]: the song mine/t/0 is not in songs');
        expect(el.querySelectorAll('app-piece-card')).toHaveLength(0);
        expect(el.querySelector('[data-testid="import-done"]')).toBeNull();
      });

      it('shows the first ten problems and how many more there are', async () => {
        const { el, choose } = await memoryPage();
        await choose(JSON.stringify({ pieces: Array.from({ length: 15 }, () => ({})) }));
        expect(el.querySelectorAll('[data-testid="import-problems"] li')).toHaveLength(10);
        expect(el.querySelector('[data-testid="import-problems"]')!.textContent).toMatch(/and \d+ more/);
      });

      it('a file that is not JSON says it could not be read', async () => {
        const { el, choose } = await memoryPage();
        await choose('this is not json');
        expect(el.querySelector('[data-testid="import-problems"]')!.textContent).toContain('not JSON');
      });

      it('speaks Spanish in Spanish', async () => {
        const { el, choose } = await memoryPage('es');
        expect(el.textContent).toContain('Importar dataset');
        await choose('nope');
        expect(el.querySelector('[data-testid="import-problems"]')!.textContent).toContain('no es un JSON');
        await choose(JSON.stringify({ pieces: [{}] }));
        expect(el.querySelector('[data-testid="import-problems"]')!.textContent).toContain('necesita un id');
      });

      it('is not offered on a server', () => {
        const { el } = create([piece('a')]);
        expect(el.querySelector('[data-testid="import-dataset"]')).toBeNull();
      });
    });

    it('is not offered on a server, and speaks Spanish in Spanish', () => {
      const { el } = create([piece('a')]);
      expect(el.querySelector('[data-testid="load-example"]')).toBeNull();
      TestBed.resetTestingModule();
      stubStorage();
      const memory = new InMemoryAnimation();
      TestBed.configureTestingModule({ providers: [{ provide: MUSIC_MOTION_OPTIONS, useValue: { lang: 'es', client: 'video-anim', memory: true } }, provideRouter([]), { provide: ANIMATION, useValue: memory }, { provide: IN_MEMORY_ANIMATION, useValue: memory }] });
      const fixture = TestBed.createComponent(PiecesPage);
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Cargar ejemplo');
    });
  });

  it('has a New animation button that opens the flow without going through Songs, whether or not there are pieces', async () => {
    const withPieces = create([piece('a')]);
    withPieces.fixture.detectChanges();
    expect(withPieces.el.querySelector('[data-testid="new-animation"]')!.getAttribute('href')).toBe('/new');
    expect(withPieces.el.querySelector('[data-testid="new-animation"]')!.textContent).toContain('New animation');
    TestBed.resetTestingModule();
    const none = create([]);
    none.fixture.detectChanges();
    expect(none.el.querySelector('[data-testid="new-animation"]')).not.toBeNull();
  });
});

describe('PiecesPage, the link to where a piece is edited', () => {
  const one = [{ id: 'p-1', title: 'Song', state: 'done', progress: 100, source: { project: 'p', trackId: 't', variant: 1 }, style: 'typographic', level: 'medium', fps: 30, width: 1280, height: 720, createdAt: 1, estimate: { seconds: 10, frames: 300 }, sizeBytes: 0 }] as unknown as readonly Piece[];

  it('puts Edit in Motion Edit on each card, to the address the host gave for that piece, in the dashboard\'s language', () => {
    TestBed.overrideProvider(MUSIC_MOTION_LINKS, { useValue: { pieceEditor: (id: string) => `/animation/motion-edit/pieces/${id}` } });
    const { el } = create(one);
    const link = el.querySelector('[data-testid="edit-in-motion-edit"]')!;
    expect(link.getAttribute('href')).toBe('/animation/motion-edit/pieces/p-1');
    expect(link.textContent).toBe('Edit in Motion Edit');
  });

  it('says it in Spanish too', () => {
    TestBed.overrideProvider(MUSIC_MOTION_LINKS, { useValue: { pieceEditor: (id: string) => `/e/${id}` } });
    const { el } = create(one, undefined, 'es');
    expect(el.querySelector('[data-testid="edit-in-motion-edit"]')!.textContent).toBe('Editar en Motion Edit');
  });

  it('draws no link when the host gave none, as the standalone dashboard has it', () => {
    const { el } = create(one);
    expect(el.querySelector('[data-testid="edit-in-motion-edit"]')).toBeNull();
  });
});
