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
let layerPart = '';

async function setup(options: { features?: string[]; withLayer?: boolean; hideFeature?: boolean; hideLayers?: boolean; range?: [number, number] } = {}) {
  stubStorage({ 'motion-edit.lang': 'en' });
  const port = new InMemoryAnimation({ stepMs: 100, pollMs: 10, ...(options.features ? { features: options.features } : {}) });
  await firstValueFrom(port.loadSample());
  if (options.withLayer) {
    const piece = await firstValueFrom(port.piece('sample-piece'));
    const end = piece.script.pieces[piece.script.pieces.length - 1].end;
    const used = new Set(piece.script.pieces.flatMap((p) => [p.part, ...(p.with ?? []).map((w) => w.part)]));
    layerPart = (await firstValueFrom(port.catalog())).parts.map((p) => p.name).find((n) => !used.has(n))!;
    await firstValueFrom(port.saveScript('sample-piece', { ...piece.script, layers: [{ id: 'one', items: [{ part: layerPart, start: options.range?.[0] ?? 1, end: Math.min(options.range?.[1] ?? 4, end) }] }] }));
  }
  // A server that stopped taking keyframes after the piece was saved with them.
  if (options.hideLayers) {
    const catalog = await firstValueFrom(port.catalog());
    vi.spyOn(port, 'catalog').mockReturnValue(of({ ...catalog, features: ['animate'] }));
  }
  if (options.hideFeature) {
    const catalog = await firstValueFrom(port.catalog());
    vi.spyOn(port, 'catalog').mockReturnValue(of({ ...catalog, features: [] }));
  }
  TestBed.configureTestingModule({
    providers: [
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
    selection: { (): { piece: string } | null; set(v: unknown): void };
    itemSelection: { (): { layer: string; item: number; param?: string; keyframe?: number } | null; set(v: unknown): void };
    doc(): { script: { pieces: { id: string; part: string; start: number; end: number; with?: { part: string }[] }[]; layers?: { id: string; items: { part: string; start: number; end: number; animate?: Record<string, { t: number; value: unknown }[]> }[] }[] } };
    clock: { seek(t: number): void };
    onPaletteDrop(drop: { item: unknown; time: number; lane: unknown }): void;
    onPaletteAddLayer(item: unknown): void;
    onPaletteReplace(item: unknown): void;
    removeSelected(): void;
  };
  await settle(() => expect(el.querySelector('lab-motion-timeline')).not.toBeNull());
  const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const drop = (name: string, time: number, lane: unknown) => page.onPaletteDrop({ item: { kind: 'part', name }, time, lane });
  const catalogParts = async () => (await firstValueFrom(port.catalog())).parts.map((p) => p.name);
  return { fixture, el, port, page, q, settle, drop, catalogParts };
}

describe('EditorPage, layers', () => {
  afterEach(() => vi.restoreAllMocks());

  it('drops a part under the lanes: a layer is made with an item, selected, and the inspector shows it', async () => {
    const { el, page, q, settle, drop, catalogParts } = await setup();
    const name = (await catalogParts()).find((n) => !page.doc().script.pieces.some((p) => p.part === n || p.with?.some((w) => w.part === n)))!;
    expect(el.querySelectorAll('[data-testid="layer-lane"]')).toHaveLength(0);
    drop(name, 3, 'new-layer');
    await settle(() => expect(el.querySelectorAll('[data-testid="layer-lane"]')).toHaveLength(1));
    const layer = page.doc().script.layers![0];
    expect(layer.items).toHaveLength(1);
    expect(layer.items[0]).toMatchObject({ part: name, start: 3 });
    expect(page.itemSelection()).toEqual({ layer: layer.id, item: 0 });
    await settle(() => expect(q('item-panel')).not.toBeNull());
    expect(q('dirty')).not.toBeNull();
    // the item is in the pages of the pieces it touches
    expect(el.querySelectorAll('[data-testid="item-block"]')).toHaveLength(1);
  });

  it('replaces the part of the chosen piece with the library button, and of the one under the playhead when none is chosen', async () => {
    const { page, settle, catalogParts } = await setup();
    const names = (await catalogParts()).filter((n) => !page.doc().script.pieces.some((p) => p.part === n || p.with?.some((w) => w.part === n)));
    page.selection.set({ piece: page.doc().script.pieces[0].id });
    page.onPaletteReplace({ kind: 'part', name: names[0] });
    await settle(() => expect(page.doc().script.pieces[0].part).toBe(names[0]));
    page.selection.set(null);
    page.clock.seek(8);
    page.onPaletteReplace({ kind: 'part', name: names[1] });
    await settle(() => expect(page.doc().script.pieces[1].part).toBe(names[1]));
    page.onPaletteReplace({ kind: 'text' });
    expect(page.doc().script.pieces[1].part).toBe(names[1]);
  });

  it('makes a layer item with the library button: a new layer, then more items in the layer of the chosen one', async () => {
    const { page, settle, catalogParts } = await setup();
    const names = (await catalogParts()).filter((n) => !page.doc().script.pieces.some((p) => p.part === n || p.with?.some((w) => w.part === n)));
    page.clock.seek(6);
    page.onPaletteAddLayer({ kind: 'part', name: names[1] });
    await settle(() => expect(page.doc().script.layers).toHaveLength(1));
    expect(page.doc().script.layers![0].items[0]).toMatchObject({ part: names[1], start: 6 });
    expect(page.itemSelection()).toEqual({ layer: page.doc().script.layers![0].id, item: 0 });
    // an item takes the room up to the next one, so the second goes before the first
    page.clock.seek(0);
    page.onPaletteAddLayer({ kind: 'part', name: names[0] });
    await settle(() => expect(page.doc().script.layers![0].items).toHaveLength(2));
    expect(page.doc().script.layers).toHaveLength(1);
    expect(page.doc().script.layers![0].items.map((it) => [it.part, it.start])).toEqual([[names[0], 0], [names[1], 6]]);
  });

  it('drops a part on the lane of a layer: an item after the others, never over one', async () => {
    const { page, q, settle, drop, catalogParts } = await setup({ withLayer: true });
    const names = (await catalogParts()).filter((n) => n !== layerPart && !page.doc().script.pieces.some((p) => p.part === n || p.with?.some((w) => w.part === n)));
    await settle(() => expect(page.doc().script.layers).toHaveLength(1));
    drop(names[0], 8, { layer: 0 });
    // the sample song is 12 s long: 8 s is free, the first item runs from 1 s to 4 s
    await settle(() => expect(page.doc().script.layers![0].items).toHaveLength(2));
    expect(page.doc().script.layers![0].items[1]).toMatchObject({ part: names[0], start: 8 });
    // on top of the first item: nothing changes, and it says so
    drop(names[1], 2, { layer: 0 });
    await settle(() => expect(q('notice')!.textContent).toContain('does not fit there'));
    expect(page.doc().script.layers![0].items).toHaveLength(2);
  });

  it('says so and changes nothing when the server does not take layers', async () => {
    const { el, page, q, settle, drop, catalogParts } = await setup({ features: ['animate'] });
    expect(el.querySelector('[data-testid="new-layer"]')).toBeNull();
    drop((await catalogParts())[0], 3, 'new-layer');
    await settle(() => expect(q('notice')!.textContent).toBe('The server does not accept layers.'));
    expect(page.doc().script.layers).toBeUndefined();
  });

  it('selecting a piece clears the item and the other way round', async () => {
    const { page, settle, q } = await setup({ withLayer: true });
    await settle(() => expect(page.doc().script.layers).toHaveLength(1));
    page.itemSelection.set({ layer: 'one', item: 0 });
    await settle(() => expect(q('item-panel')).not.toBeNull());
    page.selection.set({ piece: page.doc().script.pieces[0].id });
    await settle(() => expect(q('piece')).not.toBeNull());
    expect(page.itemSelection()).toBeNull();
    expect(q('item-panel')).toBeNull();
  });

  it('removes the selected item with Delete, and its keyframe first', async () => {
    const { page, settle, fixture } = await setup({ withLayer: true });
    await settle(() => expect(page.doc().script.layers).toHaveLength(1));
    page.itemSelection.set({ layer: 'one', item: 0 });
    fixture.detectChanges();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    await settle(() => expect(page.doc().script.layers![0].items).toEqual([]));
    expect(page.itemSelection()).toBeNull();
  });

  it('dims in the library the parts the selected item cannot take, with the server\'s reason', async () => {
    const { el, page, settle } = await setup({ withLayer: true });
    await settle(() => expect(page.doc().script.layers).toHaveLength(1));
    const main = page.doc().script.pieces[0].part;
    page.itemSelection.set({ layer: 'one', item: 0 });
    await settle(() => expect(el.querySelector(`[data-testid="palette-part"][data-part="${main}"] [data-testid="palette-why"]`)).not.toBeNull());
    expect(el.querySelector(`[data-testid="palette-part"][data-part="${main}"] [data-testid="palette-why"]`)!.textContent).toContain(`the part "${main}" is drawn twice`);
  });
});

describe('EditorPage, layers the server does not take', () => {
  afterEach(() => vi.restoreAllMocks());

  it('blocks Save with the reason and offers Remove all layers, which takes them away', async () => {
    const { el, page, q, settle, fixture } = await setup({ withLayer: true, hideLayers: true });
    await settle(() => expect(page.doc().script.layers).toHaveLength(1));
    // an edit makes the document dirty, so the button would be live but for the layers
    page.itemSelection.set({ layer: 'one', item: 0 });
    await settle(() => expect(q('layers-blocked')).not.toBeNull());
    expect(q('layers-blocked')!.textContent).toContain('The server does not accept layers');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    await settle(() => expect(q('dirty')).not.toBeNull());
    expect((q('save') as HTMLButtonElement).disabled).toBe(true);
    expect(q('save')!.getAttribute('title')).toBe('The server does not accept layers: remove the layers to be able to save.');
    expect(el.querySelector('[data-testid="new-layer"]')).toBeNull();
    (q('layers-blocked-remove') as HTMLElement).click();
    await settle(() => expect(q('layers-blocked')).toBeNull());
    expect(page.doc().script.layers).toBeUndefined();
    expect((q('save') as HTMLButtonElement).disabled).toBe(false);
    fixture.detectChanges();
  });
});

describe('EditorPage, the keys of an item', () => {
  afterEach(() => vi.restoreAllMocks());
  const press = (key: string, init: KeyboardEventInit = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
  const itemOf = (page: { doc(): { script: { layers?: { items: { start: number; end: number }[] }[] } } }, n = 0) => page.doc().script.layers![0].items[n];

  it('the arrows move the chosen item a tenth of a second, a second with Shift, as one step for a burst of presses', async () => {
    const { page, settle, q } = await setup({ withLayer: true });
    await settle(() => expect(page.doc().script.layers).toHaveLength(1));
    page.itemSelection.set({ layer: 'one', item: 0 });
    press('ArrowRight');
    await settle(() => expect(itemOf(page).start).toBeCloseTo(1.1, 2));
    press('ArrowRight');
    press('ArrowRight');
    await settle(() => expect(itemOf(page)).toMatchObject({ start: 1.3, end: 4.3 }));
    press('ArrowRight', { shiftKey: true });
    await settle(() => expect(itemOf(page)).toMatchObject({ start: 2.3, end: 5.3 }));
    press('ArrowLeft');
    await settle(() => expect(itemOf(page).start).toBeCloseTo(2.2, 2));
    // the presses are one step of the history: one undo takes all of them back
    (q('undo') as HTMLButtonElement).click();
    await settle(() => expect(itemOf(page).start).toBe(1));
  });

  it('Alt and the arrows change where the item ends, and it never gets shorter than half a second', async () => {
    const { page, settle } = await setup({ withLayer: true });
    await settle(() => expect(page.doc().script.layers).toHaveLength(1));
    page.itemSelection.set({ layer: 'one', item: 0 });
    press('ArrowRight', { altKey: true });
    await settle(() => expect(itemOf(page)).toMatchObject({ start: 1, end: 4.1 }));
    for (let i = 0; i < 4; i++) press('ArrowLeft', { altKey: true, shiftKey: true });
    await settle(() => expect(itemOf(page).end).toBeCloseTo(1.5, 2));
  });

  it('Ctrl+D copies an item that ends at a cut after it, selects the copy and takes the keys', async () => {
    const { page, settle } = await setup({ withLayer: true, range: [0, 6] });
    await settle(() => expect(page.doc().script.layers).toHaveLength(1));
    page.itemSelection.set({ layer: 'one', item: 0 });
    press('d', { ctrlKey: true });
    await settle(() => expect(page.doc().script.layers![0].items).toHaveLength(2));
    expect(itemOf(page, 1)).toMatchObject({ start: 6, end: 12 });
    expect(page.itemSelection()).toEqual({ layer: 'one', item: 1 });
  });

  it('says why a copy would break the server\'s rules instead of making it, in its words', async () => {
    const { page, settle, q } = await setup({ withLayer: true });
    await settle(() => expect(page.doc().script.layers).toHaveLength(1));
    page.itemSelection.set({ layer: 'one', item: 0 });
    press('d', { metaKey: true });
    await settle(() => expect(q('notice')!.textContent).toContain('is drawn twice'));
    expect(page.doc().script.layers![0].items).toHaveLength(1);
  });

  it('leaves the arrows to the playhead when no item is chosen, and to the field when typing', async () => {
    const { page, settle, fixture } = await setup({ withLayer: true });
    await settle(() => expect(page.doc().script.layers).toHaveLength(1));
    press('ArrowRight');
    expect(itemOf(page).start).toBe(1);
    page.itemSelection.set({ layer: 'one', item: 0 });
    fixture.detectChanges();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(itemOf(page).start).toBe(1);
    input.remove();
  });
});
