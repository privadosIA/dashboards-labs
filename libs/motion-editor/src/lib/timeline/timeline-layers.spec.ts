import { TestBed } from '@angular/core/testing';

import type { Catalog, Keyframe, Script, SongMap } from '@lab/animation-core';

import { MOTION_EDITOR_LANG } from '../provide-motion-editor';
import { itemKeyframeRows, layerLanes } from './layer-lanes';
import type { ItemSelection } from './selection';
import { MotionTimeline, type TimelineEdit } from './timeline';

const MAP: SongMap = {
  duration: 120,
  bpm: 120,
  beats: Array.from({ length: 240 }, (_, i) => i * 0.5),
  beatBase: 0,
  gridAnchored: true,
  sections: [{ tag: 'verse', start: 0, end: 60 }],
  words: [],
  wordsEstimated: false,
  loudnessHop: 0.5,
  loudness: [],
};

const kf = (t: number, value: Keyframe['value'], ease?: Keyframe['ease']): Keyframe => ({ t, value, ...(ease ? { ease } : {}) });

const SCRIPT: Script = {
  version: 1,
  pieces: [
    { id: 'p1', start: 0, end: 40, part: 'counter' },
    { id: 'p2', start: 40, end: 120, part: 'toggle' },
  ],
  layers: [
    { id: 'strip', items: [{ part: 'stamp', start: 10, end: 20 }, { part: 'timeline-strip', start: 30, end: 50, animate: { weight: [kf(0, 1), kf(10, 3)] } }] },
    { id: 'top', items: [{ part: 'stamp', start: 60, end: 70 }] },
  ],
};
const CATALOG = {
  parts: [
    { name: 'counter', params: [] },
    { name: 'toggle', params: [] },
    { name: 'stamp', params: [] },
    { name: 'timeline-strip', params: [{ name: 'weight', type: 'int' }] },
  ],
  features: ['layers'],
} as unknown as Catalog;

function setup(script: Script = SCRIPT, catalog: Catalog = CATALOG) {
  TestBed.configureTestingModule({ providers: [{ provide: MOTION_EDITOR_LANG, useValue: 'en' }] });
  const fixture = TestBed.createComponent(MotionTimeline);
  fixture.componentRef.setInput('songMap', MAP);
  fixture.componentRef.setInput('script', script);
  fixture.componentRef.setInput('zoom', 10);
  fixture.componentRef.setInput('catalog', catalog);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const edits: TimelineEdit[] = [];
  const picks: (ItemSelection | null)[] = [];
  const refusals: string[] = [];
  fixture.componentInstance.edit.subscribe((e) => edits.push(e));
  fixture.componentInstance.selectItem.subscribe((s) => picks.push(s));
  fixture.componentInstance.itemRefused.subscribe((r) => refusals.push(r));
  const lanes = el.querySelector('.lanes') as HTMLElement;
  const at = (type: string, clientX: number, init: MouseEventInit = {}) => lanes.dispatchEvent(new MouseEvent(type, { clientX, bubbles: true, ...init }));
  const blocks = (layer: string) => Array.from(el.querySelectorAll(`[data-layer="${layer}"] [data-testid="item-block"]`)) as SVGElement[];
  const last = () => edits.filter((e) => e.change).at(-1)!.change!(script);
  const press = (target: Element, x: number) => target.dispatchEvent(new MouseEvent('pointerdown', { clientX: x, bubbles: true, button: 0 }));
  return { fixture, el, edits, picks, refusals, lanes, at, blocks, last, press };
}

describe('the parts a page draws', () => {
  it('are counted on a block only when the page is close to what the server takes', () => {
    const many: Script = { ...SCRIPT, pieces: [{ id: 'p1', start: 0, end: 40, part: 'counter', with: [{ part: 'a' }, { part: 'b' }, { part: 'c' }] }, { id: 'p2', start: 40, end: 120, part: 'toggle' }], layers: [{ id: 'x', items: [{ part: 'stamp', start: 5, end: 9 }, { part: 'timeline-strip', start: 10, end: 20 }] }] };
    const ctx = setup(many);
    const notes = Array.from(ctx.el.querySelectorAll('[data-testid="page-parts"]')).map((n) => n.childNodes[0].textContent!.trim());
    expect(notes).toEqual(['6/8']);
    expect(ctx.el.querySelector('[data-testid="page-parts"] title')!.textContent).toBe('The page of this piece draws 6 parts (the server takes 8)');
    TestBed.resetTestingModule();
    expect(setup().el.querySelector('[data-testid="page-parts"]')).toBeNull();
  });
});

describe('the order of the layers', () => {
  const label = (ctx: ReturnType<typeof setup>, n: number) => ctx.el.querySelectorAll('[data-testid="layer-label"]')[n] as HTMLElement;
  const fire = (target: HTMLElement, type: string, clientY: number, init: MouseEventInit = {}) => target.dispatchEvent(new MouseEvent(type, { clientY, bubbles: true, button: 0, ...init }));

  it('is changed by dragging the label of a layer over the other, in one change', () => {
    const ctx = setup();
    const l = label(ctx, 0);
    fire(l, 'pointerdown', 100);
    fire(l, 'pointermove', 125); // a lane is 22 px: one place down
    ctx.fixture.detectChanges();
    expect(ctx.el.querySelector('.layer-lane.reorder-target')).not.toBeNull();
    fire(l, 'pointerup', 125);
    expect(ctx.edits.map((e) => e.phase)).toEqual(['apply']);
    expect(ctx.last().layers!.map((x) => x.id)).toEqual(['top', 'strip']);
  });

  it('does nothing for a click, a drag that ends where it began, or while locked', () => {
    const ctx = setup();
    fire(label(ctx, 0), 'pointerdown', 100);
    fire(label(ctx, 0), 'pointerup', 101);
    fire(label(ctx, 1), 'pointerdown', 100);
    fire(label(ctx, 1), 'pointermove', 140);
    fire(label(ctx, 1), 'pointerup', 140); // beyond the last place: it stays the last
    expect(ctx.edits).toEqual([]);
    ctx.fixture.componentRef.setInput('locked', true);
    fire(label(ctx, 0), 'pointerdown', 100);
    fire(label(ctx, 0), 'pointermove', 130);
    fire(label(ctx, 0), 'pointerup', 130);
    expect(ctx.edits).toEqual([]);
  });

  it('is changed with Alt and the arrow keys, and not past the ends', () => {
    const ctx = setup();
    label(ctx, 1).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }));
    expect(ctx.last().layers!.map((x) => x.id)).toEqual(['top', 'strip']);
    label(ctx, 0).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }));
    label(ctx, 1).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }));
    label(ctx, 0).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(ctx.edits).toHaveLength(1);
  });
});

describe('the zoom to fit the song', () => {
  it('makes the whole song fit the window', () => {
    const ctx = setup();
    const before = ctx.fixture.componentInstance.zoom();
    (ctx.el.querySelector('[data-testid="zoom-fit"]') as HTMLElement).click();
    ctx.fixture.detectChanges();
    const after = ctx.fixture.componentInstance.zoom();
    expect(after).not.toBe(before);
    const view = (ctx.el.querySelector('.scroller') as HTMLElement).clientWidth || 1000;
    expect(after * MAP.duration).toBeLessThanOrEqual(view);
  });
});

describe('layer lanes', () => {
  it('lists the lanes in drawing order, and the rows of the animated parameters of the items', () => {
    expect(layerLanes(SCRIPT).map((l) => [l.id, l.index, l.items.length])).toEqual([['strip', 0, 2], ['top', 1, 1]]);
    expect(itemKeyframeRows(SCRIPT).map((r) => [r.key, r.start, r.end])).toEqual([['strip:1:weight', 30, 50]]);
  });
});

describe('the layer lanes of the timeline', () => {
  it('draws a lane for each layer, labelled, with a block for each item', () => {
    const { el, blocks } = setup();
    expect(Array.from(el.querySelectorAll('[data-testid="layer-label"]')).map((l) => l.textContent?.trim())).toEqual(['Layer 1 · strip', 'Layer 2 · top']);
    expect(blocks('strip').map((b) => b.textContent?.trim())).toEqual(['stamp', 'timeline-strip']);
    expect(blocks('top')).toHaveLength(1);
  });

  it('offers the space for a new layer only when the server takes layers and there are fewer than four', () => {
    expect(setup().el.querySelector('[data-testid="new-layer"]')).not.toBeNull();
    TestBed.resetTestingModule();
    expect(setup(SCRIPT, { ...CATALOG, features: [] } as Catalog).el.querySelector('[data-testid="new-layer"]')).toBeNull();
    TestBed.resetTestingModule();
    const four: Script = { ...SCRIPT, layers: ['a', 'b', 'c', 'd'].map((id) => ({ id, items: [] })) };
    const ctx = setup(four);
    expect(ctx.el.querySelectorAll('[data-testid="layer-lane"]')).toHaveLength(4);
    expect(ctx.el.querySelector('[data-testid="new-layer"]')).toBeNull();
  });

  it('draws no lane for a script without layers', () => {
    expect(setup({ version: 1, pieces: SCRIPT.pieces }).el.querySelectorAll('[data-testid="layer-lane"]')).toHaveLength(0);
  });

  it('selects an item on a click', () => {
    const ctx = setup();
    ctx.blocks('strip')[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(ctx.picks.at(-1)).toEqual({ layer: 'strip', item: 1 });
  });

  describe('dragging an item', () => {
    it('moves it with the magnet, keeping its length, and selects it; one step of the history', () => {
      const ctx = setup();
      ctx.press(ctx.blocks('top')[0], 650);
      ctx.at('pointermove', 701);
      ctx.at('pointerup', 701);
      expect(ctx.edits.map((e) => e.phase)).toEqual(['begin', 'update', 'end']);
      expect(ctx.last().layers![1].items[0]).toMatchObject({ start: 65, end: 75 });
      expect(ctx.picks.at(-1)).toEqual({ layer: 'top', item: 0 });
    });

    it('sticks an edge to a cut of the pieces within a few pixels, before the beat the magnet would give', () => {
      const script: Script = { ...SCRIPT, layers: [{ id: 'c', items: [{ part: 'stamp', start: 5, end: 10 }] }] };
      const ctx = setup(script);
      ctx.press(ctx.blocks('c')[0], 50);
      ctx.at('pointermove', 405); // the start would be 40.5 s: the beat is there, the cut at 40 s is within 8 px
      expect(ctx.last().layers![0].items[0]).toMatchObject({ start: 40, end: 45 });
      ctx.at('pointermove', 600); // far from every cut: the beat
      expect(ctx.last().layers![0].items[0].start).toBe(60);
    });

    it('is stopped by its neighbours: never over the next item of its lane', () => {
      const ctx = setup();
      ctx.press(ctx.blocks('strip')[0], 150);
      ctx.at('pointermove', 500);
      expect(ctx.last().layers![0].items[0]).toMatchObject({ start: 20, end: 30 });
    });

    it('does nothing while locked, and a press that hardly moves is a click', () => {
      const ctx = setup();
      ctx.press(ctx.blocks('top')[0], 650);
      ctx.at('pointermove', 651);
      ctx.at('pointerup', 651);
      expect(ctx.edits).toEqual([]);
      TestBed.resetTestingModule();
      const locked = setup();
      locked.fixture.componentRef.setInput('locked', true);
      locked.press(locked.blocks('top')[0], 650);
      locked.at('pointermove', 700);
      expect(locked.edits).toEqual([]);
    });

    it('says why it stopped when the server would refuse the move (a part drawn twice on a page), in its words', () => {
      const script: Script = { ...SCRIPT, pieces: [{ id: 'p1', start: 0, end: 40, part: 'stamp' }, { id: 'p2', start: 40, end: 120, part: 'toggle' }], layers: [{ id: 'a', items: [{ part: 'stamp', start: 50, end: 60 }] }] };
      const ctx = setup(script);
      ctx.press(ctx.blocks('a')[0], 550);
      ctx.at('pointermove', 100); // into p1, which already draws the stamp
      expect(ctx.refusals.at(-1)).toBe('piece "p1" (#1): the part "stamp" is drawn twice (the main part and layer "a" item #1)');
      expect(ctx.last().layers![0].items[0]).toMatchObject({ start: 50, end: 60 });
      ctx.at('pointermove', 600);
      expect(ctx.refusals.at(-1)).toBe('');
    });
  });

  describe('resizing an item by its ends', () => {
    it('moves the end, held by the next item', () => {
      const ctx = setup();
      ctx.press(ctx.el.querySelector('[data-layer="strip"] [data-testid="item-end"]')!, 200);
      ctx.at('pointermove', 250);
      expect(ctx.last().layers![0].items[0]).toMatchObject({ start: 10, end: 25 });
      ctx.at('pointermove', 400);
      expect(ctx.last().layers![0].items[0]).toMatchObject({ start: 10, end: 30 });
    });

    it('moves the start, at least half a second from the end', () => {
      const ctx = setup();
      ctx.press(ctx.el.querySelector('[data-layer="strip"] [data-testid="item-start"]')!, 100);
      ctx.at('pointermove', 300);
      expect(ctx.last().layers![0].items[0]).toMatchObject({ start: 19.5, end: 20 });
    });
  });

  it('marks an item the live checks found a problem with, with the server\'s words', () => {
    const ctx = setup();
    ctx.fixture.componentRef.setInput('warnings', [{ kind: 'layer-problem', severity: 'warning', layer: 'strip', item: 1, text: 'layer "strip" item #2 overlaps item #1 (items of a layer follow one another, in order)' }]);
    ctx.fixture.detectChanges();
    const marks = ctx.el.querySelectorAll('[data-testid="item-warn-mark"]');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toContain('layer "strip" item #2 overlaps item #1');
  });

  it('removes the selected item from its close mark', () => {
    const ctx = setup();
    const removed: unknown[] = [];
    ctx.fixture.componentInstance.removeItem.subscribe((s) => removed.push(s));
    ctx.fixture.componentRef.setInput('itemSelection', { layer: 'top', item: 0 });
    ctx.fixture.detectChanges();
    (ctx.blocks('top')[0].querySelector('.close') as SVGElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(removed).toEqual([{ layer: 'top', item: 0 }]);
  });

  describe('the keyframe rows of the items', () => {
    const row = (ctx: ReturnType<typeof setup>) => ctx.el.querySelector('[data-testid="item-kf-row"]') as SVGElement;

    it('draws one for each animated parameter of an item, with times from the item\'s start', () => {
      const ctx = setup();
      expect(Array.from(ctx.el.querySelectorAll('[data-testid="item-kf-label"]')).map((l) => l.textContent?.trim())).toEqual(['◆ strip #2 · weight']);
      expect(row(ctx).querySelectorAll('[data-testid="kf"]')).toHaveLength(2);
    });

    it('selects a keyframe, moves it inside the item and adds one by a double click', () => {
      const ctx = setup();
      const diamonds = Array.from(row(ctx).querySelectorAll('[data-testid="kf"]'));
      diamonds[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(ctx.picks.at(-1)).toEqual({ layer: 'strip', item: 1, param: 'weight', keyframe: 1 });
      ctx.press(diamonds[1], 400);
      ctx.at('pointermove', 440);
      expect(ctx.last().layers![0].items[1].animate!['weight'].map((k) => k.t)).toEqual([0, 14]);
      TestBed.resetTestingModule();
      const again = setup();
      row(again).dispatchEvent(new MouseEvent('dblclick', { clientX: 350, bubbles: true }));
      expect(again.last().layers![0].items[1].animate!['weight'].map((k) => k.t)).toEqual([0, 5, 10]);
      expect(again.picks.at(-1)).toEqual({ layer: 'strip', item: 1, param: 'weight', keyframe: 1 });
    });
  });

  describe('where a drop lands', () => {
    const over = (ctx: ReturnType<typeof setup>, y: number) => {
      const data = { types: ['application/x-motion-palette-item'], getData: () => '{"kind":"part","name":"stamp"}', dropEffect: '' };
      const event = new Event('dragover', { bubbles: true, cancelable: true }) as unknown as DragEvent;
      Object.defineProperty(event, 'dataTransfer', { value: data });
      Object.defineProperty(event, 'clientX', { value: 300 });
      Object.defineProperty(event, 'clientY', { value: y });
      ctx.lanes.dispatchEvent(event);
      ctx.fixture.detectChanges();
      return ctx.el.querySelector('[data-testid="drop-line"]')?.getAttribute('data-lane');
    };
    // ruler 24 + sections 20 + loudness 40 + words 20 = 104; main 36; three extras of 22 = 66; layers of 22
    it('names the layer lane under the pointer, and the space under the lanes for a new one', () => {
      const ctx = setup();
      expect(over(ctx, 104 + 36 + 66 + 5)).toBe('layer-0');
      expect(over(ctx, 104 + 36 + 66 + 22 + 5)).toBe('layer-1');
      expect(over(ctx, 104 + 36 + 66 + 44 + 5)).toBe('new-layer');
      expect(over(ctx, 104 + 36 + 66 + 44 + 18 + 30)).toBe('other');
    });
  });
});
