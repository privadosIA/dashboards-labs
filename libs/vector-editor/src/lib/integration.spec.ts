import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { installBBoxPolyfill } from '../testing/bbox-polyfill';
import { SAMPLE_SVG } from '../testing/sample-svg';
import { VectorCanvas } from './canvas/canvas';
import { anchorInParent } from './canvas/gestures';
import { toScreen } from './canvas/view';
import { importSvg } from './import/import-svg';
import { newDocument } from './model/document';
import { findNode } from './model/tree';
import { VectorProperties } from './properties/properties';
import { provideVectorEditor } from './provide-vector-editor';
import { fromPart } from './runtime/from-part';
import { toPart, type PartFiles } from './runtime/to-part';
import { VectorStore } from './store/vector-store';
import { VectorTimeline } from './timeline/timeline';
import { VectorTransport } from './transport/transport';
import { VectorTree } from './tree/tree';

/** A throwaway host: the five components over one store, as a dashboard would mount them. */
@Component({
  imports: [VectorCanvas, VectorTree, VectorProperties, VectorTimeline, VectorTransport],
  template: `
    <lab-vector-transport [store]="store" />
    <lab-vector-canvas [store]="store" />
    <lab-vector-tree [store]="store" />
    <lab-vector-properties [store]="store" />
    <lab-vector-timeline [store]="store" />
  `,
})
class Host {
  readonly store = new VectorStore(newDocument());
}

function mount() {
  TestBed.configureTestingModule({ providers: [provideVectorEditor({ lang: 'en' })] });
  const fixture: ComponentFixture<Host> = TestBed.createComponent(Host);
  const store = fixture.componentInstance.store;
  const el = fixture.nativeElement as HTMLElement;
  const settle = (): void => {
    fixture.detectChanges();
    fixture.detectChanges();
  };
  settle();
  const canvas = fixture.debugElement.query(By.directive(VectorCanvas)).componentInstance as VectorCanvas;

  // jsdom lays nothing out: an element's rectangle is its box in the artboard, put through the view.
  SVGElement.prototype.getBoundingClientRect = function (this: SVGElement) {
    const b = (this as unknown as SVGGraphicsElement).getBBox();
    const a = toScreen(canvas.view(), { x: b.x, y: b.y });
    const z = toScreen(canvas.view(), { x: b.x + b.width, y: b.y + b.height });
    return { left: a.x, top: a.y, right: z.x, bottom: z.y, width: z.x - a.x, height: z.y - a.y, x: a.x, y: a.y, toJSON: () => ({}) } as DOMRect;
  };

  const q = <T extends HTMLElement = HTMLElement>(id: string) => el.querySelector<T>(`[data-testid="${id}"]`)!;
  const node = (id: string) => el.querySelector(`[data-testid="content"] [id="${id}"]`)!;
  const fire = (target: Element, type: string, x: number, y: number, init: MouseEventInit = {}): void => {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, ...init }));
    settle();
  };
  const at = (art: { x: number; y: number }) => toScreen(canvas.view(), art);
  const doc = (id: string) => findNode(store.doc().nodes, id)!;
  const importSample = (): void => {
    const imported = importSvg(SAMPLE_SVG);
    if ('problem' in imported) throw new Error(imported.problem);
    store.apply((d) => ({ ...d, viewBox: imported.viewBox, nodes: [imported.node] }));
    settle();
  };
  return { fixture, store, el, canvas, settle, q, node, fire, at, doc, importSample };
}

describe('the five components over one document', () => {
  beforeAll(() => installBBoxPolyfill());

  it('imports the sample and shows it in the tree and on the canvas', () => {
    const { el, importSample, node, store } = mount();
    expect(el.querySelector('[data-testid="tree-empty"]')).not.toBeNull();
    importSample();
    expect(el.querySelector('[data-testid="tree-empty"]')).toBeNull();
    expect(Array.from(el.querySelectorAll('[role="treeitem"]')).map((r) => r.getAttribute('data-testid'))).toContain('row-wing-b');
    expect(node('wing-b').getAttribute('fill')).toBe('#a8dadc');
    expect(store.doc().viewBox).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });

  it('selects by click and by marquee, and the tree and the properties follow', () => {
    const { el, importSample, node, fire, at, store, q } = mount();
    importSample();
    fire(node('dot'), 'pointerdown', 400, 300);
    fire(node('dot'), 'pointerup', 400, 300);
    expect(store.selection()).toEqual(['dot']);
    expect(el.querySelector('[data-testid="row-dot"]')!.getAttribute('aria-selected')).toBe('true');
    expect(q('vector-properties').querySelector('.title')!.textContent).toBe('dot');
    const from = at({ x: 150, y: 2 });
    const to = at({ x: 198, y: 30 });
    const artboard = el.querySelector('[data-testid="artboard"]')!;
    fire(artboard, 'pointerdown', from.x, from.y);
    fire(artboard, 'pointermove', to.x, to.y);
    expect(q('marquee')).not.toBeNull();
    fire(artboard, 'pointerup', to.x, to.y);
    expect(store.selection()).toEqual(['tag']);
  });

  it('scales with a handle, about the opposite corner, as a change of the static value', () => {
    const { importSample, node, fire, at, store, doc, q, settle } = mount();
    importSample();
    fire(node('dot'), 'pointerdown', 400, 300);
    fire(node('dot'), 'pointerup', 400, 300);
    settle();
    const steps = store.past().length;
    const corner = at({ x: 80, y: 80 });
    const handle = q('handle-se');
    fire(handle, 'pointerdown', corner.x, corner.y);
    fire(handle, 'pointermove', corner.x + 36, corner.y + 36);
    fire(handle, 'pointerup', corner.x + 36, corner.y + 36);
    expect(doc('dot').transform.scaleX).toBeCloseTo(1 + 36 / (60 * 3.6), 3);
    expect(doc('dot').transform.scaleY).toBeCloseTo(doc('dot').transform.scaleX, 6);
    expect(doc('dot').tracks).toEqual({});
    expect(store.past()).toHaveLength(steps + 1);
  });

  it('turns with auto-key, toggles keyframes with the diamond, and shows them on the timeline', () => {
    const { el, importSample, node, fire, at, store, doc, q, settle } = mount();
    importSample();
    fire(node('dot'), 'pointerdown', 400, 300);
    fire(node('dot'), 'pointerup', 400, 300);
    q('key-rotate').click();
    settle();
    expect(doc('dot').tracks.rotate).toEqual([{ t: 0, value: 0, ease: 'linear' }]);
    expect(el.querySelectorAll('[data-testid="row"]')).toHaveLength(1);
    store.seek(2);
    settle();
    const anchor = at(anchorInParent(doc('dot').transform));
    const handle = q('handle-rotate');
    fire(handle, 'pointerdown', anchor.x + 100, anchor.y);
    fire(handle, 'pointermove', anchor.x, anchor.y + 100);
    fire(handle, 'pointerup', anchor.x, anchor.y + 100);
    expect(doc('dot').tracks.rotate!.map((f) => [f.t, Math.round(f.value as number)])).toEqual([[0, 0], [2, 90]]);
    expect(el.querySelectorAll('[data-testid="diamond"]')).toHaveLength(2);
    expect(node('dot').getAttribute('transform')).toContain('rotate(90)');
    store.seek(1);
    settle();
    expect(node('dot').getAttribute('transform')).toContain('rotate(45)');
  });

  it('plays from the transport and draws what the playhead says', () => {
    const { el, importSample, store, q, settle, node } = mount();
    importSample();
    store.apply((d) => ({ ...d, nodes: [{ ...d.nodes[0], children: d.nodes[0].children.map((c) => (c.id === 'tag' ? { ...c, tracks: { x: [{ t: 0, value: 0, ease: 'linear' as const }, { t: 4, value: 40, ease: 'linear' as const }] } } : c)) }] }));
    q('play').click();
    settle();
    expect(store.playing()).toBe(true);
    expect(el.querySelector('[data-testid="play"]')!.getAttribute('aria-label')).toBe('Pause');
    q('play').click();
    store.seek(2);
    settle();
    expect(node('tag').getAttribute('transform')).toContain('translate(20 0)');
  });

  it('exports with toPart and reopens with fromPart to the same document', () => {
    const { importSample, store, q, settle, node, fire } = mount();
    importSample();
    fire(node('dot'), 'pointerdown', 400, 300);
    fire(node('dot'), 'pointerup', 400, 300);
    q('key-opacity').click();
    store.seek(2);
    settle();
    const input = q<HTMLInputElement>('field-opacity');
    input.value = '0.2';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    settle();
    const part = toPart(store.doc(), { name: 'imported-dot', description: 'A dot that fades' });
    expect('problems' in part).toBe(false);
    const files = part as PartFiles;
    expect(JSON.parse(files.manifest).name).toBe('imported-dot');
    expect(fromPart(files)).toEqual({ doc: store.doc() });
  });
});
