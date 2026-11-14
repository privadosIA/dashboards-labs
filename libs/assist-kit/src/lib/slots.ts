import type { TemplatePortal } from '@angular/cdk/portal';
import { InjectionToken, signal } from '@angular/core';

/**
 * Places the page lets the picker put its content in: the picker offers its form to add an external provider here, so that the page can draw it where it wants and not under the
 * picker. Without it (a picker with no such place, a spec) the picker draws its own content where it is.
 */
export class AssistSlots {
  /** The form to add an external provider, when the picker wants it shown. */
  readonly add = signal<TemplatePortal | null>(null);
}

export const ASSIST_SLOTS = new InjectionToken<AssistSlots>('ASSIST_SLOTS');
