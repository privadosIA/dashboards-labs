import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { provideLabForms } from '@lab/forms-kit';
import { provideMotionEditor } from '@lab/motion-editor';
import { provideMotionParts } from '@lab/motion-parts';
import { ANIMATION, InMemoryAnimation } from '@lab/music-motion';
import { provideServerConnection } from '@lab/server-connection';

import { stubStorage } from '../../testing/memory-storage';
import { AUDIO_FACTORY } from './audio';
import { MONACO } from './code/code-pane/code-pane';
import { EditorPage } from './editor.page';

class FakeAudio {
  currentTime = 0;
  paused = true;
  constructor(public src: string) {}
  play = () => ((this.paused = false), Promise.resolve());
  pause = () => void (this.paused = true);
  addEventListener = () => undefined;
  removeEventListener = () => undefined;
}

/** The sample piece, whose second piece draws `counter`, the part the in-memory server lets animate `to` and `speed`. */
async function setup(options: { features?: string[]; withKeyframes?: boolean; hideFeature?: boolean } = {}) {
  stubStorage({ 'motion-edit.lang': 'en' });
  const port = new InMemoryAnimation({ stepMs: 100, pollMs: 10, ...(options.features ? { features: options.features } : {}) });
  await firstValueFrom(port.loadSample());
  if (options.withKeyframes) {
    const piece = await firstValueFrom(port.piece('sample-piece'));
    const pieces = piece.script.pieces.map((p) => (p.part === 'counter' ? { ...p, animate: { to: [{ t: 0, value: 1, ease: 'linear' as const }, { t: p.end - p.start, value: 100, ease: 'linear' as const }] } } : p));
    await firstValueFrom(port.saveScript('sample-piece', { ...piece.script, pieces }));
  }
  // A server that stopped taking keyframes after the piece was saved with them.
  if (options.hideFeature) {
    const catalog = await firstValueFrom(port.catalog());
    vi.spyOn(port, 'catalog').mockReturnValue(of({ ...catalog, features: [] }));
  }
  TestBed.configureTestingModule({
    providers: [
      { provide: MONACO, useValue: () => Promise.reject(new Error('no monaco in tests')) },
      provideRouter([]),
      provideHttpClient(),
      provideServerConnection({ lang: 'en' }),
      provideLabForms({ lang: 'en' }),
      provideMotionParts({ lang: 'en' }),
      provideMotionEditor({ lang: 'en' }),
      { provide: ANIMATION, useValue: port },
      { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'sample-piece' })), queryParamMap: of(convertToParamMap({})) } },
      { provide: AUDIO_FACTORY, useValue: (src: string) => new FakeAudio(src) },
    ],
  });
  const fixture = TestBed.createComponent(EditorPage);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const settle = async (check: () => void) => {
    await vi.waitFor(
      () => {
        fixture.detectChanges();
        check();
      },
      { timeout: 3000 },
    );
  };
  const page = fixture.componentInstance as unknown as {
    selection: { (): { piece: string; extra?: number; param?: string; keyframe?: number } | null; set(v: unknown): void };
    doc(): { script: { pieces: { id: string; part: string; start: number; end: number; animate?: Record<string, { t: number; value: unknown }[]> }[] } };
    clock: { seek(t: number): void };
  };
  await settle(() => expect(el.querySelector('lab-motion-timeline')).not.toBeNull());
  const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const counterId = () => page.doc().script.pieces.find((p) => p.part === 'counter')!.id;
  const selectCounter = async () => {
    page.selection.set({ piece: counterId() });
    await settle(() => expect(q('piece')).not.toBeNull());
  };
  return { fixture, el, port, page, q, settle, counterId, selectCounter };
}

describe('EditorPage, keyframes', () => {
  afterEach(() => vi.restoreAllMocks());

  it('animates a parameter from the inspector: a row appears under the timeline and the document changes', async () => {
    const { el, page, q, settle, selectCounter, counterId } = await setup();
    expect(el.querySelectorAll('[data-testid="kf-row"]')).toHaveLength(0);
    await selectCounter();
    (el.querySelector('.row[data-param="to"] [data-testid="animate-go"]') as HTMLElement).click();
    await settle(() => expect(el.querySelectorAll('[data-testid="kf-row"]')).toHaveLength(1));
    const piece = page.doc().script.pieces.find((p) => p.id === counterId())!;
    expect(piece.animate!['to'].map((k) => k.t)).toEqual([0, piece.end - piece.start]);
    expect(q('dirty')).not.toBeNull();
    expect(el.querySelectorAll('[data-testid="kf"]')).toHaveLength(2);
    expect(page.selection()).toMatchObject({ piece: counterId(), param: 'to', keyframe: 0 });
    // and the inspector now offers to stop
    await settle(() => expect(el.querySelector('.row[data-param="to"] [data-testid="animate-stop"]')).not.toBeNull());
  });

  it('shows the value at the playhead and follows it while scrubbing', async () => {
    const { el, page, settle, selectCounter, counterId } = await setup({ withKeyframes: true });
    await selectCounter();
    const piece = page.doc().script.pieces.find((p) => p.id === counterId())!;
    page.clock.seek(piece.start);
    await settle(() => expect(el.querySelector('.row[data-param="to"] [data-testid="animate-now"]')!.textContent).toContain('At the playhead: 1'));
    page.clock.seek((piece.start + piece.end) / 2);
    await settle(() => expect(el.querySelector('.row[data-param="to"] [data-testid="animate-now"]')!.textContent).toContain('At the playhead: 51'));
  });

  it('removes the selected keyframe with Delete', async () => {
    const { el, page, settle, counterId } = await setup({ withKeyframes: true });
    const diamonds = () => Array.from(el.querySelectorAll('[data-testid="kf"]')) as HTMLElement[];
    expect(diamonds()).toHaveLength(2);
    diamonds()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle(() => expect(page.selection()).toMatchObject({ param: 'to', keyframe: 0 }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    await settle(() => expect(page.doc().script.pieces.find((p) => p.id === counterId())!.animate!['to']).toHaveLength(1));
    expect(page.selection()).toEqual({ piece: counterId() });
  });

  it('splits a piece that animates and the picture does not change: the value at the cut is on both sides', async () => {
    const { el, page, settle, counterId } = await setup({ withKeyframes: true });
    const piece = page.doc().script.pieces.find((p) => p.id === counterId())!;
    page.clock.seek((piece.start + piece.end) / 2);
    (el.querySelector('[data-testid="split"]') as HTMLElement).click();
    await settle(() => expect(page.doc().script.pieces.filter((p) => p.part === 'counter')).toHaveLength(2));
    const halves = page.doc().script.pieces.filter((p) => p.part === 'counter');
    expect(halves[0].animate!['to'].at(-1)!.value).toBe(halves[1].animate!['to'][0].value);
    expect(halves[0].animate!['to'].at(-1)!.value).toBe(51);
    expect(halves[1].animate!['to'][0].t).toBe(0);
  });

  it('can be saved when the server takes keyframes, and the server keeps them', async () => {
    const { el, port, page, settle, selectCounter, counterId } = await setup();
    await selectCounter();
    (el.querySelector('.row[data-param="to"] [data-testid="animate-go"]') as HTMLElement).click();
    await settle(() => expect(el.querySelectorAll('[data-testid="kf-row"]')).toHaveLength(1));
    (el.querySelector('[data-testid="save"]') as HTMLButtonElement).click();
    await settle(() => expect(el.querySelector('[data-testid="saved"]')).not.toBeNull());
    const stored = await firstValueFrom(port.piece('sample-piece'));
    expect(stored.script.pieces.find((p) => p.id === counterId())!.animate?.['to']).toHaveLength(2);
    expect(page.doc()).toBeTruthy();
  });

  it('blocks Save, with the reason, when the document has keyframes and the server does not take them, and Remove all keyframes frees it', async () => {
    const { el, q, settle, page } = await setup({ withKeyframes: true, hideFeature: true });
    await settle(() => expect(q('animate-blocked')).not.toBeNull());
    expect(q('animate-blocked')!.textContent).toContain('The server does not accept animated parameters');
    // make something else dirty so that it is the keyframes that hold Save back
    const first = page.doc().script.pieces[0];
    page.clock.seek((first.start + first.end) / 2);
    (el.querySelector('[data-testid="split"]') as HTMLElement).click();
    await settle(() => expect(q('dirty')).not.toBeNull());
    expect((q('save') as HTMLButtonElement).disabled).toBe(true);
    expect(q('save')!.getAttribute('title')).toContain('does not accept animated parameters');
    q('animate-blocked-remove')!.click();
    await settle(() => expect(q('animate-blocked')).toBeNull());
    expect((q('save') as HTMLButtonElement).disabled).toBe(false);
    expect(el.querySelectorAll('[data-testid="kf-row"]')).toHaveLength(0);
  });

  it('does not offer Animate to a server that does not take keyframes', async () => {
    const { el, settle, selectCounter } = await setup({ features: [] });
    await selectCounter();
    await settle(() => expect(el.querySelector('[data-testid="animate-go"]')).toBeNull());
  });
});
