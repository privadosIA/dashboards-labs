import { afterNextRender, Directive, ElementRef, inject } from '@angular/core';

/**
 * Puts the focus on its element once it is drawn: for a field that appears because the person asked for it (a rename in place). The `autofocus`
 * attribute is not used, because browsers read it when a page loads, not when an element is added to it.
 */
@Directive({ selector: '[moFocusOnCreate]' })
export class FocusOnCreateDirective {
  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => element.focus());
  }
}
