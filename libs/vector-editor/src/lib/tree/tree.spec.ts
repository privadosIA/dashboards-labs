import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { sampleDocument } from '../../testing/sample-document';
import { newDocument, newGroup, type Node, type VectorDocument } from '../model/document';
import { findNode } from '../model/tree';
import { provideVectorEditor } from '../provide-vector-editor';
import { markupOf } from '../runtime/render-svg';
import { VectorStore } from '../store/vector-store';
import { dropNode, rowsOf, zoneOf } from './rows';
import { VectorTree } from './tree';

const flat = (): VectorDocument => newDocument({ nodes: [newGroup('a', 'A'), newGroup('b', 'B'), newGroup('g', 'Group', [newGroup('c', 'C')])] });
const ids = (nodes: readonly Node[]): string[] => nodes.map((n) => n.id);

function setup(doc: VectorDocument, lang: 'es' | 'en' = 'en') {
  const store = new VectorStore(doc);
  TestBed.configureTestingModule({ providers: [provideVectorEditor({ lang })] });
  const fixture: ComponentFixture<VectorTree> = TestBed.createComponent(VectorTree);
  fixture.componentRef.setInput('store', store);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const row = (id: string) => el.querySelector<HTMLElement>(`[data-testid="row-${id}"]`)!;
  const rowIds = () => Array.from(el.querySelectorAll('[role="treeitem"]')).map((r) => r.getAttribute('data-testid')!.slice(4));
  return { store, fixture, el, row, rowIds };
}

function drag(source: HTMLElement, target: HTMLElement, clientY: number, fixture: ComponentFixture<unknown>): void {
  target.getBoundingClientRect = () => ({ top: 0, height: 100, left: 0, width: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  const dataTransfer = { setData: () => undefined, effectAllowed: '' };
  const fire = (el: HTMLElement, type: string): void => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY });
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
    el.dispatchEvent(event);
    fixture.detectChanges();
  };
  fire(source, 'dragstart');
  fire(target, 'dragover');
  fire(target, 'drop');
  fire(source, 'dragend');
}

describe('the rows', () => {
  it('list the nodes in drawing order, with the children of a collapsed one left out', () => {
    expect(rowsOf(flat().nodes, new Set()).map((r) => [r.id, r.depth])).toEqual([['a', 0], ['b', 0], ['g', 0], ['c', 1]]);
    expect(rowsOf(flat().nodes, new Set(['g'])).map((r) => r.id)).toEqual(['a', 'b', 'g']);
  });

  it('say which can be dragged: not what an import mirrors; and which take a drop: groups only', () => {
    const rows = rowsOf(sampleDocument().nodes, new Set());
    expect(rows[0]).toMatchObject({ id: 'sample', movable: true, accepts: false });
    expect(rows.slice(1).every((r) => !r.movable)).toBe(true);
    expect(rowsOf(flat().nodes, new Set()).find((r) => r.id === 'g')).toMatchObject({ accepts: true, movable: true });
  });

  it('choose the zone from where the pointer is in the row', () => {
    expect(zoneOf(0.1, true)).toBe('before');
    expect(zoneOf(0.5, true)).toBe('into');
    expect(zoneOf(0.9, true)).toBe('after');
    expect(zoneOf(0.4, false)).toBe('before');
    expect(zoneOf(0.6, false)).toBe('after');
  });

  it('drop a node before, after and into another, and refuse a drop on itself or into its own descendant', () => {
    const nodes = flat().nodes;
    expect(ids(dropNode(nodes, 'b', 'a', 'before'))).toEqual(['b', 'a', 'g']);
    expect(ids(dropNode(nodes, 'a', 'b', 'after'))).toEqual(['b', 'a', 'g']);
    expect(ids(dropNode(nodes, 'a', 'g', 'into'))).toEqual(['b', 'g']);
    expect(ids(findNode(dropNode(nodes, 'a', 'g', 'into'), 'g')!.children)).toEqual(['c', 'a']);
    expect(ids(dropNode(nodes, 'c', 'a', 'before'))).toEqual(['c', 'a', 'b', 'g']);
    expect(dropNode(nodes, 'a', 'a', 'before')).toBe(nodes);
    expect(dropNode(nodes, 'g', 'c', 'into')).toBe(nodes);
  });
});

describe('lab-vector-tree', () => {
  it('lists the nodes with their names, in the dashboard’s language', () => {
    const { rowIds, el } = setup(flat(), 'es');
    expect(rowIds()).toEqual(['a', 'b', 'g', 'c']);
    expect(el.querySelector('[data-testid="toggle-visible"]')!.getAttribute('aria-label')).toBe('Ocultar');
    expect(el.querySelector('[data-testid="toggle-lock"]')!.getAttribute('aria-label')).toBe('Bloquear');
  });

  it('says there is nothing when the document is empty', () => {
    const { el } = setup(newDocument());
    expect(el.querySelector('[data-testid="tree-empty"]')!.textContent).toContain('Import an SVG');
  });

  it('selects with a click, adds with Shift, and follows the store', () => {
    const { store, row, fixture } = setup(flat());
    row('a').click();
    row('b').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    fixture.detectChanges();
    expect(store.selection()).toEqual(['a', 'b']);
    expect(row('a').getAttribute('aria-selected')).toBe('true');
    store.select(['c']);
    fixture.detectChanges();
    expect(row('a').getAttribute('aria-selected')).toBe('false');
    expect(row('c').getAttribute('aria-selected')).toBe('true');
  });

  it('shows and hides, locks and unlocks, through the store (so undo covers it)', () => {
    const { store, row, fixture } = setup(flat());
    row('a').querySelector<HTMLElement>('[data-testid="toggle-visible"]')!.click();
    row('a').querySelector<HTMLElement>('[data-testid="toggle-lock"]')!.click();
    fixture.detectChanges();
    expect(findNode(store.doc().nodes, 'a')).toMatchObject({ visible: false, locked: true });
    expect(row('a').querySelector('[data-testid="toggle-visible"]')!.getAttribute('aria-label')).toBe('Show');
    store.undo();
    store.undo();
    expect(findNode(store.doc().nodes, 'a')).toMatchObject({ visible: true, locked: false });
  });

  it('renames on a double click and keeps the name with Enter, and drops it with Escape', () => {
    const { store, row, fixture, el } = setup(flat());
    row('a').querySelector<HTMLElement>('[data-testid="name"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();
    const input = el.querySelector<HTMLInputElement>('[data-testid="name-input"]')!;
    input.value = 'Wheel';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(findNode(store.doc().nodes, 'a')!.name).toBe('Wheel');
    row('b').querySelector<HTMLElement>('[data-testid="name"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();
    const again = el.querySelector<HTMLInputElement>('[data-testid="name-input"]')!;
    again.value = 'Nope';
    again.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(findNode(store.doc().nodes, 'b')!.name).toBe('B');
  });

  it('collapses and expands a group', () => {
    const { rowIds, row, fixture } = setup(flat());
    row('g').querySelector<HTMLElement>('[data-testid="twist"]')!.click();
    fixture.detectChanges();
    expect(rowIds()).toEqual(['a', 'b', 'g']);
    expect(row('g').getAttribute('aria-expanded')).toBe('false');
  });

  it('reorders by dragging: b above a is drawn under a, on the canvas and in the exported SVG', () => {
    const { store, row, fixture } = setup(flat());
    drag(row('b'), row('a'), 10, fixture);
    expect(ids(store.doc().nodes)).toEqual(['b', 'a', 'g']);
    expect(markupOf(store.doc().nodes).indexOf('id="b"')).toBeLessThan(markupOf(store.doc().nodes).indexOf('id="a"'));
    store.undo();
    expect(ids(store.doc().nodes)).toEqual(['a', 'b', 'g']);
  });

  it('drags a node into a group, and out of it', () => {
    const { store, row, fixture } = setup(flat());
    drag(row('a'), row('g'), 50, fixture);
    expect(ids(findNode(store.doc().nodes, 'g')!.children)).toEqual(['c', 'a']);
    drag(row('a'), row('b'), 90, fixture);
    expect(ids(store.doc().nodes)).toEqual(['b', 'a', 'g']);
  });

  it('does not drag what an import mirrors', () => {
    const { store, row, fixture } = setup(sampleDocument());
    const before = JSON.stringify(store.doc());
    drag(row('tag'), row('logo'), 10, fixture);
    expect(JSON.stringify(store.doc())).toBe(before);
  });

  it('moves the selection with the arrows and renames with F2', () => {
    const { store, row, fixture, el } = setup(flat());
    row('a').click();
    row('a').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    expect(store.selection()).toEqual(['b']);
    row('b').dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="name-input"]')).not.toBeNull();
  });
});
