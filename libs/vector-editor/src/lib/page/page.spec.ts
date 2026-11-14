import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { sampleDocument } from '../../testing/sample-document';
import { provideVectorEditor } from '../provide-vector-editor';
import { VectorStore } from '../store/vector-store';
import { VectorEditorPage } from './page';

@Component({
  imports: [VectorEditorPage],
  template: `<lab-vector-editor-page [store]="store"><div toolbar><button type="button" data-testid="mine">{{ label }}</button></div></lab-vector-editor-page>`,
})
class Host {
  store = new VectorStore(sampleDocument());
  label = 'Open';
}

function mount(label: string) {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.label = label;
  fixture.detectChanges();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string) => el.querySelector<T>(`[data-testid="${id}"]`)!;
  return { fixture, el, q, store: fixture.componentInstance.store };
}

describe('lab-vector-editor-page', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideVectorEditor({ lang: 'en' })] }));

  it('arranges the four panels and the transport, and shows the host’s toolbar', () => {
    const { q, el } = mount('Open');
    for (const id of ['panel-tree', 'panel-centre', 'panel-properties', 'panel-timeline', 'toolbar']) expect(q(id)).not.toBeNull();
    expect(q('panel-tree').querySelector('lab-vector-tree')).not.toBeNull();
    expect(q('panel-centre').querySelector('lab-vector-transport')).not.toBeNull();
    expect(q('panel-centre').querySelector('lab-vector-canvas')).not.toBeNull();
    expect(q('panel-properties').querySelector('lab-vector-properties')).not.toBeNull();
    expect(q('panel-timeline').querySelector('lab-vector-timeline')).not.toBeNull();
    expect(q('toolbar').textContent).toContain('Open');
    expect(el.querySelectorAll('[role="separator"]')).toHaveLength(3);
  });

  it('shares the selection: one chosen on the canvas shows in the tree and the properties', () => {
    const { q, store, fixture } = mount('Open');
    const dot = q('vector-canvas').querySelector('[data-testid="content"] [id="dot"]')!;
    dot.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 400, clientY: 300, button: 0 }));
    dot.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 400, clientY: 300, button: 0 }));
    fixture.detectChanges();
    fixture.detectChanges();
    expect(store.selection()).toEqual(['dot']);
    expect(q('row-dot').getAttribute('aria-selected')).toBe('true');
    expect(q('vector-properties').querySelector('.title')!.textContent).toBe('Dot');
  });

  it('is the same layout for two hosts with their own toolbars', () => {
    const a = mount('Open');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideVectorEditor({ lang: 'es' })] });
    const b = mount('Abrir');
    expect(a.q('toolbar').textContent).toContain('Open');
    expect(b.q('toolbar').textContent).toContain('Abrir');
    expect(b.q('split-left').getAttribute('aria-label')).toBe('Ancho del panel de capas');
    expect(b.q('panel-timeline')).not.toBeNull();
  });

  it('resizes with the keyboard, within limits', () => {
    const { q, fixture } = mount('Open');
    const press = (id: string, key: string, shiftKey = false): void => {
      q(id).dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
      fixture.detectChanges();
    };
    expect(q('split-left').getAttribute('aria-valuenow')).toBe('192');
    press('split-left', 'ArrowRight');
    expect(q('split-left').getAttribute('aria-valuenow')).toBe('208');
    press('split-left', 'ArrowRight', true);
    expect(q('split-left').getAttribute('aria-valuenow')).toBe('272');
    press('split-left', 'End');
    expect(q('split-left').getAttribute('aria-valuenow')).toBe('640');
    press('split-left', 'ArrowRight');
    expect(q('split-left').getAttribute('aria-valuenow')).toBe('640');
    press('split-right', 'ArrowLeft');
    expect(q('split-right').getAttribute('aria-valuenow')).toBe('496');
    press('split-bottom', 'ArrowUp');
    expect(q('split-bottom').getAttribute('aria-valuenow')).toBe('240');
    press('split-bottom', 'Home');
    expect(q('split-bottom').getAttribute('aria-valuenow')).toBe('120');
    expect(q('vector-page').style.getPropertyValue('--bottom')).toBe('120px');
  });

  it('resizes by dragging the handle: the left panel follows the pointer, the right one goes the other way', () => {
    const { q, fixture } = mount('Open');
    const drag = (id: string, from: number, to: number, axis: 'clientX' | 'clientY' = 'clientX'): void => {
      const el = q(id);
      el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, [axis]: from }));
      el.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, [axis]: to }));
      el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, [axis]: to }));
      fixture.detectChanges();
    };
    drag('split-left', 240, 300);
    expect(q('split-left').getAttribute('aria-valuenow')).toBe('252');
    drag('split-right', 1000, 940);
    expect(q('split-right').getAttribute('aria-valuenow')).toBe('540');
    drag('split-bottom', 500, 100, 'clientY');
    expect(q('split-bottom').getAttribute('aria-valuenow')).toBe('480');
  });

  it('shows the six tools at the canvas edge, marks the current one and changes it on a click', () => {
    const { q, store, fixture, el } = mount('Open');
    expect(q('panel-centre').querySelector('[data-testid="tools"]')).not.toBeNull();
    expect(el.querySelectorAll('[data-testid="tools"] button')).toHaveLength(6);
    expect(q('tool-select').getAttribute('aria-pressed')).toBe('true');
    expect(q('tool-rect').getAttribute('aria-label')).toBe('Rectangle (R)');
    q('tool-ellipse').click();
    fixture.detectChanges();
    expect(store.tool()).toBe('ellipse');
    expect(q('tool-ellipse').getAttribute('aria-pressed')).toBe('true');
    expect(q('tool-select').getAttribute('aria-pressed')).toBe('false');
  });

  it('says what happened to a picture and lets the notice be dismissed', () => {
    const { q, store, fixture } = mount('Open');
    expect(q('notice')).toBeNull();
    store.notice.set('image-large');
    fixture.detectChanges();
    expect(q('notice').textContent).toContain('300 KB');
    q('notice-dismiss').click();
    fixture.detectChanges();
    expect(q('notice')).toBeNull();
  });
});
