import { Directive, ElementRef, OnDestroy, OnInit, inject, input } from '@angular/core';

import { GestureHandlers, GestureOptions, GestureRecognizer } from './gestures';

/** The width of the strip at each edge of the screen that is left to the browser's own back gesture. */
const EDGE = 20;

/**
 * Feeds the pointer events of an element to a GestureRecognizer. `touch-action` says which gestures the browser
 * keeps for itself: `none` where this handles everything (a zoomable picture), `pan-y` where the page still
 * scrolls vertically (a grid with long press).
 */
@Directive({ selector: '[moGestures]' })
export class GesturesDirective implements OnInit, OnDestroy {
  readonly handlers = input.required<GestureHandlers>({ alias: 'moGestures' });
  readonly panEnabled = input<() => boolean>();
  readonly touchAction = input<'none' | 'pan-y' | 'manipulation'>('pan-y');

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private recognizer!: GestureRecognizer;
  private readonly listeners: [string, (e: Event) => void][] = [];

  ngOnInit(): void {
    const el = this.el;
    el.style.touchAction = this.touchAction();
    const handlers = this.handlers();
    const opts: GestureOptions = {
      edge: EDGE,
      viewportWidth: () => window.innerWidth,
      panEnabled: this.panEnabled(),
    };
    this.recognizer = new GestureRecognizer(handlers, opts);
    const on = (type: string, fn: (e: PointerEvent) => void) => {
      const l = fn as (e: Event) => void;
      el.addEventListener(type, l);
      this.listeners.push([type, l]);
    };
    // A mouse has its own controls (the buttons, the dialogs): the gestures are for fingers and pens.
    const touch = (e: PointerEvent) => e.pointerType !== 'mouse';
    on('pointerdown', (e) => {
      if (!touch(e)) return;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // the pointer is already gone: the events that follow say so
      }
      this.recognizer.down(e);
    });
    on('pointermove', (e) => touch(e) && this.recognizer.move(e));
    on('pointerup', (e) => touch(e) && this.recognizer.up(e));
    on('pointercancel', () => this.recognizer.cancel());
    if (handlers.longPress) {
      // The long press is ours: the browser's own menu and text selection must not appear on top of it.
      const stop = (e: Event) => e.preventDefault();
      el.addEventListener('contextmenu', stop);
      this.listeners.push(['contextmenu', stop]);
      el.style.setProperty('-webkit-touch-callout', 'none');
      el.style.userSelect = 'none';
    }
  }

  ngOnDestroy(): void {
    this.recognizer?.cancel();
    for (const [type, l] of this.listeners) this.el.removeEventListener(type, l);
  }
}
