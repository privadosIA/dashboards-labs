import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';

import type { Box } from '../import/measure';
import { newId, newShape, type Beat, type DrawnNodeOf, type LoudnessAt, type Node, type Property, type Transform } from '../model/document';
import { editProperty } from '../model/auto-key';
import { addNode, setShape, setText, setTransform } from '../model/edits';
import { nodeStateAt } from '../model/evaluate';
import { findNode, pathTo, removeNode, walk } from '../model/tree';
import type { VectorDocument } from '../model/document';
import { VECTOR_EDITOR_LANG } from '../provide-vector-editor';
import { markupOf } from '../runtime/render-svg';
import { fontFamily } from '../runtime/fonts';
import { loadRuntime, type VectorRuntimeApi } from '../runtime/runtime';
import { vectorTexts } from '../texts';
import type { VectorStore } from '../store/vector-store';
import { alignMoves, distributeMoves, unionBox, type AlignMode, type DistributeMode, type Move } from '../tools/align';
import { drawFromDrag } from '../tools/draw';
import { checkImage, fitImage, readImage } from '../tools/image';
import { NO_GUIDES, snapToBoxes, type Guides } from '../tools/snap';
import { drawsByDragging, toolForKey } from '../tools/tools';
import { VectorTextEdit } from '../tools/text-edit/text-edit';
import {
  HANDLES,
  anchorGesture,
  anchorInParent,
  handleAt,
  inside,
  moveGesture,
  rectBetween,
  rotateAbout,
  rotateGesture,
  scaleGesture,
  scaleRatios,
  turnedBy,
  unionOf,
  type Frame,
  type Handle,
} from './gestures';
import { fitView, scaleOf, stageBox, toArt, toScreen, zoomAt, type Pt, type Size, type View } from './view';

type Values = Partial<Record<Property, number>>;

interface Start {
  transform: Transform;
  frame: Frame;
}

type Gesture =
  | { kind: 'pan'; from: Pt; panX: number; panY: number; moved: boolean }
  | { kind: 'marquee'; from: Pt; additive: boolean }
  | { kind: 'move'; from: Pt; doc: VectorDocument; ids: string[]; starts: Map<string, Start>; box?: Box; targets: Box[] }
  | { kind: 'scale'; handle: Handle; from: Pt; doc: VectorDocument; ids: string[]; starts: Map<string, Start>; box: Box; anchor: Pt }
  | { kind: 'rotate'; from: Pt; doc: VectorDocument; ids: string[]; starts: Map<string, Start>; anchor: Pt; pivot: Pt }
  | { kind: 'draw'; tool: 'rect' | 'ellipse' | 'line'; from: Pt; doc: VectorDocument; id: string; keep: boolean }
  | { kind: 'anchor'; doc: VectorDocument; id: string; start: Start };

const escapeId = (id: string): string => id.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/**
 * The canvas: the document drawn as SVG at the playhead by the same runtime the part's fragment carries, and over it an overlay in screen
 * space (selection boxes, eight scale handles, a rotate handle, the anchor, guides, the marquee) so the handles keep their size at any zoom.
 * Every gesture goes through `editProperty`: it edits the keyframe at the playhead, adds one when the property has keyframes elsewhere, and
 * changes the static value otherwise. A gesture is one history entry.
 */
@Component({
  selector: 'lab-vector-canvas',
  imports: [VectorTextEdit],
  templateUrl: './canvas.html',
  styleUrl: './canvas.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VectorCanvas {
  readonly store = input.required<VectorStore>();
  /** The host's beat at a time of the part (a piece's, from its song map), and its loudness: the canvas shows the beat links as a piece would draw them. */
  readonly beatAt = input<((t: number) => Beat | null) | undefined>(undefined);
  readonly loudnessAt = input<LoudnessAt | undefined>(undefined);

  protected readonly t = vectorTexts(inject(VECTOR_EDITOR_LANG));
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly content = viewChild<ElementRef<SVGGElement>>('content');

  protected readonly size = signal<Size>({ width: 800, height: 600 });
  private readonly zoom = signal(1);
  private readonly pan = signal<Pt>({ x: 0, y: 0 });
  /** What the canvas shows of the artboard. */
  readonly view = computed<View>(() => ({ ...fitView(this.store().doc().viewBox, this.size()), zoom: this.zoom(), panX: this.pan().x, panY: this.pan().y }));
  protected readonly vb = computed(() => this.store().doc().viewBox);
  protected readonly stage = computed(() => stageBox(this.view()));

  protected readonly boxes = signal<ReadonlyArray<{ id: string; box: Box }>>([]);
  protected readonly anchor = signal<Pt | undefined>(undefined);
  protected readonly marquee = signal<Box | undefined>(undefined);
  protected readonly guides = signal<Guides>(NO_GUIDES);
  protected readonly selected = computed(() => this.store().selection().length > 0);
  protected readonly union = computed(() => unionOf(this.boxes().map((b) => b.box)));
  protected readonly rotatePoint = computed<Pt>(() => {
    const u = this.union();
    return u ? { x: u.x + u.width / 2, y: u.y - 26 } : { x: 0, y: 0 };
  });
  protected readonly handles = computed(() => {
    const u = this.union();
    return u ? HANDLES.map((name) => ({ name, ...handleAt(u, name).at })) : [];
  });

  /** The text being typed in place: its node, where it is on the canvas and how it is drawn. */
  protected readonly editing = computed(() => {
    const id = this.store().editingText();
    const node = id ? findNode(this.store().doc().nodes, id) : undefined;
    if (!id || node?.kind !== 'text') return undefined;
    this.boxes();
    this.structure();
    this.view();
    return { id, node, box: this.boxOf(id), size: node.fontSize * scaleOf(this.view()), family: fontFamily(node.font) };
  });

  private readonly structure = computed(() => markupOf(this.store().doc().nodes));
  private readonly picker = viewChild<ElementRef<HTMLInputElement>>('picker');
  /** Where on the artboard the picture goes once a file is chosen. */
  private pictureAt: Pt = { x: 0, y: 0 };
  /** A text node made a moment ago and not yet typed: Escape or an empty text takes it away again. */
  private freshText: string | undefined;
  private runtime: ReturnType<VectorRuntimeApi['create']> | undefined;
  private gesture: Gesture | undefined;
  private spaceDown = false;
  private spaceUsed = false;

  constructor() {
    // The drawing is rebuilt when the tree or the markup changes, and only then: the rest of an edit just moves attributes.
    effect(() => {
      const markup = this.structure();
      const g = this.content()?.nativeElement;
      if (!g) return;
      untracked(() => {
        g.innerHTML = markup;
        this.runtime = loadRuntime().create(this.store().doc(), g, {}, { loudnessAt: (t) => this.loudnessAt()?.(t) as number });
      });
    });
    effect(() => {
      const doc = this.store().doc();
      const at = this.store().playhead();
      this.structure();
      this.content();
      this.view();
      this.store().selection();
      const beat = this.beatAt();
      this.loudnessAt();
      const runtime = this.runtime;
      if (!runtime) return;
      runtime.setModel(doc);
      runtime.seek(at, beat ? beat(at) : undefined);
      untracked(() => this.measure());
    });
    effect((onCleanup) => {
      const store = this.store();
      store.canvasActions.set({ align: (mode, toArtboard) => this.align(mode, toArtboard), distribute: (mode) => this.distribute(mode) });
      onCleanup(() => store.canvasActions.set(undefined));
    });
    afterNextRender(() => {
      const el = this.host().nativeElement;
      const read = (): void => {
        if (el.clientWidth > 0 && el.clientHeight > 0) this.size.set({ width: el.clientWidth, height: el.clientHeight });
      };
      read();
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(read).observe(el);
    });
  }

  // — the drawing's elements and where they are —

  private elementOf(id: string): SVGGraphicsElement | null {
    return this.content()?.nativeElement.querySelector<SVGGraphicsElement>(`[id="${escapeId(id)}"]`) ?? null;
  }

  private hostRect(): DOMRect {
    return this.host().nativeElement.getBoundingClientRect();
  }

  /** The element's box in the canvas's own pixels. */
  private boxOf(id: string): Box {
    const r = this.elementOf(id)?.getBoundingClientRect();
    const h = this.hostRect();
    return r ? { x: r.left - h.left, y: r.top - h.top, width: r.width, height: r.height } : { x: 0, y: 0, width: 0, height: 0 };
  }

  /** The way between the canvas and the coordinates a node's own transform lives in: its parent's. Without layout it is the artboard's. */
  private frameOf(id: string): Frame {
    const view = this.view();
    const parent = this.elementOf(id)?.parentNode as SVGGraphicsElement | null | undefined;
    const ctm = parent && typeof parent.getScreenCTM === 'function' ? parent.getScreenCTM() : null;
    if (!ctm) return { toLocal: (p) => toArt(view, p), toScreen: (p) => toScreen(view, p) };
    const h = this.hostRect();
    const det = ctm.a * ctm.d - ctm.b * ctm.c || 1e-9;
    return {
      toScreen: (p) => ({ x: ctm.a * p.x + ctm.c * p.y + ctm.e - h.left, y: ctm.b * p.x + ctm.d * p.y + ctm.f - h.top }),
      toLocal: (p) => {
        const x = p.x + h.left - ctm.e;
        const y = p.y + h.top - ctm.f;
        return { x: (ctm.d * x - ctm.c * y) / det, y: (-ctm.b * x + ctm.a * y) / det };
      },
    };
  }

  private transformOf(id: string): Transform {
    return nodeStateAt(findNode(this.store().doc().nodes, id)!, this.store().playhead()).transform;
  }

  private measure(): void {
    const ids = this.store().selection();
    this.boxes.set(ids.map((id) => ({ id, box: this.boxOf(id) })));
    this.anchor.set(ids.length === 1 && this.elementOf(ids[0]) ? this.frameOf(ids[0]).toScreen(anchorInParent(this.transformOf(ids[0]))) : undefined);
  }

  /** The selected nodes that have no selected ancestor: moving both would move the child twice. */
  private topmost(): string[] {
    return this.store().topmostSelection();
  }

  private starts(ids: readonly string[]): Map<string, Start> {
    return new Map(ids.map((id) => [id, { transform: this.transformOf(id), frame: this.frameOf(id) }]));
  }

  /** The node a click landed on: the nearest element up the tree that is a node the person can pick (not locked). */
  private nodeAt(target: EventTarget | null): string | undefined {
    const g = this.content()?.nativeElement;
    const doc = this.store().doc();
    for (let el = target instanceof Element ? target : null; el && g?.contains(el); el = el.parentElement) {
      const node = el.id ? findNode(doc.nodes, el.id) : undefined;
      if (node && !node.locked) return node.id;
    }
    return undefined;
  }

  private point(e: MouseEvent): Pt {
    const h = this.hostRect();
    return { x: e.clientX - h.left, y: e.clientY - h.top };
  }

  private patch(doc: VectorDocument, id: string, values: Values, extra?: Partial<Transform>): VectorDocument {
    let next = doc;
    for (const [key, value] of Object.entries(values)) next = editProperty(next, id, key as Property, this.store().playhead(), value);
    return extra ? setTransform(next, id, extra) : next;
  }

  // — the mouse —

  protected down(e: PointerEvent): void {
    const el = this.host().nativeElement;
    el.focus({ preventScroll: true });
    const p = this.point(e);
    const store = this.store();
    if (e.button === 1 || this.spaceDown) {
      this.spaceUsed = true;
      this.gesture = { kind: 'pan', from: p, panX: this.pan().x, panY: this.pan().y, moved: false };
      this.capture(e);
      return;
    }
    if (e.button !== 0) return;
    const handle = (e.target instanceof Element ? e.target.closest('[data-handle]') : null)?.getAttribute('data-handle');
    const tool = store.tool();
    if (tool !== 'select' && !handle) {
      this.useTool(tool, p, e.shiftKey);
      this.capture(e);
      return;
    }
    if (handle) {
      this.startHandle(handle, p);
      this.capture(e);
      return;
    }
    const id = this.nodeAt(e.target);
    if (id) {
      if (e.shiftKey) store.toggleSelect(id);
      else if (!store.selection().includes(id)) store.select([id]);
      if (store.selection().includes(id)) this.startMove(p, e.altKey);
    } else {
      if (!e.shiftKey) store.clearSelection();
      this.gesture = { kind: 'marquee', from: p, additive: e.shiftKey };
    }
    this.capture(e);
  }

  /** Alt+drag: the copies are made inside the same step as the drag and are the ones that move. */
  private startMove(p: Pt, copy: boolean): void {
    const store = this.store();
    const original = this.topmost();
    const union = unionOf(original.map((i) => this.boxOf(i)));
    const targets = this.snapTargets();
    const framed = this.starts(original);
    store.begin();
    let ids = original;
    if (copy) {
      store.duplicateSelection();
      ids = this.topmost();
    }
    const starts = new Map<string, Start>(ids.map((id, i) => [id, { transform: this.transformOf(id), frame: framed.get(original[i])!.frame }]));
    this.gesture = { kind: 'move', from: p, doc: store.doc(), ids, starts, box: union && (union.width > 0 || union.height > 0) ? union : undefined, targets };
  }

  private startHandle(handle: string, p: Pt): void {
    const store = this.store();
    const ids = this.topmost();
    if (!ids.length) return;
    const starts = this.starts(ids);
    const doc = store.doc();
    const anchor = starts.get(ids[0])!.frame.toScreen(anchorInParent(starts.get(ids[0])!.transform));
    if (handle === 'anchor') {
      if (this.store().selection().length !== 1) return;
      store.begin();
      this.gesture = { kind: 'anchor', doc, id: ids[0], start: starts.get(ids[0])! };
    } else if (handle === 'rotate') {
      const u = this.union();
      // One node turns about its anchor; several turn about the centre of their common box.
      const pivot = ids.length > 1 && u ? { x: u.x + u.width / 2, y: u.y + u.height / 2 } : anchor;
      store.begin();
      this.gesture = { kind: 'rotate', from: p, doc, ids, starts, anchor, pivot };
    } else {
      const box = this.union();
      if (!box) return;
      store.begin();
      this.gesture = { kind: 'scale', handle: handle as Handle, from: p, doc, ids, starts, box, anchor };
    }
  }

  // — drawing —

  private useTool(tool: Exclude<ReturnType<VectorStore['tool']>, 'select'>, p: Pt, shift: boolean): void {
    if (drawsByDragging(tool)) this.startDraw(tool, p, shift);
    else if (tool === 'text') this.placeText(p, shift);
    else this.askForImage(p, shift);
  }

  private artPoint(p: Pt): Pt {
    return toArt(this.view(), p);
  }

  /** Adds the node at the pointer, at its default size, and lets the drag size it: all of it one step of the history. */
  private startDraw(tool: 'rect' | 'ellipse' | 'line', p: Pt, shift: boolean): void {
    const store = this.store();
    const id = newId(store.doc(), tool);
    const node = newShape(tool, id, this.t.tools.nodeNames[tool]);
    const from = this.artPoint(p);
    const base = addNode(store.doc(), this.shaped(node, from, from, false));
    store.begin();
    store.update(() => base);
    store.select([id]);
    this.gesture = { kind: 'draw', tool, from, doc: base, id, keep: shift };
  }

  /** The node with what a drag from `a` to `b` makes of it (its position and its size, or its end). */
  private shaped<N extends DrawnNodeOf>(node: N, a: Pt, b: Pt, shift: boolean): N {
    if (node.kind !== 'rect' && node.kind !== 'ellipse' && node.kind !== 'line') return node;
    const defaults = { width: 'width' in node ? node.width : 0, height: 'height' in node ? node.height : 0, x2: 'x2' in node ? node.x2 : 0, y2: 'y2' in node ? node.y2 : 0 };
    return { ...node, ...drawFromDrag(node.kind, a, b, shift, node.transform, defaults) } as N;
  }

  /** The text tool: a text node where the click was, with its words ready to be typed. */
  private placeText(p: Pt, keep: boolean): void {
    const store = this.store();
    const id = newId(store.doc(), 'text');
    const at = this.artPoint(p);
    const node = newShape('text', id, this.t.tools.nodeNames['text'], { transform: { x: at.x, y: at.y, scaleX: 1, scaleY: 1, rotate: 0, anchorX: 0, anchorY: 0 } });
    store.apply((doc) => addNode(doc, node));
    store.select([id]);
    this.freshText = id;
    store.editingText.set(id);
    if (!keep) store.tool.set('select');
  }

  /** The image tool: remember where the click was and open the file picker. */
  private askForImage(p: Pt, keep: boolean): void {
    this.pictureAt = this.artPoint(p);
    if (!keep) this.store().tool.set('select');
    this.picker()?.nativeElement.click();
  }

  protected pictureChosen(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void this.addPicture(file);
  }

  private async addPicture(file: File): Promise<void> {
    const store = this.store();
    const problem = checkImage(file);
    if (problem) {
      store.notice.set(problem === 'type' ? 'image-type' : 'image-size');
      return;
    }
    try {
      const picture = await readImage(file);
      const doc = store.doc();
      const size = fitImage(picture, doc.viewBox);
      const id = newId(doc, 'image');
      const name = file.name.replace(/\.[^.]+$/, '') || this.t.tools.nodeNames['image'];
      const node = newShape('image', id, name, {
        source: picture.source,
        ...size,
        transform: { x: this.pictureAt.x - size.width / 2, y: this.pictureAt.y - size.height / 2, scaleX: 1, scaleY: 1, rotate: 0, anchorX: size.width / 2, anchorY: size.height / 2 },
      });
      store.apply((d) => addNode(d, node));
      store.select([id]);
      store.notice.set(picture.large ? 'image-large' : undefined);
    } catch {
      store.notice.set('image-failed');
    }
  }

  // — typing a text in place —

  protected editText(e: MouseEvent): void {
    const id = this.nodeAt(e.target);
    if (id && findNode(this.store().doc().nodes, id)?.kind === 'text') {
      this.store().select([id]);
      this.freshText = undefined;
      this.store().editingText.set(id);
    }
  }

  protected commitText(words: string): void {
    const store = this.store();
    const id = store.editingText();
    store.editingText.set(undefined);
    if (!id) return;
    const fresh = this.freshText === id;
    this.freshText = undefined;
    if (words.trim() === '') {
      if (fresh) this.dropNode(id);
      return;
    }
    store.apply((doc) => setText(doc, id, { content: words }), `text:${id}`);
    this.host().nativeElement.focus({ preventScroll: true });
  }

  protected cancelText(): void {
    const store = this.store();
    const id = store.editingText();
    store.editingText.set(undefined);
    if (id && this.freshText === id) this.dropNode(id);
    this.freshText = undefined;
    this.host().nativeElement.focus({ preventScroll: true });
  }

  private dropNode(id: string): void {
    this.store().apply((doc) => ({ ...doc, nodes: removeNode(doc.nodes, id) }));
    this.store().clearSelection();
  }

  // — snapping and alignment —

  private artboardBox(): Box {
    const view = this.view();
    const a = toScreen(view, { x: view.vb.x, y: view.vb.y });
    const b = toScreen(view, { x: view.vb.x + view.vb.width, y: view.vb.y + view.vb.height });
    return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
  }

  /** What a node being moved snaps to: the artboard and the boxes of every other node (what groups and imports hold too), in canvas pixels. */
  private snapTargets(): Box[] {
    const selected = new Set(this.store().selection());
    const out: Box[] = [this.artboardBox()];
    const visit = (nodes: readonly Node[]): void => {
      for (const n of nodes) {
        if (selected.has(n.id) || !n.visible) continue;
        const box = this.boxOf(n.id);
        if (box.width > 0 || box.height > 0) out.push(box);
        visit(n.children);
      }
    };
    visit(this.store().doc().nodes);
    return out;
  }

  private applyMoves(moves: readonly Move[]): void {
    if (!moves.length) return;
    const starts = this.starts(moves.map((m) => m.id));
    this.store().apply(
      (doc) =>
        moves.reduce((d, m) => {
          const s = starts.get(m.id)!;
          return this.patch(d, m.id, moveGesture(s.transform, s.frame, { x: 0, y: 0 }, { x: m.dx, y: m.dy }));
        }, doc),
      'align',
    );
  }

  /** Align › left … bottom: to the selection's own box with two or more nodes, to the artboard with one or when asked. */
  private align(mode: AlignMode, toArtboard: boolean): void {
    const ids = this.topmost();
    if (!ids.length) return;
    const items = ids.map((id) => ({ id, box: this.boxOf(id) }));
    this.applyMoves(alignMoves(items, mode, toArtboard || ids.length === 1 ? this.artboardBox() : unionBox(items)));
  }

  private distribute(mode: DistributeMode): void {
    this.applyMoves(distributeMoves(this.topmost().map((id) => ({ id, box: this.boxOf(id) })), mode));
  }

  private capture(e: PointerEvent): void {
    try {
      this.host().nativeElement.setPointerCapture(e.pointerId);
    } catch {
      // Not every pointer can be captured (a synthetic one, a pen that left): the gesture goes on with what the host hears.
    }
  }

  protected move(e: PointerEvent): void {
    const g = this.gesture;
    if (!g) return;
    const p = this.point(e);
    const store = this.store();
    switch (g.kind) {
      case 'pan':
        g.moved = true;
        this.pan.set({ x: g.panX + p.x - g.from.x, y: g.panY + p.y - g.from.y });
        break;
      case 'marquee':
        this.marquee.set(rectBetween(g.from, p));
        break;
      case 'draw': {
        const to = this.artPoint(p);
        store.update(() => {
          const node = findNode(g.doc.nodes, g.id) as DrawnNodeOf;
          const next = this.shaped(node, g.from, to, e.shiftKey);
          const patch = { ...(next.kind === 'line' ? { x2: next.x2, y2: next.y2 } : { width: (next as { width: number }).width, height: (next as { height: number }).height }) };
          return setShape(setTransform(g.doc, g.id, next.transform), g.id, patch);
        });
        break;
      }
      case 'move': {
        let to = p;
        let guides = NO_GUIDES;
        // Alt suspends the snapping; a copy made with Alt snaps again as soon as it is let go.
        if (g.box && !e.altKey) {
          const snap = snapToBoxes({ ...g.box, x: g.box.x + p.x - g.from.x, y: g.box.y + p.y - g.from.y }, g.targets);
          to = { x: p.x + snap.dx, y: p.y + snap.dy };
          guides = snap.guides;
        }
        this.guides.set(guides);
        store.update(() => g.ids.reduce((doc, id) => this.patch(doc, id, moveGesture(g.starts.get(id)!.transform, g.starts.get(id)!.frame, g.from, to)), g.doc));
        break;
      }
      case 'scale': {
        const ratios = scaleRatios(g.box, g.handle, p, { uniform: e.shiftKey, aroundAnchor: e.altKey }, g.anchor);
        store.update(() => g.ids.reduce((doc, id) => this.patch(doc, id, scaleGesture(g.starts.get(id)!.transform, g.starts.get(id)!.frame, ratios)), g.doc));
        break;
      }
      case 'rotate': {
        if (g.ids.length === 1) {
          const id = g.ids[0];
          store.update(() => this.patch(g.doc, id, { rotate: rotateGesture(g.starts.get(id)!.transform, g.anchor, g.from, p, e.shiftKey) }));
          break;
        }
        const delta = turnedBy(g.pivot, g.from, p, e.shiftKey);
        store.update(() =>
          g.ids.reduce((doc, id) => {
            const start = g.starts.get(id)!;
            return this.patch(doc, id, rotateAbout(start.transform, start.frame.toLocal(g.pivot), delta));
          }, g.doc),
        );
        break;
      }
      case 'anchor': {
        const { x, y, anchorX, anchorY } = anchorGesture(g.start.transform, g.start.frame, p);
        store.update(() => this.patch(g.doc, g.id, { x, y }, { anchorX, anchorY }));
        break;
      }
    }
  }

  protected up(e: PointerEvent): void {
    const g = this.gesture;
    this.gesture = undefined;
    this.guides.set(NO_GUIDES);
    if (!g) return;
    if (g.kind === 'marquee') {
      const rect = this.marquee();
      this.marquee.set(undefined);
      if (rect && (rect.width > 2 || rect.height > 2)) this.selectInside(rect, g.additive);
    } else if (g.kind !== 'pan') {
      this.store().end();
      if (g.kind === 'draw' && !g.keep) this.store().tool.set('select');
    }
    try {
      this.host().nativeElement.releasePointerCapture(e.pointerId);
    } catch {
      // Nothing was captured.
    }
  }

  /** The nodes wholly inside the rectangle, the outermost ones: a group and what it holds are one choice. */
  private selectInside(rect: Box, additive: boolean): void {
    const doc = this.store().doc();
    const hit = [...walk(doc.nodes)].filter((n) => {
      if (n.locked || !n.visible) return false;
      const box = this.boxOf(n.id);
      return (box.width > 0 || box.height > 0) && inside(box, rect);
    });
    const ids = hit.map((n) => n.id);
    this.store().select(
      ids.filter((id) => !ids.some((other) => other !== id && pathTo(doc.nodes, id)?.includes(other))),
      additive,
    );
  }

  protected wheel(e: WheelEvent): void {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const next = zoomAt(this.view(), Math.exp(-e.deltaY * 0.0015), this.point(e));
      this.zoom.set(next.zoom);
      this.pan.set({ x: next.panX, y: next.panY });
    } else this.pan.update((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
  }

  // — the keyboard —

  protected keydown(e: KeyboardEvent): void {
    const store = this.store();
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) store.redo();
      else store.undo();
    } else if (mod && key === 'y') {
      e.preventDefault();
      store.redo();
    } else if (mod && key === 'd') {
      e.preventDefault();
      store.duplicateSelection();
    } else if (mod && key === 'g') {
      e.preventDefault();
      if (e.shiftKey) store.ungroupSelection();
      else store.groupSelection();
    } else if (!mod && !e.altKey && (e.code === 'BracketLeft' || e.code === 'BracketRight' || e.key === '[' || e.key === ']' || e.key === '{' || e.key === '}')) {
      e.preventDefault();
      store.arrangeSelection(e.code === 'BracketLeft' || e.key === '[' || e.key === '{' ? 'back' : 'forward', e.shiftKey);
    } else if (!mod && !e.altKey && toolForKey(e.key)) {
      e.preventDefault();
      store.tool.set(toolForKey(e.key)!);
    } else if (e.key.startsWith('Arrow') && !mod) {
      e.preventDefault();
      this.nudge(e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0, e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0, e.shiftKey ? 10 : 1);
    } else if (e.key === '0' && !mod) {
      this.zoom.set(1);
      this.pan.set({ x: 0, y: 0 });
    } else if (e.key === 'Escape') {
      if (store.tool() !== 'select') store.tool.set('select');
      else store.clearSelection();
    } else if (e.key === ' ') {
      // Held, Space pans with the mouse; tapped, it plays or pauses. Either way the page's own Space handler does not hear it.
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) {
        this.spaceDown = true;
        this.spaceUsed = false;
      }
    }
  }

  protected keyup(e: KeyboardEvent): void {
    if (e.key !== ' ' || !this.spaceDown) return;
    this.spaceDown = false;
    if (!this.spaceUsed) this.store().togglePlay();
  }

  /** Moves the selection by `n` units of the artboard (not pixels of the screen). */
  private nudge(dx: number, dy: number, n: number): void {
    const ids = this.topmost();
    if (!ids.length || (!dx && !dy)) return;
    const s = scaleOf(this.view());
    const starts = this.starts(ids);
    this.store().apply((doc) => ids.reduce((d, id) => this.patch(d, id, moveGesture(starts.get(id)!.transform, starts.get(id)!.frame, { x: 0, y: 0 }, { x: dx * n * s, y: dy * n * s })), doc), 'nudge');
  }
}
