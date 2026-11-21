import { afterNextRender, Directive, ElementRef, inject, InjectionToken, input } from '@angular/core';

import { fadeUp, type FadeUpOptions } from '../fade-up';

/** What plays the entrance; `fadeUp` unless a test or a caller provides another. */
export const FADE_UP = new InjectionToken<typeof fadeUp>('FADE_UP', { factory: () => fadeUp });

/**
 * Makes the children of a container (a grid of cards, a row of tiles) enter one after another when it first appears.
 *
 * ```html
 * <ul appFadeUp class="grid"> @for (card of cards(); track card.id) { <li>{{ card.name }}</li> } </ul>
 * ```
 *
 * It plays once, when the container is drawn; what is added later is the business of `appAutoAnimate`. With reduced motion the children stay
 * where they are (`fadeUp` does not move them). `appFadeUpTarget` names, with a selector, the elements to animate instead of the direct children.
 */
@Directive({ selector: '[appFadeUp]' })
export class FadeUpDirective {
  /** Options of `fadeUp` (offset, duration, gap, delay, spring); the attribute alone keeps its defaults. */
  readonly appFadeUp = input<FadeUpOptions | ''>('');
  /** A selector for the elements to animate (empty: the direct children of the container). */
  readonly appFadeUpTarget = input('');

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const play = inject(FADE_UP);
    afterNextRender(() => {
      const selector = this.appFadeUpTarget();
      const items = selector ? host.querySelectorAll(selector) : host.children;
      const options = this.appFadeUp();
      void play(items, options === '' ? {} : options);
    });
  }
}
