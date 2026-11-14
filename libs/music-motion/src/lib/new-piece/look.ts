import type { Reference } from '@lab/animation-core';

/**
 * The look a new animation starts from, chosen in the first step: nothing, a reference (its style is made, or reused, when the
 * animation is made), a style of the server, or an own style kept in the browser.
 */
export type Look =
  | { readonly kind: 'none' }
  | { readonly kind: 'reference'; readonly reference: Reference }
  | { readonly kind: 'style'; readonly presetId: string; readonly name: string }
  | { readonly kind: 'own'; readonly id: string; readonly name: string };

export const NO_LOOK: Look = { kind: 'none' };

/** The name to say a look by. */
export function lookName(look: Look): string {
  switch (look.kind) {
    case 'reference':
      return look.reference.title;
    case 'style':
    case 'own':
      return look.name;
    default:
      return '';
  }
}
