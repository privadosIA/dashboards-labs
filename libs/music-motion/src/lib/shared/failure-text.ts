import { AnimationFailure } from '@lab/animation-core';
import type { Texts } from '../core/texts';

/** What a screen says about a failed call: our sentence by kind, then the server's own words (or the error's). */
export function failureText(e: unknown, t: Texts): string {
  if (e instanceof AnimationFailure) return `${t.failure[e.kind]} ${e.reason}`.trim();
  return `${t.failure.other} ${e instanceof Error ? e.message : String(e)}`.trim();
}
