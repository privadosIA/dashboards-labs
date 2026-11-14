import { TestBed } from '@angular/core/testing';
import { MOTION_EDIT_OPTIONS } from '../../core/options';
import { firstValueFrom } from 'rxjs';
import type { Catalog, PieceDetail, ScriptPiece } from '@lab/animation-core';
import { provideLabForms } from '@lab/forms-kit';
import type { Doc } from '@lab/motion-editor';
import { provideMotionParts } from '@lab/motion-parts';
import { InMemoryAnimation, MUSIC_MOTION_OPTIONS } from '@lab/music-motion';

import { stubStorage } from '../../../testing/memory-storage';
import type { EditRequest } from './edit';
import { Inspector } from './inspector';

async function setup(edit: (p: PieceDetail) => PieceDetail = (p) => p, selection: { piece: string; extra?: number } | null = { piece: 'p1' }, lang: 'es' | 'en' = 'en', locked = false, designOpen = true) {
  // The song's design is folded until the person opens it; the browser remembers that, so these specs start with it open unless they say otherwise.
  stubStorage({ 'motion-edit.lang': lang, ...(designOpen ? { 'motion-edit.open.song-design': '1' } : {}) });
  const port = new InMemoryAnimation({ stepMs: 100, pollMs: 10 });
  await firstValueFrom(port.loadSample());
  const piece = edit(await firstValueFrom(port.piece('sample-piece')));
  const catalog: Catalog = await firstValueFrom(port.catalog());
  TestBed.configureTestingModule({ providers: [{ provide: MOTION_EDIT_OPTIONS, useValue: { lang } }, { provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'motion-edit' } }, provideLabForms({ lang }), provideMotionParts({ lang })] });
  const fixture = TestBed.createComponent(Inspector);
  const doc: Doc = { design: piece.design.design, script: piece.script };
  fixture.componentRef.setInput('doc', doc);
  fixture.componentRef.setInput('piece', piece);
  fixture.componentRef.setInput('catalog', catalog);
  fixture.componentRef.setInput('selection', selection);
  fixture.componentRef.setInput('locked', locked);
  const requests: EditRequest[] = [];
  fixture.componentInstance.edit.subscribe((r) => requests.push(r));
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  /** What the document is after the last request, as the page would make it. */
  const after = (): Doc => requests.reduce((d, r) => r.fn(d), doc);
  const change = (node: Element | null, value: string) => {
    const field = node as HTMLInputElement | HTMLSelectElement;
    field.value = value;
    field.dispatchEvent(new Event(field.tagName === 'SELECT' || field instanceof HTMLInputElement && field.type === 'number' ? 'change' : 'input'));
    fixture.detectChanges();
  };
  return { fixture, el, requests, after, change, doc, piece, catalog };
}

const withPiece = (change: (p: ScriptPiece) => ScriptPiece) => (d: PieceDetail): PieceDetail => ({ ...d, script: { ...d.script, pieces: d.script.pieces.map((p, i) => (i === 0 ? change(p) : p)) } });

describe('Inspector, the song design', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is folded by default, so that the inspector does not tower over the page, and the heading opens it and is remembered', async () => {
    const { el, fixture } = await setup(undefined, null, 'en', false, false);
    expect(el.querySelector('app-design-panel')).toBeNull();
    const toggle = el.querySelector<HTMLButtonElement>('[data-testid="collapsible-song-design"] .toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    expect(el.querySelector('app-design-panel')).not.toBeNull();
    expect(localStorage.getItem('motion-edit.open.song-design')).toBe('1');
  });

  it('shows the design form with the typefaces the server knows, when nothing is selected', async () => {
    const { el, catalog, fixture } = await setup(undefined, null);
    expect(el.querySelector('[data-testid="song"]')).not.toBeNull();
    expect(el.querySelectorAll('.swatch')).toHaveLength(3);
    expect(el.querySelectorAll('mat-select').length).toBeGreaterThanOrEqual(4);
    const panel = fixture.debugElement.query((d) => d.name === 'app-design-panel').componentInstance as { schema: () => { fields: { key?: string; options?: { value: string }[] }[] } };
    const options = panel.schema().fields.find((f) => f.key === 'display')!.options!.map((o) => o.value);
    expect(options).toEqual(catalog.fonts);
    expect(options.length).toBeGreaterThan(1);
  });

  it('asks for a design with the typeface chosen, and only when the form is valid and the design changed', async () => {
    const { fixture, requests, after, doc } = await setup(undefined, null);
    const panel = fixture.debugElement.query((d) => d.name === 'app-design-panel').componentInstance as { changed: (m: Record<string, unknown>) => void; model: () => Record<string, unknown>; status: (s: string) => void };
    panel.changed(panel.model());
    expect(requests).toEqual([]);
    panel.changed({ ...panel.model(), display: 'Playfair Display', body: 'Inter' });
    expect(requests).toHaveLength(1);
    expect(requests[0].label).toBe('song-design');
    expect(after().design).toMatchObject({ display: 'Playfair Display', body: 'Inter', dark: doc.design.dark });
    panel.status('INVALID');
    panel.changed({ ...panel.model(), display: 'Bebas Neue' });
    expect(requests).toHaveLength(1);
  });

  it('shows the reason the server gave for the design, and says it in Spanish', async () => {
    const { fixture, el } = await setup(undefined, null, 'es');
    fixture.componentRef.setInput('refusedDesign', 'display "x" is not one of the typefaces');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="refused"]')!.textContent).toContain('El servidor rechazó el diseño:');
    expect(el.textContent).toContain('Diseño de la canción');
  });
});

describe('Inspector, a piece', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lets the part be chosen from the catalog, with that part\'s defaults, and not one an extra already draws', async () => {
    const { el, change, after } = await setup(withPiece((p) => ({ ...p, with: [{ part: 'toggle' }] })));
    const options = Array.from(el.querySelectorAll('select.part option')).map((o) => (o as HTMLOptionElement).value);
    expect(options).toContain('counter');
    expect(options).not.toContain('toggle');
    change(el.querySelector('select.part'), 'counter');
    expect(after().script.pieces[0]).toMatchObject({ part: 'counter', params: { to: 100 } });
  });

  it('shows the parameters of the part in a form that is not locked, and warns about a level the part does not support', async () => {
    const { el } = await setup(withPiece((p) => ({ ...p, part: 'wire-sphere' })));
    expect(el.querySelector('lab-part-params')).not.toBeNull();
    expect(el.querySelector('[data-testid="replaced"]')).not.toBeNull();
    const field = el.querySelector('lab-part-params input[id*="_detail_"]') as HTMLInputElement | null;
    expect(field?.disabled).toBeFalsy();
  });

  it('warns about a part that is not in the catalog', async () => {
    const { el } = await setup(withPiece((p) => ({ ...p, part: 'no-such-part' })));
    expect(el.querySelector('[data-testid="not-in-catalog"]')).not.toBeNull();
  });

  it('lists the live warnings about the selected piece and none about the others', async () => {
    const { el, fixture } = await setup();
    fixture.componentRef.setInput('warnings', [
      { kind: 'unknown-part', severity: 'warning', piece: 'p1', part: 'ghost' },
      { kind: 'param-range', severity: 'warning', piece: 'p2', param: 'count', limit: 5 },
    ]);
    fixture.detectChanges();
    const items = Array.from(el.querySelectorAll('[data-testid="warnings"] li')).map((li) => li.textContent);
    expect(items).toEqual(['The part "ghost" is not in the catalog.']);
  });

  it('chooses the mode: the section\'s, dark or light', async () => {
    const { el, change, after } = await setup(withPiece((p) => ({ ...p, mode: 'light' })));
    expect((el.querySelector('select.mode') as HTMLSelectElement).value).toBe('light');
    change(el.querySelector('select.mode'), '');
    expect(after().script.pieces[0].mode).toBeUndefined();
    change(el.querySelector('select.mode'), 'dark');
    expect(after().script.pieces[0].mode).toBe('dark');
  });

  it('adds a line of the song, a text of your own, and removes a line', async () => {
    const { el, change, after, fixture } = await setup(withPiece((p) => ({ ...p, lines: [{ line: 0 }] })));
    const songLines = Array.from(el.querySelectorAll('select.from-song option')).map((o) => (o as HTMLOptionElement).textContent);
    expect(songLines.length).toBeGreaterThan(1);
    change(el.querySelector('select.from-song'), el.querySelectorAll('select.from-song option')[1].getAttribute('value')!);
    expect(after().script.pieces[0].lines!.length).toBe(2);

    (el.querySelector('[data-testid="add-free"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const free = el.querySelector('input.free') as HTMLInputElement;
    free.value = 'My own words';
    (el.querySelector('[data-testid="add-free-go"]') as HTMLButtonElement).click();
    const lines = after().script.pieces[0].lines!;
    expect(lines.some((l) => l.text === 'My own words')).toBe(true);

    (el.querySelector('[data-testid="remove-line"]') as HTMLButtonElement).click();
    expect(after().script.pieces[0].lines!.length).toBe(lines.length - 1);
  });

  it('edits the text of a line (it becomes the person\'s own text) and its keyword', async () => {
    const { el, change, after } = await setup(withPiece((p) => ({ ...p, lines: [{ line: 0 }] })));
    change(el.querySelector('input.text'), 'A beat is everything');
    expect(after().script.pieces[0].lines![0]).toMatchObject({ text: 'A beat is everything' });
    expect(after().script.pieces[0].lines![0].line).toBeUndefined();
  });

  it('chooses the full-screen word from the words of the lines, and when it appears', async () => {
    const { el, change, after } = await setup(withPiece((p) => ({ ...p, lines: [{ line: 0 }] })));
    const words = Array.from(el.querySelectorAll('select.word option')).map((o) => (o as HTMLOptionElement).value);
    expect(words.length).toBeGreaterThan(1);
    change(el.querySelector('select.word'), words[1]);
    expect(after().script.pieces[0].hit).toMatchObject({ word: words[1] });
    change(el.querySelector('select.word'), '');
    expect(after().script.pieces[0].hit).toBeUndefined();
  });

  it('adds extra parts up to three, and removes one', async () => {
    const { el, change, after, fixture } = await setup();
    for (const part of ['toggle', 'counter', 'parallax-cards']) {
      change(el.querySelector('select.add-extra'), part);
      fixture.componentRef.setInput('doc', after());
      fixture.detectChanges();
    }
    expect(after().script.pieces[0].with!.map((w) => w.part)).toEqual(['toggle', 'counter', 'parallax-cards']);
    expect(el.querySelector('select.add-extra')).toBeNull();
    (el.querySelectorAll('[data-testid="remove-extra"]')[0] as HTMLButtonElement).click();
    expect(after().script.pieces[0].with!.map((w) => w.part)).toEqual(['counter', 'parallax-cards']);
  });

  it('edits an extra part by itself: its part and its parameters, with no lyrics', async () => {
    const { el, change, after } = await setup(withPiece((p) => ({ ...p, with: [{ part: 'toggle' }] })), { piece: 'p1', extra: 0 });
    expect(el.querySelector('h2')!.textContent).toBe('Extra 1: toggle');
    expect(el.querySelector('[data-testid="lines-editor"]')).toBeNull();
    change(el.querySelector('select.part'), 'counter');
    expect(after().script.pieces[0].with![0]).toMatchObject({ part: 'counter' });
  });

  it('shows the reason the server refused the piece, where the piece is', async () => {
    const { fixture, el } = await setup();
    fixture.componentRef.setInput('refusedPieces', { p1: 'piece p1: the keyword "x" is not a word of line 1' });
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="refused"]')!.textContent).toContain('The server refused piece p1: piece p1: the keyword');
  });

  it('edits nothing while the piece is being drawn', async () => {
    const { el } = await setup(undefined, { piece: 'p1' }, 'en', true);
    expect((el.querySelector('select.part') as HTMLSelectElement).disabled).toBe(true);
    expect((el.querySelector('select.mode') as HTMLSelectElement).disabled).toBe(true);
    expect((el.querySelector('select.add-extra') as HTMLSelectElement).disabled).toBe(true);
  });

  it('has a way back to the song\'s design', async () => {
    const { el, fixture } = await setup();
    let back = 0;
    fixture.componentInstance.deselect.subscribe(() => back++);
    (el.querySelector('[data-testid="to-song"]') as HTMLButtonElement).click();
    expect(back).toBe(1);
  });

  it('says its words in Spanish', async () => {
    const { el } = await setup(undefined, { piece: 'p1' }, 'es');
    expect(el.textContent).toContain('Letra que aparece');
    expect(el.textContent).toContain('Partes extra');
  });
});
