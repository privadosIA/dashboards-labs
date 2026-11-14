import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';

import { VectorCanvas } from '../canvas/canvas';
import type { Beat, LoudnessAt } from '../model/document';
import { VectorProperties } from '../properties/properties';
import { VECTOR_EDITOR_LANG } from '../provide-vector-editor';
import type { VectorStore } from '../store/vector-store';
import { vectorTexts } from '../texts';
import { VectorTimeline } from '../timeline/timeline';
import { VectorTransport } from '../transport/transport';
import { TOOLS, type Tool } from '../tools/tools';
import { VectorTree } from '../tree/tree';

type Edge = 'left' | 'right' | 'bottom';

/** How far each panel can be dragged, in pixels. */
export const PAGE_LIMITS = { sideMin: 160, sideMax: 640, bottomMin: 120, bottomMax: 480 } as const;

/** The drawing of each tool's button, in a 16 × 16 box. */
const TOOL_ICONS: Readonly<Record<Tool, string>> = {
  select: 'M3 2 L3 13 L6 10 L8.5 14 L10.5 13 L8 9 L12 9 Z',
  rect: 'M2.5 3.5 H13.5 V12.5 H2.5 Z',
  ellipse: 'M2.5 8 A5.5 4.5 0 1 0 13.5 8 A5.5 4.5 0 1 0 2.5 8 Z',
  line: 'M3 13 L13 3',
  text: 'M3 4 H13 M8 4 V13',
  image: 'M2.5 3.5 H13.5 V12.5 H2.5 Z M3 11 L6.5 7 L9 10 L10.5 8.5 L13 11',
};

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

/**
 * The editor's layout, written once for every host: the layers (left), the canvas with the transport (centre), the properties (right) and the
 * timeline (bottom) in a grid whose panels can be resized with the mouse or the keyboard. The host gives it the store and its own buttons
 * (`<div toolbar>…</div>`); the panels share the store's selection and playhead.
 */
@Component({
  selector: 'lab-vector-editor-page',
  imports: [VectorCanvas, VectorProperties, VectorTimeline, VectorTransport, VectorTree],
  templateUrl: './page.html',
  styleUrl: './page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VectorEditorPage {
  readonly store = input.required<VectorStore>();
  /** What a host that knows a song gives: the beat and the loudness at a time of the part. Without them the beat links are edited but not shown. */
  readonly beatAt = input<((t: number) => Beat | null) | undefined>(undefined);
  readonly loudnessAt = input<LoudnessAt | undefined>(undefined);

  protected readonly t = vectorTexts(inject(VECTOR_EDITOR_LANG));
  protected readonly limits = PAGE_LIMITS;
  protected readonly tools = TOOLS;
  /** The layers are narrow by default: they are a list of names; what the room is for is the properties. */
  protected readonly left = signal(192);
  /** The properties are wide by default, so that they fit without scrolling; the canvas has room to give. */
  protected readonly right = signal(480);
  protected readonly bottom = signal(224);

  protected icon(tool: Tool): string {
    return TOOL_ICONS[tool];
  }

  protected notice(): string | undefined {
    const n = this.store().notice();
    return n ? this.t.tools.notices[n] : undefined;
  }

  private drag: { edge: Edge; from: number; start: number } | undefined;

  private size(edge: Edge): ReturnType<typeof signal<number>> {
    return edge === 'left' ? this.left : edge === 'right' ? this.right : this.bottom;
  }

  private bounds(edge: Edge): [number, number] {
    return edge === 'bottom' ? [PAGE_LIMITS.bottomMin, PAGE_LIMITS.bottomMax] : [PAGE_LIMITS.sideMin, PAGE_LIMITS.sideMax];
  }

  protected dragStart(e: PointerEvent, edge: Edge): void {
    this.drag = { edge, from: edge === 'bottom' ? e.clientY : e.clientX, start: this.size(edge)() };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // The drag goes on while the pointer is over the handle.
    }
  }

  protected dragMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const at = d.edge === 'bottom' ? e.clientY : e.clientX;
    // The left panel grows to the right; the right and bottom ones grow towards the middle.
    const delta = d.edge === 'left' ? at - d.from : d.from - at;
    const [min, max] = this.bounds(d.edge);
    this.size(d.edge).set(clamp(d.start + delta, min, max));
  }

  protected dragEnd(): void {
    this.drag = undefined;
  }

  /** The arrows resize by 16 pixels (64 with Shift); Home and End go to the least and the most. */
  protected key(e: KeyboardEvent, edge: Edge): void {
    const [min, max] = this.bounds(edge);
    const step = e.shiftKey ? 64 : 16;
    const grows = edge === 'left' ? 'ArrowRight' : edge === 'right' ? 'ArrowLeft' : 'ArrowUp';
    const shrinks = edge === 'left' ? 'ArrowLeft' : edge === 'right' ? 'ArrowRight' : 'ArrowDown';
    const size = this.size(edge);
    if (e.key === grows) size.set(clamp(size() + step, min, max));
    else if (e.key === shrinks) size.set(clamp(size() - step, min, max));
    else if (e.key === 'Home') size.set(min);
    else if (e.key === 'End') size.set(max);
    else return;
    e.preventDefault();
  }
}
