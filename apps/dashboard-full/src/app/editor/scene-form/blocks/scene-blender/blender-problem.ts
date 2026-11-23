import { HttpErrorResponse } from '@angular/common/http';

/** The most the server takes in an idea, and the range of a scene's length in seconds. */
export const MAX_IDEA = 2000;
export const MIN_SECONDS = 0.5;
export const MAX_SECONDS = 600;

export type BlenderCall = 'write' | 'save' | 'preview';

/**
 * A failed request as an `HttpErrorResponse` whose body can be read: the preview asks for an image, so the server's JSON error arrives as
 * a Blob and is read here.
 */
export async function readableError(e: unknown): Promise<unknown> {
  const err = e as HttpErrorResponse;
  if (typeof Blob === 'undefined' || !(err?.error instanceof Blob)) return e;
  try {
    return new HttpErrorResponse({ status: err.status, statusText: err.statusText, error: JSON.parse(await err.error.text()) });
  } catch {
    return new HttpErrorResponse({ status: err.status, statusText: err.statusText });
  }
}

/**
 * What the section says when one of the operations fails, told apart by status. `400`, `409` and `503` keep the words of the server (for
 * a save they are the faults by their place in the JSON; for a missing Blender they carry how to install it), `404` says to write the
 * scene first and `422` carries the last problem with a hint to try again.
 */
export function blenderProblem(e: unknown, call: BlenderCall): string {
  const err = e as HttpErrorResponse;
  const said = err?.error?.error?.message ?? err?.error?.message ?? '';
  switch (err?.status) {
    case 404:
      return $localize`:@@blender.noScene:There is no description yet: write the scene first.`;
    case 422:
      return `${said || $localize`:@@blender.noValid:No description that passes the checks came out.`} ${$localize`:@@blender.tryAgain:Try again or say it differently.`}`;
    case 503:
      return said || (call === 'preview' ? $localize`:@@blender.noBlender:Blender is needed to draw the preview.` : $localize`:@@blender.noModel:There is no model to write the scene.`);
    default:
      return said || err?.message || $localize`:@@blender.failed:The operation could not be completed.`;
  }
}

/** What is wrong with a text that should be JSON (where it breaks, when the browser says), or '' when it parses to an object. */
export function jsonProblem(text: string): string {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    const at = /position (\d+)/.exec(message);
    if (at) {
      const before = text.slice(0, Number(at[1]));
      const line = before.split('\n').length;
      const column = Number(at[1]) - before.lastIndexOf('\n');
      return $localize`:@@blender.badJsonAt:The text is not valid JSON: it breaks at line ${line}:line:, column ${column}:column:.`;
    }
    return $localize`:@@blender.badJson:The text is not valid JSON.`;
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? '' : $localize`:@@blender.notObject:The description must be a JSON object.`;
}
