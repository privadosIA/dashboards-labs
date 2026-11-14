import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { sampleDocument } from '../../testing/sample-document';
import { findNode } from '../model/tree';
import { provideVectorEditor } from '../provide-vector-editor';
import { VectorStore } from '../store/vector-store';
import { animatedNodes, rowsFor, ticks, timeAt } from './rows';
import { VectorTimeline } from './timeline';

function setup(lang: 'es' | 'en' = 'en') {
  const store = new VectorStore(sampleDocument());
  TestBed.configureTestingModule({ providers: [provideVectorEditor({ lang })] });
  const fixture: ComponentFixture<VectorTimeline> = TestBed.createComponent(VectorTimeline);
  fixture.componentRef.setInput('store', store);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  // jsdom lays nothing out: the track is 400 px wide, so 4 s are 100 px each.
  el.querySelector<HTMLElement>('.tracks')!.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 100, right: 400, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  const rows = () => Array.from(el.querySelectorAll<HTMLElement>('[data-testid="row"]'));
  const diamonds = (row: HTMLElement) => Array.from(row.querySelectorAll<HTMLElement>('[data-testid="diamond"]'));
  const rowOf = (id: string, property: string) => rows().find((r) => r.dataset['node'] === id && r.dataset['property'] === property)!;
  const pointer = (target: Element, type: string, clientX: number, init: MouseEventInit = {}): void => {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX, button: 0, ...init }));
    fixture.detectChanges();
  };
  const select = (...ids: string[]): void => {
    store.select(ids);
    fixture.detectChanges();
  };
  const frames = (id: string, property: 'x' | 'rotate' | 'opacity') => findNode(store.doc().nodes, id)!.tracks[property]!;
  return { store, fixture, el, rows, diamonds, rowOf, pointer, select, frames };
}

describe('the timeline helpers', () => {
  it('make a row for every animated property of the nodes, and find the nodes that have a track', () => {
    const doc = sampleDocument();
    const nodes = animatedNodes(doc.nodes);
    expect(nodes.map((n) => n.id)).toEqual(['logo', 'dot', 'wing-a']);
    expect(rowsFor(nodes).map((r) => `${r.id}.${r.property}`)).toEqual(['logo.rotate', 'logo.opacity', 'dot.x', 'dot.scaleX', 'wing-a.fill']);
  });

  it('put a tick on every second, and on every frame when there is room for them', () => {
    expect(ticks(4, 30, 400).map((t) => t.t)).toEqual([0, 1, 2, 3, 4]);
    const dense = ticks(4, 30, 4000);
    expect(dense).toHaveLength(121);
    expect(dense.filter((t) => t.major).map((t) => t.t)).toEqual([0, 1, 2, 3, 4]);
  });

  it('turn a pointer position into a time: clamped, and on a frame when asked', () => {
    expect(timeAt(150, 0, 400, 4, 30, false)).toBe(1.5);
    expect(timeAt(-50, 0, 400, 4, 30, false)).toBe(0);
    expect(timeAt(900, 0, 400, 4, 30, false)).toBe(4);
    expect(timeAt(101, 0, 400, 4, 30, true)).toBe(1);
    expect(timeAt(10, 0, 0, 4, 30, false)).toBe(0);
  });
});

describe('lab-vector-timeline', () => {
  it('shows every animated row when nothing is selected, only the selected nodes’ rows when something is, and all again with the toggle', () => {
    const { rows, select, fixture, el } = setup();
    expect(rows()).toHaveLength(5);
    select('dot');
    expect(rows().map((r) => r.dataset['property'])).toEqual(['x', 'scaleX']);
    const all = el.querySelector<HTMLInputElement>('[data-testid="all-nodes"]')!;
    all.checked = true;
    all.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    expect(rows()).toHaveLength(5);
  });

  it('says what to do when nothing is animated', () => {
    const { el, store, fixture } = setup();
    store.load({ ...sampleDocument(), nodes: [{ ...sampleDocument().nodes[0], children: [] }] });
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="timeline-empty"]')!.textContent).toContain('Press the diamond');
  });

  it('puts a diamond at each keyframe, at its place on the ruler', () => {
    const { rowOf, diamonds, select } = setup();
    select('dot');
    const d = diamonds(rowOf('dot', 'x'));
    expect(d.map((x) => x.style.left)).toEqual(['0%', '50%']);
  });

  it('shows the ruler in seconds and the clock in seconds and frames, in the dashboard’s language', () => {
    const { el, store, fixture } = setup('es');
    expect(Array.from(el.querySelectorAll('.tick-label')).map((e) => e.textContent!.trim())).toEqual(['0s', '1s', '2s', '3s', '4s']);
    store.seek(1.5);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="clock"]')!.textContent).toBe('1.50 s · Fotograma 45');
    expect(el.querySelector('[data-testid="ease"]')!.closest('label')!.textContent).toContain('Suavizado');
  });

  it('moves the playhead from the ruler, onto frames', () => {
    const { el, store, pointer } = setup();
    pointer(el.querySelector('[data-testid="ruler"]')!, 'pointerdown', 201);
    expect(store.playhead()).toBeCloseTo(2, 6);
    pointer(el.querySelector('[data-testid="ruler"]')!, 'pointermove', 301);
    expect(store.playhead()).toBeCloseTo(3, 6);
    pointer(el.querySelector('[data-testid="ruler"]')!, 'pointerup', 301);
    pointer(el.querySelector('[data-testid="ruler"]')!, 'pointermove', 0);
    expect(store.playhead()).toBeCloseTo(3, 6);
  });

  it('drags the playhead line itself: the store follows, and the other panels with it', () => {
    const { el, store, pointer } = setup();
    const line = el.querySelector('[data-testid="playhead"]')!;
    pointer(line, 'pointerdown', 0);
    pointer(line, 'pointermove', 150);
    expect(store.playhead()).toBeCloseTo(1.5, 6);
    pointer(line, 'pointermove', 301);
    expect(store.playhead()).toBeCloseTo(3, 6);
    pointer(line, 'pointerup', 301);
    pointer(line, 'pointermove', 50);
    expect(store.playhead()).toBeCloseTo(3, 6);
    expect((line as HTMLElement).style.left).toBe('75%');
  });

  it('selects a diamond and changes its ease', () => {
    const { el, rowOf, diamonds, pointer, select, store, fixture, frames } = setup();
    select('dot');
    const diamond = diamonds(rowOf('dot', 'x'))[1];
    pointer(diamond, 'pointerdown', 200);
    pointer(diamond, 'pointerup', 200);
    expect(diamond.getAttribute('aria-pressed')).toBe('true');
    const ease = el.querySelector<HTMLSelectElement>('[data-testid="ease"]')!;
    expect(ease.disabled).toBe(false);
    ease.value = 'step';
    ease.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    expect(frames('dot', 'x')[1].ease).toBe('step');
    store.undo();
    expect(frames('dot', 'x')[1].ease).toBe('linear');
  });

  it('drags a diamond in time as one step, clamped, with Shift on to a frame', () => {
    const { rowOf, diamonds, pointer, select, store, frames } = setup();
    select('dot');
    let diamond = diamonds(rowOf('dot', 'x'))[1];
    pointer(diamond, 'pointerdown', 200);
    pointer(diamond, 'pointermove', 250);
    pointer(diamond, 'pointermove', 301, { shiftKey: true });
    pointer(diamond, 'pointerup', 301);
    expect(frames('dot', 'x').map((f) => f.t)).toEqual([0, 3]);
    expect(store.past()).toHaveLength(1);
    diamond = diamonds(rowOf('dot', 'x'))[1];
    pointer(diamond, 'pointerdown', 300);
    pointer(diamond, 'pointermove', 900);
    pointer(diamond, 'pointerup', 900);
    expect(frames('dot', 'x').map((f) => f.t)).toEqual([0, 4]);
    expect(store.past()).toHaveLength(2);
  });

  it('does not make a step of a click that did not move', () => {
    const { rowOf, diamonds, pointer, select, store } = setup();
    select('dot');
    const diamond = diamonds(rowOf('dot', 'x'))[1];
    pointer(diamond, 'pointerdown', 200);
    pointer(diamond, 'pointerup', 200);
    expect(store.canUndo()).toBe(false);
  });

  it('deletes the chosen keyframe with Delete, and the row when it was the last', () => {
    const { el, diamonds, pointer, select, fixture, rows, store } = setup();
    select('wing-a');
    expect(rows()).toHaveLength(1);
    const timeline = el.querySelector('[data-testid="vector-timeline"]')!;
    const pick = (): void => {
      const diamond = diamonds(rows()[0])[0];
      pointer(diamond, 'pointerdown', 0);
      pointer(diamond, 'pointerup', 0);
      timeline.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      fixture.detectChanges();
    };
    pick();
    expect(rows()[0].querySelectorAll('[data-testid="diamond"]')).toHaveLength(1);
    expect(findNode(store.doc().nodes, 'wing-a')!.tracks.fill).toHaveLength(1);
    pick();
    expect(rows()).toHaveLength(0);
    expect('fill' in findNode(store.doc().nodes, 'wing-a')!.tracks).toBe(false);
    store.undo();
    store.undo();
    expect(findNode(store.doc().nodes, 'wing-a')!.tracks.fill).toHaveLength(2);
  });

  it('adds a keyframe with the value shown there on a double click on a row', () => {
    const { rowOf, pointer, select, frames } = setup();
    select('dot');
    pointer(rowOf('dot', 'x'), 'dblclick', 100);
    const x = frames('dot', 'x');
    expect(x.map((f) => f.t)).toEqual([0, 1, 2]);
    expect(x[1].value).toBeGreaterThan(0);
    expect(x[1].value).toBeLessThan(60);
  });

  it('moves a focused diamond a frame with the arrows', () => {
    const { rowOf, diamonds, select, frames, fixture } = setup();
    select('dot');
    const diamond = diamonds(rowOf('dot', 'x'))[1];
    diamond.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(frames('dot', 'x')[1].t).toBeCloseTo(2 + 1 / 30, 3);
  });

  it('plays nothing: it has no controls of its own for time apart from the ruler', () => {
    const { el } = setup();
    expect(el.querySelector('[data-testid="play"]')).toBeNull();
  });
});
