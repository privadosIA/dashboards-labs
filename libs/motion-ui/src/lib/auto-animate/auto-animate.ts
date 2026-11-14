import { afterNextRender, DestroyRef, Directive, effect, ElementRef, inject, InjectionToken, input } from '@angular/core';
import autoAnimate, { type AnimationController, type AutoAnimateOptions } from '@formkit/auto-animate';

/** What starts the animations of a container; `@formkit/auto-animate` unless a test or a caller provides another. */
export const AUTO_ANIMATE = new InjectionToken<typeof autoAnimate>('AUTO_ANIMATE', { factory: () => autoAnimate });

/**
 * Animates the children of a container when they are added, removed or moved: a list, a grid, a block with `@if` or `@for`.
 *
 * ```html
 * <ul appAutoAnimate>
 *   @for (item of items(); track item.id) { <li>{{ item.name }}</li> }
 * </ul>
 * ```
 *
 * It starts once the container is on the screen (never on the server) and stops with it. `auto-animate` already keeps still
 * for a person who asked for reduced motion, and this directive does not override that.
 *
 * When the items live inside another component (the rows of a table drawn by a library), `appAutoAnimateTarget` names, with a selector, the
 * descendant whose children change: the directive attaches to the first match as soon as it exists, and again if it is replaced.
 *
 * ```html
 * <div appAutoAnimate appAutoAnimateTarget="tbody"><lib-table [rows]="rows()" /></div>
 * ```
 */
@Directive({ selector: '[appAutoAnimate]' })
export class AutoAnimateDirective {
  /** Options of `@formkit/auto-animate` (duration, easing); the attribute alone, `appAutoAnimate`, keeps its defaults. */
  readonly appAutoAnimate = input<Partial<AutoAnimateOptions> | ''>('');
  /** Turns the animations off while it is true. */
  readonly appAutoAnimateDisabled = input(false);

  /** A selector for a descendant of the container whose children change (empty: the container itself). */
  readonly appAutoAnimateTarget = input('');

  private controller: AnimationController | null = null;
  private attachedTo: HTMLElement | null = null;
  private watching: MutationObserver | null = null;

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const start = inject(AUTO_ANIMATE);

    /** Starts the animations on `el` (and stops them on what they were on before). */
    const attach = (el: HTMLElement | null) => {
      if (el === this.attachedTo) return;
      this.controller?.disable();
      this.controller = null;
      this.attachedTo = el;
      if (!el) return;
      const options = this.appAutoAnimate();
      this.controller = start(el, options === '' ? {} : options);
      if (this.appAutoAnimateDisabled()) this.controller.disable();
    };

    afterNextRender(() => {
      const selector = this.appAutoAnimateTarget();
      if (!selector) return attach(host);
      // The target may not be there yet (a table that waits for its rows) or may be replaced: look again when the host's content changes.
      const find = () => attach(host.querySelector<HTMLElement>(selector));
      find();
      this.watching = new MutationObserver(find);
      this.watching.observe(host, { childList: true, subtree: true });
    });
    effect(() => {
      const off = this.appAutoAnimateDisabled();
      if (off) this.controller?.disable();
      else this.controller?.enable();
    });
    inject(DestroyRef).onDestroy(() => {
      this.watching?.disconnect();
      this.watching = null;
      this.controller?.disable();
      this.controller = null;
      this.attachedTo = null;
    });
  }
}
