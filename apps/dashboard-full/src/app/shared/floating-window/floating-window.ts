import { ElementRef, signal } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

import { EDGES, Edge, Rect, moveRect, resizeRect } from './window-rect';

/**
 * What makes a dialog a window: it moves by its title bar, resizes from any side or corner (it can reach both
 * screen edges) and maximizes. The first move or resize takes over the window's position (fixed, in pixels);
 * the `mo-maximized` class in the global styles overrides it. A dialog component creates one in its constructor
 * and binds its template to it (see `floating-window.scss` for the look of the grips).
 */
export class FloatingWindow {
  readonly edges = EDGES;
  /** The window fills the whole screen (and neither moves nor resizes until it is restored). */
  readonly maximized = signal(false);

  constructor(
    private readonly ref: MatDialogRef<unknown>,
    private readonly host: ElementRef<HTMLElement>,
  ) {}

  toggleMaximize(): void {
    const on = !this.maximized();
    this.maximized.set(on);
    if (on) this.ref.addPanelClass('mo-maximized');
    else this.ref.removePanelClass('mo-maximized');
  }

  /** The window's box as it is now, read from the screen. */
  private current(): Rect | null {
    const pane = this.host.nativeElement.closest<HTMLElement>('.cdk-overlay-pane');
    if (!pane) return null;
    const r = pane.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }

  private place(r: Rect): void {
    const st = this.host.nativeElement.closest<HTMLElement>('.cdk-overlay-pane')?.style;
    if (!st) return;
    st.position = 'fixed';
    st.margin = '0';
    st.transform = 'none';
    st.maxWidth = 'none';
    st.maxHeight = 'none';
    st.left = `${Math.round(r.left)}px`;
    st.top = `${Math.round(r.top)}px`;
    st.width = `${Math.round(r.width)}px`;
    st.height = `${Math.round(r.height)}px`;
  }

  /** Follows the pointer until it is released, handing the distance travelled to `apply`. */
  private drag(ev: PointerEvent, apply: (dx: number, dy: number, start: Rect, screen: { width: number; height: number }) => void): void {
    const start = this.current();
    if (!start) return;
    ev.preventDefault();
    ev.stopPropagation();
    const el = ev.currentTarget as HTMLElement;
    el.setPointerCapture?.(ev.pointerId);
    const move = (e: PointerEvent) =>
      apply(e.clientX - ev.clientX, e.clientY - ev.clientY, start, { width: window.innerWidth, height: window.innerHeight });
    const end = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  startResize(ev: PointerEvent, edge: Edge): void {
    this.drag(ev, (dx, dy, start, screen) => this.place(resizeRect(start, edge, dx, dy, screen)));
  }

  /** Dragging the bar moves the window (the buttons on it keep working). */
  startMove(ev: PointerEvent): void {
    if (this.maximized() || (ev.target as HTMLElement).closest('button')) return;
    this.drag(ev, (dx, dy, start, screen) => this.place(moveRect(start, dx, dy, screen)));
  }
}

/** The options that open a dialog as a window anchored by its top-left corner, so resizing from the opposite corner grows it under the pointer. */
export function windowOptions(maxWidth: number, heightCss: string): { width: string; height: string; maxWidth: string; maxHeight: string; position: { top: string; left: string }; panelClass: string; backdropClass: string; autoFocus: false } {
  const width = Math.min(maxWidth, Math.round(window.innerWidth * 0.96));
  const left = Math.round((window.innerWidth - width) / 2);
  const top = Math.round(window.innerHeight * 0.06);
  return {
    width: `${width}px`,
    height: heightCss,
    maxWidth: '100vw', // resizing is limited by the screen, not by this
    maxHeight: '100vh',
    position: { top: `${top}px`, left: `${left}px` },
    panelClass: 'mo-resizable-dialog',
    backdropClass: 'mo-dialog-backdrop',
    autoFocus: false,
  };
}
