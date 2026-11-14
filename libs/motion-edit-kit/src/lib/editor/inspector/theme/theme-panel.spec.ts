import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import type { Catalog, Design, PieceDetail } from '@lab/animation-core';
import { provideLabForms } from '@lab/forms-kit';
import type { Doc } from '@lab/motion-editor';
import { InMemoryAnimation } from '@lab/music-motion';

import { MOTION_EDIT_OPTIONS } from '../../../core/options';
import { stubStorage } from '../../../../testing/memory-storage';
import { MONACO } from '../../code/code-pane/code-pane';
import type { EditRequest } from '../edit';
import { ThemePanel } from './theme-panel';

type Internals = { pick(e: unknown): Promise<void>; hudChanged(m: Record<string, string>): void; setTransition(e: unknown): void; frame(): void };

/** The panel on a piece of the in-memory adapter; Monaco is left out, so the stylesheet is the plain text box. */
async function setup(options: { design?: (d: Design) => Design; refused?: string; lang?: 'es' | 'en' } = {}) {
  const lang = options.lang ?? 'en';
  stubStorage({ 'motion-edit.lang': lang });
  const port = new InMemoryAnimation({ stepMs: 100, pollMs: 10 });
  await firstValueFrom(port.loadSample());
  const piece: PieceDetail = await firstValueFrom(port.piece('sample-piece'));
  const catalog: Catalog = await firstValueFrom(port.catalog());
  TestBed.configureTestingModule({
    providers: [{ provide: MOTION_EDIT_OPTIONS, useValue: { lang } }, { provide: MONACO, useValue: () => Promise.reject(new Error('no monaco in tests')) }, provideLabForms({ lang })],
  });
  const fixture = TestBed.createComponent(ThemePanel);
  const doc: Doc = { design: (options.design ?? ((d) => d))(piece.design.design), script: piece.script };
  fixture.componentRef.setInput('design', doc.design);
  fixture.componentRef.setInput('script', doc.script);
  fixture.componentRef.setInput('catalog', catalog);
  fixture.componentRef.setInput('refused', options.refused ?? '');
  const requests: EditRequest[] = [];
  fixture.componentInstance.edit.subscribe((r) => requests.push(r));
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const q = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const after = (): Doc => requests.reduce((d, r) => r.fn(d), doc);
  const inner = fixture.componentInstance as unknown as Internals;
  return { fixture, el, q, requests, after, inner, doc, catalog };
}

/** What a file input hands over when one SVG was chosen. */
const file = (name: string, text: string) => ({ target: { files: [new File([text], name, { type: 'image/svg+xml' })], value: 'x' } });

const SVG = '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';

describe('ThemePanel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('edits the stylesheet in a plain box when Monaco is not there, and counts it', async () => {
    const { q, after, requests, fixture } = await setup();
    const box = q('theme-css') as HTMLTextAreaElement;
    expect(box.hidden).toBe(false);
    box.value = '#verse { color: hotpink }';
    box.dispatchEvent(new Event('input'));
    expect(after().design.theme).toEqual({ css: '#verse { color: hotpink }' });
    expect(requests[0].label).toBe('theme-css');
    fixture.componentRef.setInput('design', after().design);
    fixture.detectChanges();
    expect(q('theme-css-count')!.textContent).toContain('25 of 20480');
  });

  it('shows the server\'s reason at the stylesheet and only there', async () => {
    const { q } = await setup({ refused: 'design.theme.css: @import is not allowed' });
    expect(q('theme-css-problem')!.textContent).toContain('@import is not allowed');
    expect(q('theme-assets-problem')).toBeNull();
    expect(q('theme-hud-problem')).toBeNull();
  });

  it('adds a drawing under the name of its file, shows its thumbnail, and removes it', async () => {
    const { q, inner, after, fixture, el } = await setup();
    await inner.pick(file('My Mascot.svg', SVG));
    fixture.detectChanges();
    expect((q('theme-asset-name') as HTMLInputElement).value).toBe('my_mascot');
    q('theme-asset-add')!.click();
    expect(after().design.theme!.assets).toEqual({ my_mascot: SVG });
    fixture.componentRef.setInput('design', after().design);
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid="theme-asset"]')).toHaveLength(1);
    expect(el.querySelector('[data-testid="theme-asset"] img')!.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(q('theme-asset-pending')).toBeNull();
    const doc = after();
    q('theme-asset-remove')!.click();
    // the removal is the last request: replaying all of them leaves no theme at all
    expect('theme' in after()).toBe(false);
    expect(doc.design.theme!.assets).toEqual({ my_mascot: SVG });
  });

  it('refuses what the server would refuse, in words: not an SVG, too big, a bad name, a name taken', async () => {
    const { q, inner, fixture } = await setup({ design: (d) => ({ ...d, theme: { assets: { taken: SVG } } }) });
    await inner.pick(file('note.svg', '<div>no</div>'));
    fixture.detectChanges();
    expect(q('theme-asset-error')!.textContent).toContain('not an SVG');
    await inner.pick(file('big.svg', `<svg>${'x'.repeat(51200)}</svg>`));
    fixture.detectChanges();
    expect(q('theme-asset-error')!.textContent).toContain('over 50 KB');
    await inner.pick(file('taken.svg', SVG));
    fixture.detectChanges();
    q('theme-asset-add')!.click();
    fixture.detectChanges();
    expect(q('theme-asset-error')!.textContent).toContain('with that name already');
    const name = q('theme-asset-name') as HTMLInputElement;
    name.value = 'Bad Name';
    name.dispatchEvent(new Event('input'));
    q('theme-asset-add')!.click();
    fixture.detectChanges();
    expect(q('theme-asset-error')!.textContent).toContain('lower case letters');
  });

  it('writes the corner texts, keeping only what has something, and shows the server\'s reason for them', async () => {
    const { inner, after, q, fixture } = await setup({ refused: 'design.theme.hud.tl: it must be text of up to 40 characters' });
    inner.hudChanged({ tl: 'SIGNAL 01', tr: '', bl: '', br: 'LAB' });
    expect(after().design.theme!.hud).toEqual({ tl: 'SIGNAL 01', br: 'LAB' });
    expect(q('theme-hud-problem')!.textContent).toContain('up to 40 characters');
    // the page gives the design back to the panel, as it does after every edit
    fixture.componentRef.setInput('design', after().design);
    fixture.detectChanges();
    inner.hudChanged({ tl: '', tr: '', bl: '', br: '' });
    expect(after().design.theme).toBeUndefined();
  });

  it('lists the typefaces the server carries, with their licence and weights', async () => {
    const { q, catalog } = await setup();
    const families = Object.values(catalog.fontFiles ?? {});
    if (families.length === 0) return expect(q('theme-fonts')).toBeNull();
    expect(q('theme-fonts')!.textContent).toContain(families[0].family);
    expect(q('theme-fonts')!.textContent).toContain(families[0].licence);
  });

  it('sets the crossfade with the slider, from 0 to 2 seconds, and a cut takes it out of the design', async () => {
    const { q, after, requests } = await setup();
    const range = q('theme-transition-range') as HTMLInputElement;
    expect(range.max).toBe('2');
    range.value = '0.4';
    range.dispatchEvent(new Event('input'));
    expect(after().design.transitionSeconds).toBe(0.4);
    expect(requests[0].label).toBe('transition');
    range.value = '0';
    range.dispatchEvent(new Event('input'));
    expect('transitionSeconds' in after().design).toBe(false);
  });

  it('adds the frame as one edit over the song, and says when it is there already', async () => {
    const { q, after, fixture, requests } = await setup();
    q('theme-frame-preset')!.click();
    expect(requests).toHaveLength(1);
    const layers = after().script.layers!;
    expect(layers.flatMap((l) => l.items.map((i) => i.part))).toEqual(['hud-chrome', 'grain']);
    expect(layers.every((l) => l.items[0].start === 0)).toBe(true);
    fixture.detectChanges();
    expect(q('theme-frame-note')!.textContent).toContain('Frame layers added');
    fixture.componentRef.setInput('script', after().script);
    fixture.detectChanges();
    q('theme-frame-preset')!.click();
    fixture.detectChanges();
    expect(requests).toHaveLength(1);
    expect(q('theme-frame-note')!.textContent).toContain('already');
  });
});
