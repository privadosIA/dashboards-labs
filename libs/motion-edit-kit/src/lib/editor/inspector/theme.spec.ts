import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import type { Catalog, Design } from '@lab/animation-core';
import { provideLabForms } from '@lab/forms-kit';
import type { Doc } from '@lab/motion-editor';
import { provideMotionParts } from '@lab/motion-parts';
import { InMemoryAnimation, MUSIC_MOTION_OPTIONS } from '@lab/music-motion';

import { MOTION_EDIT_OPTIONS } from '../../core/options';
import { stubStorage } from '../../../testing/memory-storage';
import { MONACO } from '../code/code-pane/code-pane';
import type { EditRequest } from './edit';
import { Inspector } from './inspector';

/** The inspector on the sample piece, whose catalog lists, or not, the theme feature; nothing is selected unless `selection` says so. */
async function setup(features: readonly string[], options: { design?: (d: Design) => Design; selection?: { piece: string } | null } = {}) {
  stubStorage({ 'motion-edit.lang': 'en', 'motion-edit.open.song-design': '1' });
  const port = new InMemoryAnimation({ stepMs: 100, pollMs: 10, features });
  await firstValueFrom(port.loadSample());
  const piece = await firstValueFrom(port.piece('sample-piece'));
  const catalog: Catalog = await firstValueFrom(port.catalog());
  TestBed.configureTestingModule({
    providers: [
      { provide: MOTION_EDIT_OPTIONS, useValue: { lang: 'en' } },
      { provide: MUSIC_MOTION_OPTIONS, useValue: { lang: 'en', client: 'motion-edit' } },
      { provide: MONACO, useValue: () => Promise.reject(new Error('no monaco in tests')) },
      provideLabForms({ lang: 'en' }),
      provideMotionParts({ lang: 'en' }),
    ],
  });
  const fixture = TestBed.createComponent(Inspector);
  const doc: Doc = { design: (options.design ?? ((d) => d))(piece.design.design), script: piece.script };
  fixture.componentRef.setInput('doc', doc);
  fixture.componentRef.setInput('piece', piece);
  fixture.componentRef.setInput('catalog', catalog);
  fixture.componentRef.setInput('selection', options.selection ?? null);
  const requests: EditRequest[] = [];
  fixture.componentInstance.edit.subscribe((r) => requests.push(r));
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, requests, doc, after: () => requests.reduce((d, r) => r.fn(d), doc), q: (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`) };
}

const THEMED: (d: Design) => Design = (d) => ({ ...d, theme: { css: '#verse{color:red}', hud: { tl: 'LAB' } }, transitionSeconds: 0.3 });

describe('Inspector, the theme', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the theme under the song design when the server carries it, and not otherwise', async () => {
    expect((await setup(['theme'])).q('theme')).not.toBeNull();
    TestBed.resetTestingModule();
    expect((await setup(['animate', 'layers'])).q('theme')).toBeNull();
  });

  it('keeps the theme and the crossfade when the colours, the typefaces or the idea are edited', async () => {
    const { fixture, requests, after } = await setup(['theme'], { design: THEMED });
    const panel = fixture.debugElement.query((d) => d.name === 'app-design-panel').componentInstance as { changed(model: Record<string, unknown>): void; model: () => Record<string, unknown> };
    panel.changed({ ...panel.model(), accent: '#00aa88' });
    expect(requests).toHaveLength(1);
    const design = after().design;
    expect(design.accent).toBe('#00aa88');
    expect(design.theme).toEqual({ css: '#verse{color:red}', hud: { tl: 'LAB' } });
    expect(design.transitionSeconds).toBe(0.3);
  });

  it('puts a refusal of the theme at the theme and not in the general line of the design', async () => {
    const { fixture, q } = await setup(['theme'], { design: THEMED });
    fixture.componentRef.setInput('refusedDesign', 'design.theme.css: @import is not allowed');
    fixture.detectChanges();
    expect(q('theme-css-problem')!.textContent).toContain('@import is not allowed');
    expect(q('refused')).toBeNull();
    fixture.componentRef.setInput('refusedDesign', 'accent #ff0000 has less than the contrast it needs');
    fixture.detectChanges();
    expect(q('theme-css-problem')).toBeNull();
  });

  it('gives one piece a crossfade of its own and gives it back to the design\'s', async () => {
    const { q, after, fixture, requests } = await setup(['theme'], { design: THEMED, selection: { piece: 'p1' } });
    expect(q('piece-transition-value')!.textContent).toContain("The design's: 0.3 s");
    const range = q('piece-transition') as HTMLInputElement;
    range.value = '0';
    range.dispatchEvent(new Event('input'));
    expect((after().script.pieces[0] as { transition_seconds?: number }).transition_seconds).toBe(0);
    expect((after().script.pieces[1] as { transition_seconds?: number }).transition_seconds).toBeUndefined();
    expect(requests[0].label).toContain('piece-transition');
    fixture.componentRef.setInput('doc', after());
    fixture.detectChanges();
    expect(q('piece-transition-value')!.textContent).toContain('0 s');
    q('piece-transition-inherit')!.click();
    expect('transition_seconds' in after().script.pieces[0]).toBe(false);
  });

  it('draws no crossfade of its own for a piece when the catalog lacks the theme', async () => {
    const { q } = await setup(['animate'], { selection: { piece: 'p1' } });
    expect(q('piece-transition')).toBeNull();
  });
});
