import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { installBBoxPolyfill } from '../../testing/bbox-polyfill';
import { sampleDocument } from '../../testing/sample-document';
import { shapesDocument } from '../../testing/shapes-document';
import { importSvg } from '../import/import-svg';
import { newDocument, type VectorDocument } from '../model/document';
import { setBeatLink, setKeyframe, setLocked } from '../model/edits';
import { findNode } from '../model/tree';
import { provideVectorEditor } from '../provide-vector-editor';
import { VectorStore } from '../store/vector-store';
import { anchorInParent } from './gestures';
import { toArt, toScreen } from './view';
import { VectorCanvas } from './canvas';

function setup(doc: VectorDocument = sampleDocument()) {
  const store = new VectorStore(doc);
  TestBed.configureTestingModule({ providers: [provideVectorEditor({ lang: 'en' })] });
  const fixture: ComponentFixture<VectorCanvas> = TestBed.createComponent(VectorCanvas);
  fixture.componentRef.setInput('store', store);
  const settle = (): void => {
    fixture.detectChanges();
    fixture.detectChanges();
  };
  settle();
  const el = fixture.nativeElement as HTMLElement;
  const host = el.querySelector<HTMLElement>('[data-testid="vector-canvas"]')!;
  const content = el.querySelector<SVGGElement>('[data-testid="content"]')!;
  const node = (id: string) => content.querySelector(`[id="${id}"]`)!;
  const fire = (target: Element, type: string, x: number, y: number, init: MouseEventInit = {}): void => {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, ...init }));
    settle();
  };
  const key = (k: string, init: KeyboardEventInit = {}): void => {
    host.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
    settle();
  };
  const x = (id: string) => findNode(store.doc().nodes, id)!.transform.x;
  return { store, fixture, el, host, content, node, fire, key, settle, x, view: () => fixture.componentInstance.view() };
}

describe('lab-vector-canvas', () => {
  beforeAll(() => installBBoxPolyfill());

  it('draws the document through the runtime at the playhead', () => {
    const { store, node, settle } = setup();
    expect(node('dot').getAttribute('fill')).toBe('#e63946');
    store.seek(2);
    settle();
    expect(node('dot').getAttribute('transform')).toContain('translate(60 0)');
    expect(node('logo').getAttribute('transform')).toContain('rotate(180)');
  });

  it('keeps nothing dangerous from an imported file in the drawing', () => {
    const result = importSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10"><script>x()</script><rect id="r" width="5" height="5" onclick="y()"/><image xlink:href="https://example.com/a.png"/></svg>',
    );
    if ('problem' in result) throw new Error(result.problem);
    const { content } = setup(newDocument({ viewBox: result.viewBox, nodes: [result.node] }));
    expect(content.querySelector('script')).toBeNull();
    expect(content.innerHTML).not.toMatch(/onclick|https?:|<script/);
    expect(content.querySelector('[id="r"]')).not.toBeNull();
  });

  it('selects by click, adds with Shift, and clears on the empty artboard', () => {
    const { store, node, el, fire } = setup();
    fire(node('dot'), 'pointerdown', 400, 300);
    fire(node('dot'), 'pointerup', 400, 300);
    expect(store.selection()).toEqual(['dot']);
    fire(node('tag'), 'pointerdown', 400, 300, { shiftKey: true });
    fire(node('tag'), 'pointerup', 400, 300);
    expect(store.selection()).toEqual(['dot', 'tag']);
    fire(el.querySelector('[data-testid="artboard"]')!, 'pointerdown', 10, 10);
    fire(el.querySelector('[data-testid="artboard"]')!, 'pointerup', 10, 10);
    expect(store.selection()).toEqual([]);
  });

  it('does not select a locked node on the canvas', () => {
    const { store, node, fire } = setup(setLocked(sampleDocument(), 'tag', true));
    fire(node('tag'), 'pointerdown', 400, 300);
    fire(node('tag'), 'pointerup', 400, 300);
    expect(store.selection()).not.toContain('tag');
  });

  it('changes the static value when the property has no keyframes: 40 units right, no keyframe made', () => {
    const { store, node, fire, x, view } = setup();
    const per = toScreen(view(), { x: 40, y: 0 }).x - toScreen(view(), { x: 0, y: 0 }).x;
    fire(node('tag'), 'pointerdown', 400, 300);
    fire(node('tag'), 'pointermove', 400 + per / 2, 300);
    fire(node('tag'), 'pointermove', 400 + per, 300);
    fire(node('tag'), 'pointerup', 400 + per, 300);
    expect(x('tag')).toBeCloseTo(40, 6);
    expect(findNode(store.doc().nodes, 'tag')!.tracks).toEqual({});
    expect(store.past()).toHaveLength(1);
  });

  it('is one undo step however many positions the drag went through', () => {
    const { store, node, fire, key, x } = setup();
    fire(node('tag'), 'pointerdown', 400, 300);
    for (let i = 1; i <= 12; i++) fire(node('tag'), 'pointermove', 400 + i * 10, 300 + i * 3);
    fire(node('tag'), 'pointerup', 520, 336);
    expect(x('tag')).toBeGreaterThan(0);
    key('z', { ctrlKey: true });
    expect(x('tag')).toBe(0);
    expect(store.canUndo()).toBe(false);
    key('z', { ctrlKey: true, shiftKey: true });
    expect(x('tag')).toBeGreaterThan(0);
  });

  it('adds a keyframe at the playhead when the property has keyframes elsewhere (auto-key)', () => {
    const { store, fire, el, settle, view } = setup(setKeyframe(sampleDocument(), 'tag', 'rotate', 0, 0));
    store.select(['tag']);
    store.seek(2);
    settle();
    const anchor = toScreen(view(), anchorInParent(findNode(store.doc().nodes, 'tag')!.transform));
    const handle = el.querySelector('[data-testid="handle-rotate"]')!;
    fire(handle, 'pointerdown', anchor.x + 100, anchor.y);
    fire(handle, 'pointermove', anchor.x, anchor.y + 100);
    fire(handle, 'pointerup', anchor.x, anchor.y + 100);
    const track = findNode(store.doc().nodes, 'tag')!.tracks.rotate!;
    expect(track.map((f) => f.t)).toEqual([0, 2]);
    expect(track[0].value).toBe(0);
    expect(track[1].value).toBeCloseTo(90, 6);
  });

  it('edits the keyframe that is at the playhead when there is one', () => {
    const { store, node, fire } = setup();
    store.select(['dot']);
    store.seek(2);
    fire(node('dot'), 'pointerdown', 400, 300);
    fire(node('dot'), 'pointermove', 400 + 36, 300);
    fire(node('dot'), 'pointerup', 436, 300);
    const x = findNode(store.doc().nodes, 'dot')!.tracks.x!;
    expect(x).toHaveLength(2);
    expect(x[1].value).toBeCloseTo(70, 6);
    expect(x[0].value).toBe(0);
  });

  it('turns an anchor drag into a change of the anchor that does not move the node', () => {
    const { store, fire, el, settle, view } = setup();
    store.select(['tag']);
    settle();
    const before = findNode(store.doc().nodes, 'tag')!.transform;
    const at = toScreen(view(), anchorInParent(before));
    const handle = el.querySelector('[data-testid="handle-anchor"]')!;
    fire(handle, 'pointerdown', at.x, at.y);
    fire(handle, 'pointermove', at.x + 36, at.y + 36);
    fire(handle, 'pointerup', at.x + 36, at.y + 36);
    const after = findNode(store.doc().nodes, 'tag')!.transform;
    expect(after.anchorX).toBeCloseTo(before.anchorX + 10, 6);
    expect(after.anchorY).toBeCloseTo(before.anchorY + 10, 6);
    expect(after.x).toBeCloseTo(0, 6);
  });

  it('nudges 1 unit with an arrow and 10 with Shift, as one step while typing on', () => {
    const { store, key, x, settle } = setup();
    store.select(['tag']);
    settle();
    key('ArrowRight');
    key('ArrowRight', { shiftKey: true });
    expect(x('tag')).toBe(11);
    expect(store.past()).toHaveLength(1);
    key('ArrowLeft');
    expect(x('tag')).toBe(10);
  });

  it('moves a group and not the child it holds a second time', () => {
    const { store, key, x, settle } = setup();
    store.select(['logo', 'dot']);
    settle();
    key('ArrowRight', { shiftKey: true });
    expect(x('logo')).toBe(10);
    expect(x('dot')).toBe(0);
  });

  it('zooms around the pointer with Ctrl+wheel, and 0 fits the artboard again', () => {
    const { host, key, view, settle } = setup();
    host.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -300, clientX: 200, clientY: 100 }));
    settle();
    expect(view().zoom).toBeGreaterThan(1);
    key('0');
    expect(view().zoom).toBe(1);
    expect(view().panX).toBe(0);
  });

  it('pans with Space held and plays or pauses when Space is only tapped', () => {
    const { store, host, fire, key, settle, view } = setup();
    key(' ');
    fire(host, 'pointerdown', 100, 100);
    fire(host, 'pointermove', 150, 130);
    fire(host, 'pointerup', 150, 130);
    expect(view().panX).toBe(50);
    expect(view().panY).toBe(30);
    host.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    settle();
    expect(store.playing()).toBe(false);
    key(' ');
    host.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    settle();
    expect(store.playing()).toBe(true);
  });

  it('shows the handles for a selection and none without one', () => {
    const { store, el, settle } = setup();
    expect(el.querySelector('[data-handle]')).toBeNull();
    store.select(['dot']);
    settle();
    expect(el.querySelectorAll('[data-handle]')).toHaveLength(8 + 1 + 1);
  });

  describe('drawing and composing', () => {
    const rect = (x: number, y: number, width: number, height: number): DOMRect => ({ x, y, left: x, top: y, width, height, right: x + width, bottom: y + height, toJSON: () => ({}) }) as DOMRect;
    const stub = (el: Element, x: number, y: number, width: number, height: number): void => {
      Object.defineProperty(el, 'getBoundingClientRect', { configurable: true, value: () => rect(x, y, width, height) });
    };
    const art = (el: HTMLElement) => el.querySelector('[data-testid="artboard"]')!;

    it('draws a rectangle by dragging: sized from the drag, one undo step, and the tool goes back to Select', () => {
      const { store, el, fire, view } = setup();
      store.tool.set('rect');
      fire(art(el), 'pointerdown', 100, 150);
      fire(art(el), 'pointermove', 300, 250);
      fire(art(el), 'pointerup', 300, 250);
      const made = findNode(store.doc().nodes, 'rect-1');
      expect(made).toMatchObject({ kind: 'rect', name: 'Rectangle' });
      const a = toArt(view(), { x: 100, y: 150 });
      expect(made!.transform.x).toBeCloseTo(a.x, 6);
      expect((made as { width: number }).width).toBeCloseTo(200 / 3.6, 4);
      expect((made as { height: number }).height).toBeCloseTo(100 / 3.6, 4);
      expect(store.selection()).toEqual(['rect-1']);
      expect(store.tool()).toBe('select');
      expect(store.past()).toHaveLength(1);
      store.undo();
      expect(findNode(store.doc().nodes, 'rect-1')).toBeUndefined();
    });

    it('keeps the tool with Shift, makes a square, and gives a click the default size', () => {
      const { store, el, fire } = setup();
      store.tool.set('rect');
      fire(art(el), 'pointerdown', 100, 150, { shiftKey: true });
      fire(art(el), 'pointermove', 300, 200, { shiftKey: true });
      fire(art(el), 'pointerup', 300, 200, { shiftKey: true });
      const square = findNode(store.doc().nodes, 'rect-1') as unknown as { width: number; height: number };
      expect(square.width).toBeCloseTo(square.height, 6);
      expect(store.tool()).toBe('rect');
      fire(art(el), 'pointerdown', 500, 400);
      fire(art(el), 'pointerup', 500, 400);
      expect(findNode(store.doc().nodes, 'rect-2')).toMatchObject({ width: 200, height: 120 });
    });

    it('chooses the tools with V R E L T I and leaves a tool with Escape', () => {
      const { store, key } = setup();
      for (const [k, tool] of [['r', 'rect'], ['e', 'ellipse'], ['l', 'line'], ['t', 'text'], ['i', 'image'], ['v', 'select']] as const) {
        key(k);
        expect(store.tool()).toBe(tool);
      }
      key('r');
      key('Escape');
      expect(store.tool()).toBe('select');
    });

    it('places a text with the Text tool and types it in place: Enter keeps the words, Escape drops a new text', () => {
      const { store, el, fire, key, settle } = setup();
      store.tool.set('text');
      fire(art(el), 'pointerdown', 200, 200);
      fire(art(el), 'pointerup', 200, 200);
      expect(store.editingText()).toBe('text-1');
      const field = el.querySelector<HTMLTextAreaElement>('[data-testid="text-edit"]')!;
      expect(field).not.toBeNull();
      field.value = 'Hola';
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      settle();
      expect(store.editingText()).toBeUndefined();
      expect(findNode(store.doc().nodes, 'text-1')).toMatchObject({ kind: 'text', content: 'Hola' });
      expect(el.querySelector('[data-testid="text-edit"]')).toBeNull();

      store.tool.set('text');
      fire(art(el), 'pointerdown', 300, 300);
      fire(art(el), 'pointerup', 300, 300);
      el.querySelector<HTMLTextAreaElement>('[data-testid="text-edit"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      settle();
      expect(findNode(store.doc().nodes, 'text-2')).toBeUndefined();
      key('Escape');
    });

    it('does not take a letter typed into the text field for a tool', () => {
      const { store, el, fire, settle } = setup();
      store.tool.set('text');
      fire(art(el), 'pointerdown', 200, 200);
      fire(art(el), 'pointerup', 200, 200);
      el.querySelector('[data-testid="text-edit"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true }));
      settle();
      expect(store.tool()).toBe('select');
    });

    it('refuses a picture that is not a PNG, JPEG, WebP or SVG, or is over 2 MB, with a notice and no node', () => {
      const { store, el, settle } = setup();
      const input = el.querySelector<HTMLInputElement>('[data-testid="image-picker"]')!;
      const choose = (file: File): void => {
        Object.defineProperty(input, 'files', { configurable: true, value: [file] });
        input.dispatchEvent(new Event('change', { bubbles: true }));
        settle();
      };
      choose(new File(['x'], 'a.gif', { type: 'image/gif' }));
      expect(store.notice()).toBe('image-type');
      choose(new File([new ArrayBuffer(2 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' }));
      expect(store.notice()).toBe('image-size');
      expect([...store.doc().nodes].some((n) => n.kind === 'image')).toBe(false);
    });

    it('duplicates with Ctrl+D, groups with Ctrl+G, ungroups with Ctrl+Shift+G and orders with [ and ]', () => {
      const { store, key } = setup(shapesDocument());
      const ids = () => store.doc().nodes.map((n) => n.id);
      store.select(['bar']);
      key('d', { ctrlKey: true });
      expect(ids().slice(0, 2)).toEqual(['bar', 'bar-copy']);
      expect(store.selection()).toEqual(['bar-copy']);
      key(']', { code: 'BracketRight' });
      expect(ids().slice(0, 3)).toEqual(['bar', 'title', 'bar-copy']);
      key('[', { code: 'BracketLeft', shiftKey: true });
      expect(ids()[0]).toBe('bar-copy');
      store.select(['title', 'dot']);
      key('g', { ctrlKey: true });
      const group = store.doc().nodes.find((n) => n.kind === 'group')!;
      expect(group.children.map((c) => c.id)).toEqual(['title', 'dot']);
      expect(store.selection()).toEqual([group.id]);
      key('g', { ctrlKey: true, shiftKey: true });
      expect(store.doc().nodes.some((n) => n.kind === 'group')).toBe(false);
      expect(store.selection()).toEqual(['title', 'dot']);
    });

    it('says why a group with keyframes is not ungrouped, and leaves it', () => {
      const { store, key } = setup(shapesDocument());
      store.select(['bar', 'dot']);
      key('g', { ctrlKey: true });
      const id = store.selection()[0];
      store.apply((d) => setKeyframe(d, id, 'rotate', 1, 45));
      key('g', { ctrlKey: true, shiftKey: true });
      expect(store.problem()?.code).toBe('group-animated');
      expect(findNode(store.doc().nodes, id)).toBeDefined();
    });

    it('turns two selected nodes together about the centre of their common box, each with its own rotate', () => {
      const { store, node, el, fire, settle, view } = setup(shapesDocument());
      store.select(['bar', 'dot']);
      settle();
      stub(node('bar'), 0, 0, 100, 100);
      stub(node('dot'), 200, 0, 100, 100);
      store.select(['bar', 'dot']);
      settle();
      const handle = el.querySelector('[data-testid="handle-rotate"]')!;
      fire(handle, 'pointerdown', 250, 50);
      fire(handle, 'pointermove', 150, 150);
      fire(handle, 'pointerup', 150, 150);
      const bar = findNode(store.doc().nodes, 'bar')!;
      const dot = findNode(store.doc().nodes, 'dot')!;
      expect(bar.transform.rotate).toBeCloseTo(90, 4);
      expect(dot.transform.rotate).toBeCloseTo(90, 4);
      const pivot = toArt(view(), { x: 150, y: 50 });
      const reach = (n: typeof bar, before: { x: number; y: number }): number => Math.hypot(n.transform.x + n.transform.anchorX - pivot.x, n.transform.y + n.transform.anchorY - pivot.y) - Math.hypot(before.x - pivot.x, before.y - pivot.y);
      expect(reach(bar, { x: 70, y: 50 })).toBeCloseTo(0, 3);
      expect(reach(dot, { x: 0, y: 0 })).toBeCloseTo(0, 3);
      expect(store.past()).toHaveLength(1);
    });

    it('drags a copy with Alt: the original stays, the copy moves, one undo step', () => {
      const { store, node, fire, x } = setup();
      fire(node('tag'), 'pointerdown', 400, 300, { altKey: true });
      fire(node('tag'), 'pointermove', 436, 300, { altKey: true });
      fire(node('tag'), 'pointerup', 436, 300, { altKey: true });
      expect(x('tag')).toBe(0);
      expect(x('tag-copy')).toBeCloseTo(10, 6);
      expect(store.selection()).toEqual(['tag-copy']);
      expect(store.past()).toHaveLength(1);
      store.undo();
      expect(findNode(store.doc().nodes, 'tag-copy')).toBeUndefined();
    });

    /** Drags `tag` 294 pixels right with `logo`'s left edge 4 pixels further on; returns where it landed and how many guides showed mid-drag. */
    const dragTag = (alt: boolean) => {
      const t = setup();
      stub(t.node('tag'), 210, 150, 50, 50);
      stub(t.node('logo'), 500, 150, 100, 60);
      t.store.select(['tag']);
      t.settle();
      t.fire(t.node('tag'), 'pointerdown', 230, 160);
      t.fire(t.node('tag'), 'pointermove', 230 + 294, 160, { altKey: alt });
      const guides = t.el.querySelectorAll('[data-testid="guide"]').length;
      t.fire(t.node('tag'), 'pointerup', 230 + 294, 160, { altKey: alt });
      return { x: t.x('tag'), guides };
    };

    it('snaps a dragged node’s edge to another node’s within 6 pixels, with a guide', () => {
      const snapped = dragTag(false);
      expect(snapped.x).toBeCloseTo(290 / 3.6, 4);
      expect(snapped.guides).toBeGreaterThan(0);
    });

    it('does not snap while Alt is held', () => {
      const free = dragTag(true);
      expect(free.x).toBeCloseTo(294 / 3.6, 4);
      expect(free.guides).toBe(0);
    });

    it('centres one node on the artboard from Align', () => {
      const { store, node, settle, x, view } = setup();
      stub(node('tag'), 210, 150, 50, 50);
      store.select(['tag']);
      settle();
      store.canvasActions()!.align('centre', true);
      const centre = toScreen(view(), { x: 100, y: 50 }).x;
      expect(x('tag')).toBeCloseTo((centre - 235) / 3.6, 4);
    });
  });

  describe('the beat', () => {
    const withPulse = () => {
      const doc = setBeatLink(sampleDocument(), 'tag', 'scaleX', { kind: 'pulse', amount: 0.3, decay: 3 });
      const t = setup(doc);
      return t;
    };
    const scaleOf = (el: Element): number => {
      const nums = (el.getAttribute('transform') ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      return nums[nums.length - 4];
    };

    it('shows a pulse as a piece would: scaled up where the beat has just struck, by less half way to the next, and nothing without a beat', () => {
      const { fixture, node, settle } = withPulse();
      expect(node('tag').getAttribute('transform') ?? '').not.toContain('scale(1.3');
      fixture.componentRef.setInput('beatAt', () => ({ number: 3, position: 0 }));
      settle();
      expect(scaleOf(node('tag'))).toBeCloseTo(1.3, 6);
      fixture.componentRef.setInput('beatAt', () => ({ number: 3, position: 0.5 }));
      settle();
      expect(scaleOf(node('tag'))).toBeCloseTo(1.0375, 6);
      fixture.componentRef.setInput('beatAt', () => null);
      settle();
      expect(node('tag').getAttribute('transform') ?? '').not.toContain('scale');
    });

    it('follows the playhead through the host’s beats', () => {
      const { fixture, node, settle, store } = withPulse();
      fixture.componentRef.setInput('beatAt', (t: number) => ({ number: Math.floor(t * 2), position: (t * 2) % 1 }));
      store.seek(1);
      settle();
      expect(scaleOf(node('tag'))).toBeCloseTo(1.3, 6);
      store.seek(1.25);
      settle();
      expect(scaleOf(node('tag'))).toBeCloseTo(1.0375, 6);
    });

    it('follows the loudness the host gives', () => {
      const doc = setBeatLink(sampleDocument(), 'tag', 'scaleX', { kind: 'loudness', amount: 1 });
      const { fixture, node, settle, store } = setup(doc);
      fixture.componentRef.setInput('loudnessAt', (t: number) => t / 4);
      store.seek(2);
      settle();
      expect(scaleOf(node('tag'))).toBeCloseTo(1.5, 6);
    });
  });
});

