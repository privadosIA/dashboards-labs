import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';

import { EASES, type Ease, type Keyframe, type Property } from '../model/document';
import { keyframeIndexAt } from '../model/auto-key';
import { moveKeyframe, removeKeyframe, setEase, setKeyframe } from '../model/edits';
import { propertyAt } from '../model/evaluate';
import { findNode } from '../model/tree';
import { VECTOR_EDITOR_LANG } from '../provide-vector-editor';
import type { VectorStore } from '../store/vector-store';
import { vectorTexts } from '../texts';
import { animatedNodes, rowsFor, ticks, timeAt, type TimelineRow } from './rows';

interface Selected {
  id: string;
  property: Property;
  index: number;
}

/**
 * The timeline: a ruler of the document's duration in seconds (and frames when there is room), the playhead, one row per animated property of
 * the selected nodes (or of all with the toggle, or when nothing is selected) and the keyframes as diamonds. A diamond is dragged in time (clamped; Shift snaps to frames),
 * chosen to change its ease, deleted with Delete, and a double click on a row adds one with the value shown there.
 */
@Component({
  selector: 'lab-vector-timeline',
  templateUrl: './timeline.html',
  styleUrl: './timeline.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VectorTimeline {
  readonly store = input.required<VectorStore>();

  protected readonly t = vectorTexts(inject(VECTOR_EDITOR_LANG));
  protected readonly eases = EASES;
  protected readonly all = signal(false);
  protected readonly selected = signal<Selected | undefined>(undefined);
  private readonly tracksEl = viewChild<ElementRef<HTMLElement>>('tracks');

  protected readonly duration = computed(() => this.store().doc().duration);
  protected readonly playhead = computed(() => this.store().playhead());
  protected readonly rows = computed<TimelineRow[]>(() => {
    const doc = this.store().doc();
    const selected = this.store().selectedNodes();
    // With nothing selected the whole animation is shown: a document opened for the first time has its keyframes in view.
    return rowsFor(this.all() || selected.length === 0 ? animatedNodes(doc.nodes) : selected);
  });
  protected readonly ticks = computed(() => ticks(this.duration(), this.store().doc().fps, this.tracksEl()?.nativeElement.clientWidth || 600));
  protected readonly selectedFrame = computed<Keyframe | undefined>(() => {
    const s = this.selected();
    return s ? findNode(this.store().doc().nodes, s.id)?.tracks[s.property]?.[s.index] : undefined;
  });
  protected readonly clock = computed(() => {
    const doc = this.store().doc();
    const t = this.playhead();
    return `${t.toFixed(2)} ${this.t.timeline.seconds} · ${this.t.transport.frame} ${Math.round(t * doc.fps)}`;
  });

  private drag: { row: TimelineRow; index: number; doc: ReturnType<VectorStore['doc']>; moved: boolean } | undefined;
  private scrubbing = false;

  protected isSelected(row: TimelineRow, index: number): boolean {
    const s = this.selected();
    return !!s && s.id === row.id && s.property === row.property && s.index === index;
  }

  private rect(): DOMRect | undefined {
    return this.tracksEl()?.nativeElement.getBoundingClientRect();
  }

  private at(e: MouseEvent, snap = e.shiftKey): number {
    const r = this.rect();
    return timeAt(e.clientX, r?.left ?? 0, r?.width ?? 0, this.duration(), this.store().doc().fps, snap);
  }

  // — the playhead —

  protected scrubStart(e: PointerEvent): void {
    this.scrubbing = true;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // A pointer that cannot be captured still scrubs while it is over the ruler.
    }
    this.store().seek(this.at(e, true));
  }

  protected scrub(e: PointerEvent): void {
    if (this.scrubbing) this.store().seek(this.at(e, true));
  }

  protected scrubEnd(): void {
    this.scrubbing = false;
  }

  // — keyframes —

  protected dragStart(e: PointerEvent, row: TimelineRow, index: number): void {
    if (e.button !== 0) return;
    this.selected.set({ id: row.id, property: row.property, index });
    this.drag = { row, index, doc: this.store().doc(), moved: false };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Without capture the drag goes on while the pointer stays over the diamond.
    }
  }

  protected dragMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const to = this.at(e);
    if (!d.moved) {
      if (Math.abs(to - d.row.frames[d.index].t) < 1e-3) return;
      d.moved = true;
      this.store().begin();
    }
    this.store().update(() => moveKeyframe(d.doc, d.row.id, d.row.property, d.index, to));
    this.follow(d.row, to);
  }

  protected dragEnd(): void {
    if (this.drag?.moved) this.store().end();
    this.drag = undefined;
  }

  /** After a keyframe has moved (and maybe crossed another) the diamond that was picked is the one that is now at that time. */
  private follow(row: TimelineRow, t: number): void {
    const node = findNode(this.store().doc().nodes, row.id);
    const index = node ? keyframeIndexAt(node, row.property, t) : -1;
    if (index >= 0) this.selected.set({ id: row.id, property: row.property, index });
  }

  protected chooseEase(e: Event): void {
    const s = this.selected();
    if (!s) return;
    const ease = (e.target as HTMLSelectElement).value as Ease;
    this.store().apply((doc) => setEase(doc, s.id, s.property, s.index, ease));
  }

  protected removeSelected(): void {
    const s = this.selected();
    if (!s) return;
    this.store().apply((doc) => removeKeyframe(doc, s.id, s.property, s.index));
    this.selected.set(undefined);
  }

  protected addAt(e: MouseEvent, row: TimelineRow): void {
    const t = this.at(e, true);
    const node = findNode(this.store().doc().nodes, row.id);
    const value = node ? propertyAt(node, row.property, t) : undefined;
    if (value === undefined) return;
    this.store().apply((doc) => setKeyframe(doc, row.id, row.property, t, value));
    const index = findNode(this.store().doc().nodes, row.id) && keyframeIndexAt(findNode(this.store().doc().nodes, row.id)!, row.property, t);
    if (index !== undefined && index >= 0) this.selected.set({ id: row.id, property: row.property, index });
  }

  protected keydown(e: KeyboardEvent): void {
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selected() && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) {
      e.preventDefault();
      this.removeSelected();
    }
  }

  /** A diamond that has the focus moves a frame with the arrows (ten with Shift), as a person without a mouse would drag it. */
  protected diamondKey(e: KeyboardEvent, row: TimelineRow, index: number): void {
    const direction = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (!direction) return;
    e.preventDefault();
    const fps = this.store().doc().fps;
    const to = Math.round((row.frames[index].t + (direction * (e.shiftKey ? 10 : 1)) / fps) * 1000) / 1000;
    this.selected.set({ id: row.id, property: row.property, index });
    this.store().apply((doc) => moveKeyframe(doc, row.id, row.property, index, to));
    this.follow(row, Math.min(this.duration(), Math.max(0, to)));
  }
}
