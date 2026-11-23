import { HttpErrorResponse } from '@angular/common/http';

/** The most the server takes in an instruction. */
export const MAX_INSTRUCTION = 1000;

/**
 * What the control says when `POST .../motion/revise` fails, told apart by status. `hasBlock` is whether the page on the screen
 * still has a timeline block: a `422` for a page without one is a different thing from a timeline that did not work out.
 * `400`, `409` and `503` keep the server's own words (as «Write another page» does); a missing page points to the generate button.
 */
export function reviseProblem(e: unknown, hasBlock: boolean): string {
  const err = e as HttpErrorResponse;
  const said = err?.error?.error?.message ?? err?.error?.message ?? '';
  switch (err?.status) {
    case 404:
      return $localize`:@@motion.revise.noPage:There is no page yet: write the page first.`;
    case 422:
      return hasBlock
        ? `${said || $localize`:@@motion.revise.noTimeline:No timeline that works came out.`} ${$localize`:@@motion.revise.tryAgain:Try again or say it differently.`}`
        : $localize`:@@motion.revise.ownScript:This page moves with its own script: write another page instead.`;
    default:
      return said || err?.message || $localize`:@@motion.revise.failed:The motion could not be changed.`;
  }
}
