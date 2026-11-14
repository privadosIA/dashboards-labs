import { provideHttpClient } from '@angular/common/http';
import { MOTION_EDIT_OPTIONS } from '../../core/options';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import type { PieceDetail } from '@lab/animation-core';
import { ANIMATION, InMemoryAnimation } from '@lab/music-motion';
import { provideServerConnection } from '@lab/server-connection';

import { stubStorage } from '../../../testing/memory-storage';
import { Actions } from './actions';
import { datasetFileName } from './save-text';

async function setup(edit: (p: PieceDetail) => PieceDetail = (p) => p, lang: 'es' | 'en' = 'en') {
  stubStorage({ 'motion-edit.lang': lang });
  const port = new InMemoryAnimation({ stepMs: 100, pollMs: 10 });
  await firstValueFrom(port.loadSample());
  const piece = edit(await firstValueFrom(port.piece('sample-piece')));
  TestBed.configureTestingModule({ providers: [{ provide: MOTION_EDIT_OPTIONS, useValue: { lang } }, provideHttpClient(), provideServerConnection({ lang }), { provide: ANIMATION, useValue: port }] });
  const fixture = TestBed.createComponent(Actions);
  fixture.componentRef.setInput('piece', piece);
  fixture.detectChanges();
  const started: number[] = [];
  fixture.componentInstance.started.subscribe(() => started.push(1));
  return { fixture, el: fixture.nativeElement as HTMLElement, port, started, piece };
}

const click = async (fixture: { detectChanges(): void; whenStable(): Promise<unknown> }, el: HTMLElement, id: string) => {
  (el.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement).click();
  await fixture.whenStable();
  fixture.detectChanges();
};

describe('datasetFileName', () => {
  it('names the file after the title in plain letters', () => {
    expect(datasetFileName('Canción de Ñandú / 2')).toBe('cancion-de-nandu-2.motion.json');
    expect(datasetFileName('???')).toBe('animation.motion.json');
  });
});

describe('Actions', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('exports the dataset of the piece as a file named after its title', async () => {
    const saved: { name: string; type: string; text: string }[] = [];
    vi.stubGlobal('URL', { createObjectURL: (b: Blob) => (saved.push({ name: '', type: b.type, text: '' }), 'blob:x'), revokeObjectURL: () => undefined });
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this.download);
    });
    const { fixture, el } = await setup();
    await click(fixture, el, 'export');
    await vi.waitFor(() => expect(clicks).toEqual(['sample-beat.motion.json']));
    fixture.detectChanges();
    expect(saved[0].type).toBe('application/json');
    expect(el.querySelector('[data-testid="saved"]')!.textContent).toBe('Saved as sample-beat.motion.json.');
    vi.restoreAllMocks();
  });

  it('says why an export failed', async () => {
    const { fixture, el, port } = await setup();
    vi.spyOn(port, 'piece').mockReturnValue(throwError(() => new Error('the server said no')));
    await click(fixture, el, 'export');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="export-refused"]')!.textContent).toBe('Could not export: the server said no');
    });
  });

  it('shows the estimate as an estimate and asks the server to draw, telling the page it started', async () => {
    const { fixture, el, port, started } = await setup();
    expect(el.querySelector('[data-testid="estimate"]')!.textContent).toMatch(/^Estimate \(may vary\): \d+:\d\d · \d+ frames$/);
    const render = vi.spyOn(port, 'render');
    await click(fixture, el, 'render');
    await vi.waitFor(() => expect(started).toHaveLength(1));
    expect(render).toHaveBeenCalledWith('sample-piece');
  });

  it('says why the server did not start the drawing', async () => {
    const { fixture, el, port } = await setup();
    vi.spyOn(port, 'render').mockReturnValue(throwError(() => new Error('no browser')));
    await click(fixture, el, 'render');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="render-refused"]')!.textContent).toBe('Could not start drawing: no browser');
    });
  });

  it('keeps Render off and shows the progress while the piece is being drawn', async () => {
    const { el } = await setup((p) => ({ ...p, state: 'running', progress: 40 }));
    expect((el.querySelector('[data-testid="render"]') as HTMLButtonElement).disabled).toBe(true);
    expect(el.querySelector('[data-testid="progress"]')!.textContent).toBe('40% drawn');
  });

  it('keeps Render off while a proposal is being written', async () => {
    const { el } = await setup((p) => ({ ...p, proposal: { state: 'writing' } as never }));
    expect((el.querySelector('[data-testid="render"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('offers the video of a finished piece, and the reason of a failed one', async () => {
    const done = await setup((p) => ({ ...p, state: 'done', video: 'samples/music-motion/sample.mp4' }));
    expect(done.el.querySelector('[data-testid="video"]')!.getAttribute('href')).toBe('samples/music-motion/sample.mp4');
    TestBed.resetTestingModule();
    const failed = await setup((p) => ({ ...p, state: 'failed', error: 'no chrome', video: undefined }));
    expect(failed.el.querySelector('[data-testid="piece-failed"]')!.textContent).toBe('The drawing failed: no chrome');
    expect(failed.el.querySelector('[data-testid="video"]')).toBeNull();
  });

  it('says its words in Spanish', async () => {
    const { el } = await setup(undefined, 'es');
    expect(el.textContent).toContain('Exportar dataset');
    expect(el.textContent).toContain('Estimación (puede variar)');
  });
});
