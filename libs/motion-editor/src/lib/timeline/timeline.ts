import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, model, output, signal, untracked, viewChild } from '@angular/core';

import { BLANK_PART, MAX_LAYERS, MAX_PAGE_PARTS, moveLayer, MIN_SECONDS, addItemKeyframe, addKeyframe, evaluateKeyframes, hasLayersFeature, keyframesOf, layerEditProblem, layerOf, moveBlock, moveCut, moveExtra, moveItem, moveItemKeyframe, moveKeyframe, resizeItem, swapContents, type Catalog, type Keyframe, type Script, type SongMap } from '@lab/animation-core';

import { PALETTE_MIME, itemFromJson, type PaletteItem } from '../palette/palette-item';
import { MOTION_EDITOR_LANG } from '../provide-motion-editor';
import { snapToSections } from '../snap/snap';
import type { Warning } from '../store/checks';
import { warningText } from '../store/warning-text';
import { motionEditorTexts } from '../texts';
import { blocksOf } from './blocks';
import { LANE_HEIGHT, MAX_EXTRAS, MIN_WORD_PX, PAGE_PARTS_NOTE_FROM } from './constants';
import { keyframeRows, type KeyframeRow, type KeyframeSpan } from './keyframe-rows';
import { itemKeyframeRows, layerLanes, type ItemKeyframeRow } from './layer-lanes';
import { TimeScale, barBeats, inRange, rulerStep } from './scale';
import { sameItemSelection, sameSelection, type ItemSelection, type Selection } from './selection';

/** Pixels painted beyond each edge of the window, so a scroll does not show unpainted ground. */
const MARGIN_PX = 240;
const WHEEL_STEP = 1.15;

/** A change the timeline asks of its host: a drag is `begin`, a run of `update`s and `end` (one step of the history); anything else is one `apply`. */
export interface TimelineEdit {
  readonly phase: 'begin' | 'update' | 'end' | 'apply';
  readonly change?: (script: Script) => Script;
}

/** Pixels the pointer must travel before a press on a block or a cut becomes a drag, so that a click is still a click. */
const DRAG_PX = 4;

/** Pixels within which a dragged edge of an item sticks to a cut of the pieces. */
const CUT_SNAP_PX = 8;

/** Seconds a key press moves a cut or a block: Shift for coarse, Alt for fine. */
const KEY_STEP = 0.1;
const KEY_STEP_COARSE = 1;
const KEY_STEP_FINE = 0.01;

/** The seconds an arrow key press moves something: left is back, right is forward. */
const keyStep = (event: KeyboardEvent): number => (event.shiftKey ? KEY_STEP_COARSE : event.altKey ? KEY_STEP_FINE : KEY_STEP) * (event.key === 'ArrowLeft' ? -1 : 1);

/** Where a drop on the lanes lands: the main track, an extra lane (its index), a layer lane, the space for a new layer, or elsewhere. */
export type DropLane = 'main' | 'other' | 'new-layer' | number | { readonly layer: number };

interface Gesture {
  readonly kind: 'cut' | 'body' | 'swap' | 'extra' | 'keyframe' | 'item' | 'item-start' | 'item-end' | 'item-keyframe';
  /** For an item: its layer (the `id` is that too) and its place in the lane. */
  readonly layer?: string;
  readonly item?: number;
  /** For a keyframe: the parameter and the place of the keyframe in its list. */
  readonly param?: string;
  readonly keyframe?: number;
  /** The extra being dragged to another lane, when it is one. */
  readonly extra?: number;
  readonly id: string;
  readonly index: number;
  /** The script when the press began: a drag is always placed from it, so it can be moved back and forth. */
  readonly origin: Script;
  readonly pointerTime: number;
  readonly originTime: number;
  readonly x0: number;
  readonly y0: number;
  moving: boolean;
}

const clock = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/**
 * The song and the script on one horizontal axis: a ruler with bars, the sections, the loudness, the words, the main track (one block per
 * script piece) and three extra lanes (the `with` parts), and the playhead over all of them. Read-only here: it seeks and selects. Zooms
 * from 4 to 400 pixels a second (Ctrl and the wheel around the pointer, + and −), scrolls with the wheel, and paints only what is in view.
 */
@Component({
  selector: 'lab-motion-timeline',
  templateUrl: './timeline.html',
  styleUrl: './timeline.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MotionTimeline {
  readonly songMap = input.required<SongMap>();
  readonly script = input.required<Script>();
  /** The song time of the playhead, in seconds. */
  readonly playhead = input(0);
  readonly selection = input<Selection | null>(null);
  /** The item of a layer that is selected, apart from the pieces' selection. */
  readonly itemSelection = input<ItemSelection | null>(null);
  /** The magnet: while on, cuts land on the nearest beat (or section boundary) within half a beat. Alt suspends it while held. */
  readonly magnet = model(true);
  /** What the live checks found; a block with a warning of its own carries a mark that says it. */
  readonly warnings = input<readonly Warning[]>([]);
  /** Why the server refused each piece of the script, by id: the block carries a mark in the colour of an error. */
  readonly refused = input<Readonly<Record<string, string>>>({});
  /** How a review graded each piece of the script, by id: the block carries a small mark in the colour of its verdict, with the host's words as its title. */
  readonly grades = input<Readonly<Record<string, { readonly verdict: 'pass' | 'weak' | 'fail'; readonly text: string }>>>({});
  /** While the piece is being drawn or proposed, nothing can be dragged. */
  readonly locked = input(false);
  /** The catalog, to know which parameters are whole numbers when a keyframe is added at a time the keyframes do not name. */
  readonly catalog = input<Catalog | null>(null);
  /** Pixels a second. */
  readonly zoom = model(40);
  readonly seek = output<number>();
  readonly select = output<Selection | null>();
  readonly removeExtra = output<Selection>();
  readonly removeLine = output<Selection>();
  readonly selectItem = output<ItemSelection | null>();
  readonly removeItem = output<ItemSelection>();
  /** Why a drag of an item stopped where it did, in the server's words (empty when it is free again). */
  readonly itemRefused = output<string>();
  /** What a drag asks of the script. The timeline never owns it: the host applies the change to its document and its history. */
  readonly edit = output<TimelineEdit>();
  /** Something from the palette was dropped: what, at what song time, and on which lane (`main`, an extra lane by its index, or `other` for the rest). */
  readonly dropItem = output<{ readonly item: PaletteItem; readonly time: number; readonly lane: DropLane }>();

  protected readonly t = motionEditorTexts(inject(MOTION_EDITOR_LANG));
  protected readonly lane = LANE_HEIGHT;
  protected readonly noteFrom = PAGE_PARTS_NOTE_FROM;
  protected readonly maxParts = MAX_PAGE_PARTS;
  protected readonly extraLanes = Array.from({ length: MAX_EXTRAS }, (_, i) => i);
  private readonly injector = inject(Injector);
  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');

  protected readonly scrollLeft = signal(0);
  protected readonly viewWidth = signal(1000);
  protected readonly scale = computed(() => new TimeScale(this.zoom()));
  protected readonly width = computed(() => Math.max(this.viewWidth(), this.scale().xOf(this.songMap().duration)));
  private readonly range = computed(() => {
    const v = this.scale().visible(Math.max(0, this.scrollLeft() - MARGIN_PX), this.viewWidth() + 2 * MARGIN_PX);
    return v;
  });

  protected readonly blocks = computed(() => inRange(blocksOf(this.script(), this.songMap()), this.range().from, this.range().to));
  /** One row under the extra lanes for every parameter that has keyframes. */
  protected readonly kfRows = computed(() => keyframeRows(this.script()));
  /** A lane for every layer the script has, in the order the server draws them, and a space under them for one more when the server takes layers. */
  protected readonly layerLanes = computed(() => layerLanes(this.script()).map((l) => ({ ...l, items: inRange(l.items, this.range().from, this.range().to) })));
  protected readonly canAddLayer = computed(() => hasLayersFeature(this.catalog()) && (this.script().layers?.length ?? 0) < MAX_LAYERS);
  protected readonly itemKfRows = computed(() => itemKeyframeRows(this.script()));
  protected readonly sections = computed(() => inRange(this.songMap().sections, this.range().from, this.range().to).map((s, i) => ({ ...s, tone: i % 4 })));
  protected readonly words = computed(() => inRange(this.songMap().words, this.range().from, this.range().to).filter((w) => this.scale().widthOf(w.end - w.start) >= MIN_WORD_PX));
  protected readonly bars = computed(() => {
    const m = this.songMap();
    return barBeats(m.beats, m.beatBase, this.range().from, this.range().to).map((i) => m.beats[i]);
  });
  protected readonly marks = computed(() => {
    const step = rulerStep(this.zoom());
    const { from, to } = this.range();
    const out: { t: number; label: string }[] = [];
    for (let t = Math.max(0, Math.floor(from / step) * step); t <= Math.min(to, this.songMap().duration); t += step) out.push({ t, label: clock(t) });
    return out;
  });
  protected readonly loudnessPath = computed(() => {
    const m = this.songMap();
    if (m.loudnessHop <= 0 || m.loudness.length === 0) return '';
    const { from, to } = this.range();
    const a = Math.max(0, Math.floor(from / m.loudnessHop));
    const b = Math.min(m.loudness.length - 1, Math.ceil(to / m.loudnessHop));
    const h = LANE_HEIGHT.loudness;
    const pts: string[] = [];
    for (let i = a; i <= b; i++) pts.push(`${i === a ? 'M' : 'L'}${this.scale().xOf(i * m.loudnessHop).toFixed(1)},${(h - 2 - Math.max(0, Math.min(1, m.loudness[i])) * (h - 4)).toFixed(1)}`);
    return pts.join(' ');
  });

  /** The block (a selector) that is to take the focus once the script the host hands back shows it where it moved: an extra that changed lane, the contents of a piece swapped. */
  private focusAfter: string | null = null;

  constructor() {
    effect(() => {
      this.script();
      untracked(() => {
        const want = this.focusAfter;
        if (!want) return;
        afterNextRender(
          () => {
            const block = this.scroller().nativeElement.querySelector(want) as SVGElement | null;
            if (block) {
              block.focus();
              if (this.focusAfter === want) this.focusAfter = null;
            }
          },
          { injector: this.injector },
        );
      });
    });
    // The window follows the playhead: when it moves out of view (a jump from the layers, or playing past the edge) the window goes to it.
    effect(() => {
      const t = this.playhead();
      untracked(() => {
        const el = this.scroller().nativeElement;
        const x = this.scale().xOf(t);
        const width = el.clientWidth || this.viewWidth();
        if (x < el.scrollLeft || x > el.scrollLeft + width) {
          el.scrollLeft = Math.max(0, x - width / 2);
          this.scrollLeft.set(el.scrollLeft);
        }
      });
    });
    effect((onCleanup) => {
      const el = this.scroller().nativeElement;
      const measure = (): void => {
        if (el.clientWidth > 0) this.viewWidth.set(el.clientWidth);
      };
      measure();
      if (typeof ResizeObserver === 'undefined') return;
      const watcher = new ResizeObserver(measure);
      watcher.observe(el);
      onCleanup(() => watcher.disconnect());
    });
  }

  protected isEmpty(block: { readonly part: string; readonly dots: readonly number[]; readonly hit?: number; readonly extras: readonly unknown[] }): boolean {
    return block.part === BLANK_PART && block.extras.length === 0 && block.dots.length === 0 && block.hit === undefined;
  }

  protected x(t: number): number {
    return this.scale().xOf(t);
  }

  protected w(from: number, to: number): number {
    return Math.max(1, this.scale().widthOf(to - from));
  }

  protected isSelected(piece: string, extra?: number): boolean {
    const sel = this.selection();
    if (extra === undefined && sel?.piece === piece && sel.extra === undefined) return true;
    return sameSelection(sel, extra === undefined ? { piece } : { piece, extra });
  }

  protected rowLabel(row: KeyframeRow): string {
    return row.extra === undefined ? row.param : `${this.t.timeline.extra(row.extra + 1)} · ${row.param}`;
  }

  /** The path of a diamond centred on `cx`, in the middle of a keyframe row. */
  protected diamond(cx: number): string {
    const cy = LANE_HEIGHT.keyframe / 2;
    return `M${cx - 6},${cy} L${cx},${cy - 6} L${cx + 6},${cy} L${cx},${cy + 6} Z`;
  }

  protected keyframeSelected(span: KeyframeSpan, row: KeyframeRow, n: number): boolean {
    return sameSelection(this.selection(), { piece: span.piece, ...(row.extra !== undefined ? { extra: row.extra } : {}), param: row.param, keyframe: n });
  }

  protected keyframeLabel(row: KeyframeRow, span: KeyframeSpan, n: number): string {
    return this.t.timeline.keyframe(row.param, `${(span.start + span.frames[n].t).toFixed(2)} s`);
  }

  protected pickKeyframe(event: Event, row: KeyframeRow, span: KeyframeSpan, n: number): void {
    event.stopPropagation();
    if (this.justDragged) return;
    this.select.emit({ piece: span.piece, ...(row.extra !== undefined ? { extra: row.extra } : {}), param: row.param, keyframe: n });
  }

  /** Pressing a diamond: dragging it moves the keyframe in time, with the magnet unless Alt is held, and never out of the piece or past its neighbours. */
  protected onKeyframeDown(event: PointerEvent, row: KeyframeRow, span: KeyframeSpan, n: number): void {
    const piece = this.script().pieces[span.index];
    if (event.button !== 0 || this.locked() || !piece) return;
    event.stopPropagation();
    try {
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    } catch {
      // a pointer that cannot be captured still drags while it stays over the lanes
    }
    this.gesture = { kind: 'keyframe', id: span.piece, index: span.index, origin: this.script(), pointerTime: this.timeAt(event.clientX), originTime: span.start + span.frames[n].t, x0: event.clientX, y0: event.clientY, moving: false, param: row.param, keyframe: n, ...(row.extra !== undefined ? { extra: row.extra } : {}) };
  }

  /** A double click on a row adds a keyframe there, with the value the parameter has at that time. */
  protected addKeyframeAt(event: MouseEvent, row: KeyframeRow): void {
    if (this.locked()) return;
    event.stopPropagation();
    const time = this.timeAt(event.clientX);
    const span = row.spans.find((s) => time >= s.start && time <= s.end);
    if (!span) return;
    const t = Math.round((time - span.start) * 1000) / 1000;
    const whole = this.catalog()?.parts.find((p) => p.name === span.part)?.params.find((q) => q.name === row.param)?.type === 'int';
    const value = evaluateKeyframes(span.frames, t, whole);
    if (value === undefined) return;
    const frame: Keyframe = { t, value, ease: 'linear' };
    this.edit.emit({ phase: 'apply', change: (s) => addKeyframe(s, s.pieces.findIndex((p) => p.id === span.piece), row.param, frame, row.extra) });
    this.select.emit({ piece: span.piece, ...(row.extra !== undefined ? { extra: row.extra } : {}), param: row.param, keyframe: span.frames.filter((f) => f.t < t - 0.005).length });
  }

  /** The lane of a drop as the markup names it. */
  protected laneName(lane: DropLane): string {
    return typeof lane === 'object' ? `layer-${lane.layer}` : String(lane);
  }

  /** The place a layer being dragged by its label would take, while it is dragged. */
  protected readonly layerTarget = signal<number | null>(null);
  private layerDrag: { readonly from: number; readonly y0: number; moving: boolean } | null = null;

  /** Pressing a layer's label: dragging it up or down changes where it is in the drawing order. */
  protected onLayerLabelDown(event: PointerEvent, index: number): void {
    if (event.button !== 0 || this.locked()) return;
    try {
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    } catch {
      // a pointer that cannot be captured still drags while it stays over the label
    }
    this.layerDrag = { from: index, y0: event.clientY, moving: false };
  }

  protected onLayerLabelMove(event: PointerEvent): void {
    const g = this.layerDrag;
    if (!g) return;
    if (!g.moving && Math.abs(event.clientY - g.y0) < DRAG_PX) return;
    g.moving = true;
    const count = this.script().layers?.length ?? 0;
    this.layerTarget.set(Math.min(count - 1, Math.max(0, g.from + Math.round((event.clientY - g.y0) / LANE_HEIGHT.layer))));
  }

  protected onLayerLabelUp(): void {
    const g = this.layerDrag;
    const to = this.layerTarget();
    this.layerDrag = null;
    this.layerTarget.set(null);
    if (!g?.moving || to === null || to === g.from) return;
    this.edit.emit({ phase: 'apply', change: (s) => moveLayer(s, s.layers![g.from].id, to) });
  }

  /** Alt and the arrows move the focused layer one place. */
  protected onLayerLabelKey(event: KeyboardEvent, index: number): void {
    if (!event.altKey || this.locked() || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    const to = index + (event.key === 'ArrowUp' ? -1 : 1);
    if (to < 0 || to >= (this.script().layers?.length ?? 0)) return;
    event.preventDefault();
    this.edit.emit({ phase: 'apply', change: (s) => moveLayer(s, s.layers![index].id, to) });
  }

  protected itemSelected(layer: string, item: number): boolean {
    const sel = this.itemSelection();
    // an item stays marked while one of its keyframes is the chosen one
    return sel?.layer === layer && sel.item === item;
  }

  protected itemKeyframeSelected(row: ItemKeyframeRow, n: number): boolean {
    return sameItemSelection(this.itemSelection(), { layer: row.layer, item: row.item, param: row.param, keyframe: n });
  }

  protected itemLabel(layer: string, item: number, part: string): string {
    return this.t.timeline.item(layer, item + 1, part);
  }

  protected itemRowLabel(row: ItemKeyframeRow): string {
    return this.t.timeline.itemKeyframes(row.layer, row.item + 1, row.param);
  }

  protected itemKeyframeLabel(row: ItemKeyframeRow, n: number): string {
    return this.t.timeline.keyframe(row.param, `${(row.start + row.frames[n].t).toFixed(2)} s`);
  }

  protected pickItem(event: Event, layer: string, item: number): void {
    event.stopPropagation();
    if (this.justDragged) return;
    this.selectItem.emit({ layer, item });
  }

  protected dropItemBlock(event: Event, layer: string, item: number): void {
    event.stopPropagation();
    this.removeItem.emit({ layer, item });
  }

  protected pickItemKeyframe(event: Event, row: ItemKeyframeRow, n: number): void {
    event.stopPropagation();
    if (this.justDragged) return;
    this.selectItem.emit({ layer: row.layer, item: row.item, param: row.param, keyframe: n });
  }

  /** Pressing an item's body or one of its ends: dragging moves it or resizes it, never over its neighbours. */
  protected onItemDown(event: PointerEvent, layer: string, item: number, kind: 'item' | 'item-start' | 'item-end'): void {
    const found = layerOf(this.script(), layer)?.items[item];
    if (event.button !== 0 || this.locked() || !found) return;
    if ((event.target as Element).closest('.close')) return;
    event.stopPropagation();
    try {
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    } catch {
      // a pointer that cannot be captured still drags while it stays over the lanes
    }
    this.gesture = { kind, id: layer, layer, item, index: 0, origin: this.script(), pointerTime: this.timeAt(event.clientX), originTime: kind === 'item-end' ? found.end : found.start, x0: event.clientX, y0: event.clientY, moving: false };
  }

  protected onItemKeyframeDown(event: PointerEvent, row: ItemKeyframeRow, n: number): void {
    if (event.button !== 0 || this.locked()) return;
    event.stopPropagation();
    try {
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    } catch {
      // a pointer that cannot be captured still drags while it stays over the lanes
    }
    this.gesture = { kind: 'item-keyframe', id: row.layer, layer: row.layer, item: row.item, index: 0, origin: this.script(), pointerTime: this.timeAt(event.clientX), originTime: row.start + row.frames[n].t, x0: event.clientX, y0: event.clientY, moving: false, param: row.param, keyframe: n };
  }

  /** A double click on an item's row adds a keyframe there, with the value the parameter has at that time. */
  protected addItemKeyframeAt(event: MouseEvent, row: ItemKeyframeRow): void {
    if (this.locked()) return;
    event.stopPropagation();
    const time = this.timeAt(event.clientX);
    if (time < row.start || time > row.end) return;
    const t = Math.round((time - row.start) * 1000) / 1000;
    const whole = this.catalog()?.parts.find((p) => p.name === row.part)?.params.find((q) => q.name === row.param)?.type === 'int';
    const value = evaluateKeyframes(row.frames, t, whole);
    if (value === undefined) return;
    this.edit.emit({ phase: 'apply', change: (s) => addItemKeyframe(s, row.layer, row.item, row.param, { t, value, ease: 'linear' }) });
    this.selectItem.emit({ layer: row.layer, item: row.item, param: row.param, keyframe: row.frames.filter((f) => f.t < t - 0.005).length });
  }

  protected isLineSelected(piece: string, line: number): boolean {
    return sameSelection(this.selection(), { piece, line });
  }

  protected pickLine(event: Event, piece: string, line: number): void {
    event.stopPropagation();
    this.select.emit({ piece, line });
  }

  protected dropLine(event: Event, piece: string, line: number): void {
    event.stopPropagation();
    this.removeLine.emit({ piece, line });
  }

  protected onScroll(): void {
    this.scrollLeft.set(this.scroller().nativeElement.scrollLeft);
  }

  /** Where an item being dragged over the lanes would land: the line that shows it and the lane. */
  protected readonly dropAt = signal<{ readonly t: number; readonly lane: DropLane } | null>(null);

  private scrubbing = false;
  private gesture: Gesture | null = null;
  private justDragged = false;

  /** What is being dragged, for the guide line and the time: the song time of the cut (or of the block's start). */
  protected readonly drag = signal<{ readonly kind: Gesture['kind']; readonly time: number } | null>(null);
  /** The block a swap would land on, drawn as a ghost. */
  protected readonly swapTarget = signal<string | null>(null);
  /** The extra lane an extra block would be dropped on, to reorder. */
  protected readonly laneTarget = signal<number | null>(null);
  /** The marks of the blocks: by piece, what to say, and whether it is more than information. */
  protected readonly warnMarks = computed(() => {
    const out = new Map<string, { text: string; hard: boolean; refused?: boolean }>();
    for (const [piece, reason] of Object.entries(this.refused())) if (reason) out.set(piece, { text: reason, hard: true, refused: true });
    for (const w of this.warnings()) {
      if (!w.piece) continue;
      const prev = out.get(w.piece);
      const line = warningText(this.t, w);
      out.set(w.piece, { text: prev ? `${prev.text}\n${line}` : line, hard: (prev?.hard ?? false) || w.severity === 'warning', ...(prev?.refused ? { refused: true } : {}) });
    }
    return out;
  });
  /** What the live checks found about each item of a layer, by `layer:item`, in the server's words. */
  protected readonly itemMarks = computed(() => {
    const out = new Map<string, string>();
    for (const w of this.warnings()) {
      if (w.layer === undefined || w.item === undefined) continue;
      const key = `${w.layer}:${w.item}`;
      const line = warningText(this.t, w);
      out.set(key, out.has(key) ? `${out.get(key)}\n${line}` : line);
    }
    return out;
  });
  protected readonly firstId = computed(() => this.script().pieces[0]?.id ?? '');

  /**
   * The lane under a point of the page, read from the lanes as they are drawn (their borders and the page's layout make the real heights differ from the
   * constants by a pixel or more): the lane's element says what it is. Nothing when the page cannot say, and `laneAt` then goes by the constants.
   */
  private laneUnder(clientX: number, clientY: number): DropLane | null {
    if (typeof document.elementsFromPoint !== 'function') return null;
    const root = this.scroller().nativeElement;
    const lane = document.elementsFromPoint(clientX, clientY).find((e) => e.classList.contains('lane') && root.contains(e));
    if (!lane) return null;
    if (lane.classList.contains('main')) return 'main';
    if (lane.classList.contains('extra')) return Number(lane.getAttribute('data-extra'));
    if (lane.classList.contains('layer-lane')) return { layer: Number(lane.getAttribute('data-layer-index')) };
    if (lane.classList.contains('new-layer')) return this.canAddLayer() ? 'new-layer' : 'other';
    return 'other';
  }

  /** The lane under a pointer: as it is drawn, or by the lanes' heights when the page cannot say. */
  private laneAtPoint(clientX: number, clientY: number, y: number): DropLane {
    return this.laneUnder(clientX, clientY) ?? this.laneAt(y);
  }

  /** The lane under a vertical position inside the lanes by the lanes' heights: the rulers above the main track are `other`. */
  private laneAt(y: number): DropLane {
    const top = LANE_HEIGHT.ruler + LANE_HEIGHT.sections + LANE_HEIGHT.loudness + LANE_HEIGHT.words;
    const extrasEnd = top + LANE_HEIGHT.main + MAX_EXTRAS * LANE_HEIGHT.extra;
    if (y < top) return 'other';
    if (y < top + LANE_HEIGHT.main) return 'main';
    if (y < extrasEnd) return Math.min(MAX_EXTRAS - 1, Math.floor((y - top - LANE_HEIGHT.main) / LANE_HEIGHT.extra));
    const layers = this.script().layers?.length ?? 0;
    const layersEnd = extrasEnd + layers * LANE_HEIGHT.layer;
    if (y < layersEnd) return { layer: Math.floor((y - extrasEnd) / LANE_HEIGHT.layer) };
    if (this.canAddLayer() && y < layersEnd + LANE_HEIGHT.newLayer) return 'new-layer';
    return 'other';
  }

  private dropPoint(event: DragEvent): { t: number; lane: DropLane } {
    const el = this.scroller().nativeElement;
    const box = el.getBoundingClientRect();
    const t = Math.min(this.songMap().duration, Math.max(0, this.scale().tOf(event.clientX - box.left + el.scrollLeft)));
    return { t, lane: this.laneAtPoint(event.clientX, event.clientY, event.clientY - box.top) };
  }

  protected onDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types?.includes(PALETTE_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    this.dropAt.set(this.dropPoint(event));
  }

  protected onDragLeave(): void {
    this.dropAt.set(null);
  }

  protected onDrop(event: DragEvent): void {
    const data = event.dataTransfer?.getData(PALETTE_MIME);
    this.dropAt.set(null);
    const item = data ? itemFromJson(data) : null;
    if (!item) return;
    event.preventDefault();
    const { t, lane } = this.dropPoint(event);
    this.dropItem.emit({ item, time: t, lane });
  }


  /** Pressing on the ruler or on a lane (not on a block) moves the playhead there, and dragging goes on moving it until the button is let go. */
  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || (event.target as Element).closest('.block, .kf')) return;
    this.scrubbing = true;
    try {
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    } catch {
      // a pointer that cannot be captured still scrubs while it stays over the lanes
    }
    this.seekAt(event.clientX);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.gesture) this.dragTo(event);
    else if (this.scrubbing) this.seekAt(event.clientX);
  }

  protected onPointerUp(): void {
    this.scrubbing = false;
    this.finish();
  }

  /** The song time under a pointer position. */
  private timeAt(clientX: number): number {
    const el = this.scroller().nativeElement;
    return Math.min(this.songMap().duration, Math.max(0, this.scale().tOf(clientX - el.getBoundingClientRect().left + el.scrollLeft)));
  }

  /** Where a drag would put `t`: on the beat (or section boundary) when the magnet is on and Alt is not held, else where it is. */
  private place(t: number, alt: boolean): number {
    return this.magnet() && !alt ? snapToSections(t, this.songMap()) : t;
  }

  private press(event: PointerEvent, kind: Gesture['kind'], id: string, extra?: number): void {
    const index = this.script().pieces.findIndex((p) => p.id === id);
    const piece = this.script().pieces[index];
    if (event.button !== 0 || this.locked() || !piece) return;
    if (kind === 'cut' && index <= 0) return;
    event.stopPropagation();
    try {
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    } catch {
      // a pointer that cannot be captured still drags while it stays over the lanes
    }
    this.gesture = { kind, id, index, origin: this.script(), pointerTime: this.timeAt(event.clientX), originTime: piece.start, x0: event.clientX, y0: event.clientY, moving: false, ...(extra !== undefined ? { extra } : {}) };
  }

  /** Pressing the edge between two blocks: dragging it moves that cut. */
  protected onCutDown(event: PointerEvent, id: string): void {
    this.press(event, 'cut', id);
  }

  /** Pressing a block's body: dragging it moves both its cuts; with Shift it is picked up to be swapped with another block. */
  protected onBlockDown(event: PointerEvent, id: string): void {
    if ((event.target as Element).closest('.dot-hit, .close')) return;
    this.press(event, event.shiftKey ? 'swap' : 'body', id);
  }

  /** Left and Right on a cut move it by a step (0.1 s; Shift 1 s, Alt 0.01 s): one step of the history each. */
  protected onCutKey(event: KeyboardEvent, id: string): void {
    this.nudge(event, id, 'cut');
  }

  /**
   * Left and Right on a block of the main track move it (and both its cuts) by a step; [ and ] swap what it draws with the piece before or after
   * it (the times stay), and the focus goes to the piece that now has it.
   */
  protected onBlockKey(event: KeyboardEvent, id: string): void {
    if ((event.key === '[' || event.key === ']') && !event.ctrlKey && !event.metaKey && !event.altKey && !this.locked() && !this.gesture) {
      const pieces = this.script().pieces;
      const index = pieces.findIndex((p) => p.id === id);
      const other = pieces[index + (event.key === '[' ? -1 : 1)];
      if (index < 0 || !other) return;
      event.preventDefault();
      event.stopPropagation();
      this.edit.emit({ phase: 'apply', change: (s) => swapContents(s, s.pieces.findIndex((p) => p.id === id), s.pieces.findIndex((p) => p.id === other.id)) });
      this.select.emit({ piece: other.id });
      this.focusAfter = `.lane.main .block-body[data-piece="${other.id}"]`;
      return;
    }
    this.nudge(event, id, 'body');
  }

  private nudge(event: KeyboardEvent, id: string, kind: 'cut' | 'body'): void {
    if ((event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') || event.ctrlKey || event.metaKey || this.locked() || this.gesture) return;
    const index = this.script().pieces.findIndex((p) => p.id === id);
    if (index < 0 || (kind === 'cut' && index === 0)) return;
    event.preventDefault();
    event.stopPropagation();
    const step = keyStep(event);
    // The new place is worked out from the script the change is given, not from the one this component last saw: presses that come
    // before the host has handed the last edit back must add up.
    const duration = this.songMap().duration;
    const apply = (s: Script): Script => {
      const at = Math.min(duration, Math.max(0, Math.round((s.pieces[index].start + step) * 1000) / 1000));
      return kind === 'cut' ? moveCut(s, index - 1, at) : moveBlock(s, index, at);
    };
    const moved = apply(this.script());
    if (moved === this.script()) return;
    this.edit.emit({ phase: 'apply', change: apply });
    this.seek.emit(moved.pieces[index].start);
  }

  /** Left and Right on a diamond of a piece move that keyframe by a step, between its neighbours and inside the piece. */
  protected onKeyframeKey(event: KeyboardEvent, row: KeyframeRow, span: KeyframeSpan, n: number): void {
    if ((event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') || event.ctrlKey || event.metaKey || this.locked() || this.gesture) return;
    event.preventDefault();
    event.stopPropagation();
    const step = keyStep(event);
    const apply = (s: Script): Script => {
      const i = s.pieces.findIndex((p) => p.id === span.piece);
      const at = keyframesOf(s.pieces[i], row.param, row.extra)?.[n]?.t;
      return at === undefined ? s : moveKeyframe(s, i, row.param, n, Math.round((at + step) * 1000) / 1000, row.extra);
    };
    this.nudgeKeyframe(apply, span.start + span.frames[n].t, apply(this.script()) !== this.script());
  }

  /** The same for a diamond of a layer item. */
  protected onItemKeyframeKey(event: KeyboardEvent, row: ItemKeyframeRow, n: number): void {
    if ((event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') || event.ctrlKey || event.metaKey || this.locked() || this.gesture) return;
    event.preventDefault();
    event.stopPropagation();
    const step = keyStep(event);
    const apply = (s: Script): Script => {
      const at = layerOf(s, row.layer)?.items[row.item]?.animate?.[row.param]?.[n]?.t;
      return at === undefined ? s : moveItemKeyframe(s, row.layer, row.item, row.param, n, Math.round((at + step) * 1000) / 1000);
    };
    this.nudgeKeyframe(apply, row.start + row.frames[n].t, apply(this.script()) !== this.script());
  }

  private nudgeKeyframe(apply: (s: Script) => Script, time: number, changes: boolean): void {
    if (!changes) return;
    this.edit.emit({ phase: 'apply', change: apply });
    this.seek.emit(time);
  }

  /** Up and Down on an extra block take it to the lane above or below (the extras of its piece swap places), and the focus goes with it. */
  protected onExtraKey(event: KeyboardEvent, id: string, extra: number): void {
    if ((event.key !== 'ArrowUp' && event.key !== 'ArrowDown') || event.ctrlKey || event.metaKey || event.altKey || this.locked() || this.gesture) return;
    const index = this.script().pieces.findIndex((p) => p.id === id);
    const to = extra + (event.key === 'ArrowUp' ? -1 : 1);
    if (index < 0 || to < 0 || to >= (this.script().pieces[index].with?.length ?? 0)) return;
    event.preventDefault();
    event.stopPropagation();
    this.edit.emit({ phase: 'apply', change: (s) => moveExtra(s, s.pieces.findIndex((p) => p.id === id), extra, to) });
    this.select.emit({ piece: id, extra: to });
    this.focusAfter = `.lane.extra[data-extra="${to}"] .block-body[data-piece="${id}"]`;
  }

  /** Pressing an extra block: dragging it to another extra lane reorders the extras of its piece. */
  protected onExtraDown(event: PointerEvent, id: string, extra: number): void {
    if ((event.target as Element).closest('.close')) return;
    this.press(event, 'extra', id, extra);
  }

  private dragTo(event: PointerEvent): void {
    const g = this.gesture!;
    if (!g.moving) {
      if (Math.abs(event.clientX - g.x0) + Math.abs(event.clientY - g.y0) < DRAG_PX) return;
      g.moving = true;
      if (g.kind === 'cut' || g.kind === 'body' || g.kind === 'keyframe' || g.layer !== undefined) this.edit.emit({ phase: 'begin' });
      if (g.layer !== undefined) this.selectItem.emit({ layer: g.layer, item: g.item!, ...(g.kind === 'item-keyframe' ? { param: g.param!, keyframe: g.keyframe! } : {}) });
      else this.select.emit(g.kind === 'extra' ? { piece: g.id, extra: g.extra } : g.kind === 'keyframe' ? { piece: g.id, ...(g.extra !== undefined ? { extra: g.extra } : {}), param: g.param!, keyframe: g.keyframe! } : { piece: g.id });
    }
    if (g.kind === 'extra') {
      const box = this.scroller().nativeElement.getBoundingClientRect();
      const lane = this.laneAtPoint(event.clientX, event.clientY, event.clientY - box.top);
      this.laneTarget.set(typeof lane === 'number' ? lane : null);
      return;
    }
    const t = this.timeAt(event.clientX);
    const raw = g.originTime + (t - g.pointerTime);
    if (g.layer !== undefined) {
      this.dragItem(g, raw, event.altKey);
      return;
    }
    if (g.kind === 'keyframe') {
      const piece = g.origin.pieces[g.index];
      const moved = moveKeyframe(g.origin, g.index, g.param!, g.keyframe!, this.place(raw, event.altKey) - piece.start, g.extra);
      this.edit.emit({ phase: 'update', change: () => moved });
      this.drag.set({ kind: 'keyframe', time: piece.start + (keyframesOf(moved.pieces[g.index], g.param!, g.extra)?.[g.keyframe!]?.t ?? 0) });
      return;
    }
    if (g.kind === 'swap') {
      const target = this.script().pieces.find((p) => p.id !== g.id && t >= p.start && t < p.end);
      this.swapTarget.set(target?.id ?? null);
      this.drag.set({ kind: 'swap', time: t });
      return;
    }
    const at = Math.min(this.songMap().duration, Math.max(0, this.place(raw, event.altKey)));
    const result = g.kind === 'cut' ? moveCut(g.origin, g.index - 1, at) : moveBlock(g.origin, g.index, at);
    const shown = result.pieces[g.index].start;
    this.edit.emit({ phase: 'update', change: () => result });
    this.drag.set({ kind: g.kind, time: shown });
    this.seek.emit(shown);
  }

  private finish(): void {
    const g = this.gesture;
    if (!g) return;
    this.gesture = null;
    this.refusal = '';
    const target = this.swapTarget();
    const lane = this.laneTarget();
    this.swapTarget.set(null);
    this.laneTarget.set(null);
    this.drag.set(null);
    if (!g.moving) return;
    this.justDragged = true;
    setTimeout(() => (this.justDragged = false));
    if (g.kind === 'extra') {
      const i = g.origin.pieces.findIndex((p) => p.id === g.id);
      if (lane !== null && g.extra !== undefined) this.edit.emit({ phase: 'apply', change: (s) => moveExtra(s, s.pieces.findIndex((p) => p.id === g.id), g.extra!, Math.min(lane, (g.origin.pieces[i]?.with?.length ?? 1) - 1)) });
    } else if (g.kind === 'swap') {
      const j = target ? g.origin.pieces.findIndex((p) => p.id === target) : -1;
      if (j >= 0) this.edit.emit({ phase: 'apply', change: (s) => swapContents(s, g.origin.pieces.findIndex((p) => p.id === g.id), s.pieces.findIndex((p) => p.id === target)) });
    } else {
      this.edit.emit({ phase: 'end' });
    }
  }

  /** The last reason an item stopped in a drag, so it is said once and taken back when the drag is free again. */
  private refusal = '';

  /** Where a drag would put an edge: on a cut of the pieces when one is within a few pixels, else on the beat or section boundary the magnet gives. */
  private placeItem(t: number, alt: boolean): number {
    return this.snapEdge(t, alt).t;
  }

  private snapEdge(t: number, alt: boolean): { readonly t: number; readonly cut: boolean } {
    if (!this.magnet() || alt) return { t, cut: false };
    const reach = CUT_SNAP_PX / this.zoom();
    const cut = this.script()
      .pieces.map((p) => p.start)
      .filter((c) => Math.abs(c - t) <= reach)
      .sort((a, b) => Math.abs(a - t) - Math.abs(b - t))[0];
    return cut !== undefined ? { t: cut, cut: true } : { t: snapToSections(t, this.songMap()), cut: false };
  }

  /** An item moving, resizing or having a keyframe moved: always placed from the script where the press began, held by its neighbours, refused with the server's words. */
  private dragItem(g: Gesture, raw: number, alt: boolean): void {
    const found = layerOf(g.origin, g.layer!)?.items[g.item!];
    if (!found) return;
    const catalog = this.catalog() ?? undefined;
    if (g.kind === 'item-keyframe') {
      const moved = moveItemKeyframe(g.origin, g.layer!, g.item!, g.param!, g.keyframe!, this.placeItem(raw, alt) - found.start);
      this.edit.emit({ phase: 'update', change: () => moved });
      this.drag.set({ kind: g.kind, time: found.start + (layerOf(moved, g.layer!)?.items[g.item!]?.animate?.[g.param!]?.[g.keyframe!]?.t ?? 0) });
      return;
    }
    const length = found.end - found.start;
    const apply = (c: typeof catalog): Script => {
      if (g.kind === 'item-start') return resizeItem(g.origin, g.layer!, g.item!, 'start', this.placeItem(raw, alt), c);
      if (g.kind === 'item-end') return resizeItem(g.origin, g.layer!, g.item!, 'end', this.placeItem(raw, alt), c);
      // Either end may stick: a cut wins over a beat, and the nearer one wins when both are cuts or both are beats.
      const a = this.snapEdge(raw, alt);
      const e = this.snapEdge(raw + length, alt);
      const b = { t: e.t - length, cut: e.cut };
      const pick = a.cut !== b.cut ? (a.cut ? a : b) : Math.abs(a.t - raw) <= Math.abs(b.t - raw) ? a : b;
      return moveItem(g.origin, g.layer!, g.item!, pick.t, c);
    };
    const free = apply(undefined);
    const held = apply(catalog);
    const why = held === g.origin && free !== g.origin && catalog ? (layerEditProblem(g.origin, free, catalog) ?? '') : '';
    if (why !== this.refusal) {
      this.refusal = why;
      this.itemRefused.emit(why);
    }
    this.edit.emit({ phase: 'update', change: () => held });
    const shown = layerOf(held, g.layer!)?.items[g.item!];
    const time = g.kind === 'item-end' ? (shown?.end ?? found.end) : (shown?.start ?? found.start);
    this.drag.set({ kind: g.kind, time });
    this.seek.emit(time);
  }

  /** The label of the time a drag is at. */
  protected dragLabel(time: number): string {
    return `${time.toFixed(2)} s`;
  }

  protected cutLabel(id: string): string {
    return this.t.timeline.cut(this.script().pieces.findIndex((p) => p.id === id));
  }

  protected toggleMagnet(): void {
    this.magnet.update((m) => !m);
  }

  private seekAt(clientX: number): void {
    const el = this.scroller().nativeElement;
    const x = clientX - el.getBoundingClientRect().left + el.scrollLeft;
    this.seek.emit(Math.min(this.songMap().duration, Math.max(0, this.scale().tOf(x))));
  }

  protected pick(event: Event, piece: string, extra?: number): void {
    event.stopPropagation();
    if (this.justDragged) return;
    this.select.emit(extra === undefined ? { piece } : { piece, extra });
  }

  protected dropExtra(event: Event, piece: string, extra: number): void {
    event.stopPropagation();
    this.removeExtra.emit({ piece, extra });
  }

  protected onWheel(event: WheelEvent): void {
    const el = this.scroller().nativeElement;
    if (event.ctrlKey) {
      event.preventDefault();
      this.zoomBy(event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP, event.clientX - el.getBoundingClientRect().left);
    } else if (Math.abs(event.deltaY) >= Math.abs(event.deltaX)) {
      event.preventDefault();
      el.scrollLeft += event.deltaY;
    }
  }

  protected onKey(event: KeyboardEvent): void {
    const el = this.scroller().nativeElement;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      this.zoomBy(WHEEL_STEP, el.clientWidth / 2);
    } else if (event.key === '-') {
      event.preventDefault();
      this.zoomBy(1 / WHEEL_STEP, el.clientWidth / 2);
    }
  }

  protected zoomIn(): void {
    this.zoomBy(WHEEL_STEP, this.scroller().nativeElement.clientWidth / 2);
  }

  /** Zooms so that the whole song is in the window. */
  protected zoomFit(): void {
    const el = this.scroller().nativeElement;
    const width = Math.max(1, (el.clientWidth || this.viewWidth()) - 8);
    this.zoom.set(TimeScale.fit(this.songMap().duration, width).pxPerSecond);
    this.scrollLeft.set(0);
    afterNextRender(() => {
      el.scrollLeft = 0;
    }, { injector: this.injector });
  }

  protected zoomOut(): void {
    this.zoomBy(1 / WHEEL_STEP, this.scroller().nativeElement.clientWidth / 2);
  }

  /** Zooms keeping the time under `anchorX` (pixels into the window) where it is. */
  private zoomBy(factor: number, anchorX: number): void {
    const el = this.scroller().nativeElement;
    const z = this.scale().zoomAround(factor, anchorX, el.scrollLeft);
    this.zoom.set(z.scale.pxPerSecond);
    this.scrollLeft.set(z.scrollLeft);
    afterNextRender(() => {
      el.scrollLeft = z.scrollLeft;
    }, { injector: this.injector });
  }
}
